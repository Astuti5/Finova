-- Run AFTER 001_init.sql. Adds: admin-approved invites, DEMO payments, hash-chained simulated ledger.
alter table circle_members add column role text not null default 'member' check (role in ('admin','member'));
update circle_members m set role='admin' from savings_circles c where c.id=m.circle_id and c.owner_id=m.user_id;
alter table savings_circles add column invite_expires_at timestamptz not null default now()+interval '7 days', add column invite_revoked boolean not null default false;
create function is_circle_admin(c uuid) returns boolean language sql security definer stable set search_path=public as $$ select exists(select 1 from circle_members where circle_id=c and user_id=auth.uid() and role='admin') $$;

create table join_requests(circle_id uuid references savings_circles on delete cascade, user_id uuid references auth.users on delete cascade, label text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')), created_at timestamptz not null default now(), primary key(circle_id,user_id));
alter table join_requests enable row level security;
create policy jr_sel on join_requests for select using (user_id=auth.uid() or is_circle_admin(circle_id));

create table payments(id uuid primary key default gen_random_uuid(), demo_ref text not null unique, user_id uuid not null references auth.users, circle_id uuid not null references savings_circles,
  amount_paise bigint not null check (amount_paise>0), method text not null check (method in ('gpay','phonepe','paytm')), status text not null check (status in ('pending','success','failed')),
  cycle_no int, idem_key text not null, is_demo boolean not null default true, created_at timestamptz not null default now(), unique(user_id,idem_key));
alter table payments enable row level security;
create policy pay_sel on payments for select using (user_id=auth.uid());
drop policy k_ins on contributions; -- contributions can now only be created by the payment functions below

alter table ledger_records add column circle_id uuid references savings_circles, add column payment_id uuid references payments, add column seq bigint, add column prev_hash text, add column payload jsonb;
drop policy lr_sel on ledger_records;
create policy lr_sel on ledger_records for select using (circle_id is not null and is_member(circle_id));
create unique index on ledger_records(circle_id,seq);
create function block_ledger_change() returns trigger language plpgsql as $$ begin raise exception 'ledger is append-only'; end $$;
create trigger ledger_immutable before update or delete on ledger_records for each row execute function block_ledger_change();

create or replace function create_circle(p_name text, p_contribution_paise bigint) returns uuid language plpgsql security definer set search_path=public as $$
declare cid uuid; begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  insert into savings_circles(name,contribution_paise,owner_id) values(trim(p_name),p_contribution_paise,auth.uid()) returning id into cid;
  insert into circle_members(circle_id,user_id,role) values(cid,auth.uid(),'admin');
  insert into audit_logs(actor_id,action,detail) values(auth.uid(),'circle_created',jsonb_build_object('circle',cid)); return cid; end $$;

-- A valid code only creates a join REQUEST; an admin must approve. Max 10 attempts/hour/user.
create or replace function join_circle(p_code text) returns uuid language plpgsql security definer set search_path=public as $$
declare cid uuid; em text; begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  if (select count(*) from audit_logs where actor_id=auth.uid() and action='join_attempt' and created_at>now()-interval '1 hour')>=10 then raise exception 'rate limited'; end if;
  insert into audit_logs(actor_id,action) values(auth.uid(),'join_attempt');
  select id into cid from savings_circles where invite_code=upper(p_code) and not invite_revoked and invite_expires_at>now();
  if cid is null then raise exception 'invalid code'; end if;
  if exists(select 1 from circle_members where circle_id=cid and user_id=auth.uid()) then return cid; end if;
  select email into em from auth.users where id=auth.uid();
  insert into join_requests(circle_id,user_id,label) values(cid,auth.uid(),left(em,2)||'***'||substr(em,position('@' in em))) on conflict do nothing;
  return cid; end $$;

create function review_join(p_circle uuid, p_user uuid, p_approve boolean) returns void language plpgsql security definer set search_path=public as $$
begin
  if not is_circle_admin(p_circle) then raise exception 'forbidden'; end if;
  update join_requests set status=case when p_approve then 'approved' else 'rejected' end where circle_id=p_circle and user_id=p_user and status='pending';
  if not found then raise exception 'no pending request'; end if;
  if p_approve then insert into circle_members(circle_id,user_id) values(p_circle,p_user) on conflict do nothing; end if;
  insert into audit_logs(actor_id,action,detail) values(auth.uid(),'join_reviewed',jsonb_build_object('circle',p_circle,'user',p_user,'approved',p_approve)); end $$;

create function rotate_invite(p_circle uuid) returns text language plpgsql security definer set search_path=public,extensions as $$
declare c text; begin
  if not is_circle_admin(p_circle) then raise exception 'forbidden'; end if;
  update savings_circles set invite_code=upper(substr(encode(gen_random_bytes(6),'hex'),1,8)), invite_expires_at=now()+interval '7 days', invite_revoked=false where id=p_circle returning invite_code into c;
  return c; end $$;

-- internal: records a successful payment as a contribution + appends to the hash chain
create function _record(p_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare p payments; cyc int; prev text; sq bigint; pl jsonb; begin
  select * into p from payments where id=p_id;
  perform pg_advisory_xact_lock(hashtext(p.circle_id::text));
  select count(*)+1 into cyc from contributions where circle_id=p.circle_id and user_id=p.user_id;
  insert into contributions(circle_id,user_id,cycle_no,amount_paise,status) values(p.circle_id,p.user_id,cyc,p.amount_paise,'recorded');
  update payments set cycle_no=cyc where id=p.id;
  select seq,record_hash into sq,prev from ledger_records where circle_id=p.circle_id order by seq desc limit 1;
  sq:=coalesce(sq,0)+1; prev:=coalesce(prev,repeat('0',64));
  pl:=jsonb_build_object('payment_ref',p.demo_ref,'user',p.user_id,'circle',p.circle_id,'amount_paise',p.amount_paise,'cycle',cyc,'method',p.method,'demo',true);
  insert into ledger_records(user_id,circle_id,payment_id,seq,prev_hash,payload,record_hash,simulated)
    values(p.user_id,p.circle_id,p.id,sq,prev,pl,encode(sha256(convert_to(prev||pl::text,'UTF8')),'hex'),true); end $$;

-- DEMO payment. Amount comes from the circle row, never from the client. Idempotent per (user, key).
create function pay_contribution(p_circle uuid, p_method text, p_scenario text, p_key text) returns payments language plpgsql security definer set search_path=public,extensions as $$
declare c savings_circles; p payments; begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  if not is_member(p_circle) then raise exception 'forbidden'; end if;
  if p_method not in ('gpay','phonepe','paytm') or p_scenario not in ('success','failed','pending') or length(p_key) not between 8 and 64 then raise exception 'bad input'; end if;
  select * into p from payments where user_id=auth.uid() and idem_key=p_key;
  if found then return p; end if;
  select * into c from savings_circles where id=p_circle;
  insert into payments(demo_ref,user_id,circle_id,amount_paise,method,status,idem_key)
    values('DEMO-'||upper(substr(encode(gen_random_bytes(5),'hex'),1,10)),auth.uid(),p_circle,c.contribution_paise,p_method,p_scenario::text,p_key) returning * into p;
  if p_scenario='success' then perform _record(p.id); select * into p from payments where id=p.id; end if;
  return p; end $$;

create function confirm_payment(p_id uuid) returns payments language plpgsql security definer set search_path=public as $$
declare p payments; begin
  select * into p from payments where id=p_id and user_id=auth.uid() for update;
  if not found or p.status<>'pending' then raise exception 'not pending'; end if;
  update payments set status='success' where id=p_id; perform _record(p_id);
  select * into p from payments where id=p_id; return p; end $$;

create function verify_chain(p_circle uuid) returns table(valid boolean, checked int, broken_seq bigint) language plpgsql security definer stable set search_path=public as $$
declare r record; prev text:=repeat('0',64); n int:=0; begin
  if not is_member(p_circle) then raise exception 'forbidden'; end if;
  for r in select * from ledger_records where circle_id=p_circle order by seq loop
    n:=n+1;
    if r.seq<>n or r.prev_hash<>prev or r.record_hash<>encode(sha256(convert_to(prev||r.payload::text,'UTF8')),'hex') then return query select false,n,r.seq; return; end if;
    prev:=r.record_hash; end loop;
  return query select true,n,null::bigint; end $$;

revoke all on function _record(uuid), block_ledger_change() from public, anon, authenticated;
revoke all on function review_join, rotate_invite, pay_contribution, confirm_payment, verify_chain, join_circle, create_circle from public, anon;
grant execute on function review_join, rotate_invite, pay_contribution, confirm_payment, verify_chain, join_circle, create_circle to authenticated;
