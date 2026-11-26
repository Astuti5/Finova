alter table savings_circles add column started_at timestamptz, add column cycle_days int not null default 30 check (cycle_days between 1 and 366),
  add column interest_bps int not null default 0 check (interest_bps between 0 and 3000); -- monthly simple interest, 100 = 1% per month
alter table circle_members add column payout_pos int;
alter table loans add column approvals_needed int not null default 1 check (approvals_needed between 1 and 2), add column total_paise bigint, add column disbursed_at timestamptz;
alter table loan_installments drop constraint loan_installments_status_check;
alter table loan_installments add constraint loan_installments_status_check check (status in ('due','overdue','paid'));
alter table payments add column gateway_ref text;

create table loan_approvals(loan_id uuid references loans on delete cascade, admin_id uuid references auth.users, created_at timestamptz not null default now(), primary key(loan_id, admin_id));
alter table loan_approvals enable row level security;
create policy la_sel on loan_approvals for select using (exists(select 1 from loans l where l.id=loan_id and (l.user_id=auth.uid() or is_circle_admin(l.circle_id))));
grant select on loan_approvals to authenticated;

create table payouts(id uuid primary key default gen_random_uuid(), circle_id uuid not null references savings_circles, cycle_no int not null check (cycle_no>0),
  recipient_id uuid not null references auth.users, amount_paise bigint not null check (amount_paise>0), created_by uuid not null references auth.users,
  created_at timestamptz not null default now(), unique(circle_id, cycle_no));
alter table payouts enable row level security;
create policy po_sel on payouts for select using (is_member(circle_id));
grant select on payouts to authenticated;

create table app_config(key text primary key, value text not null);
insert into app_config values('demo_mode','true') on conflict do nothing;
alter table app_config enable row level security; -- no policy: not readable through the API. Only the functions below touch it.
-- To go live with a real gateway:  update app_config set value='false' where key='demo_mode';

------------------------------------------------------------------ B. ledger hardening
create function block_ledger_truncate() returns trigger language plpgsql as $$ begin raise exception 'ledger is append-only'; end $$;
create trigger ledger_no_truncate before truncate on ledger_records for each statement execute function block_ledger_truncate();
create trigger anchors_immutable before update or delete on ledger_anchors for each row execute function block_ledger_change();
create trigger anchors_no_truncate before truncate on ledger_anchors for each statement execute function block_ledger_truncate();
revoke update, delete, truncate on ledger_records, ledger_anchors from anon, authenticated, service_role;
-- NOTE: the database owner (postgres) can still disable triggers. That is exactly the case the on-chain checkpoints cover.

------------------------------------------------------------------ A. verify_chain with checkpoint cross-check
drop function verify_chain(uuid);
create function _verify_chain(p_circle uuid) returns table(valid boolean, checked int, broken_seq bigint, reason text, anchored_seq bigint)
language plpgsql security definer stable set search_path=public as $$
declare r record; a record; prev text:=repeat('0',64); n int:=0; mx bigint; begin
  for r in select * from ledger_records where circle_id=p_circle order by seq loop
    n:=n+1;
    if r.seq<>n then return query select false,n,r.seq,'sequence gap or reordering'::text,null::bigint; return; end if;
    if r.prev_hash<>prev then return query select false,n,r.seq,'link to the previous entry is broken'::text,null::bigint; return; end if;
    if r.record_hash<>encode(sha256(convert_to(prev||r.payload::text,'UTF8')),'hex') then return query select false,n,r.seq,'entry contents do not match its hash'::text,null::bigint; return; end if;
    prev:=r.record_hash;
  end loop;
  -- every checkpoint that was published must still be there, unchanged. Catches deleted tail entries and a fully re-computed history.
  for a in select seq, record_hash from ledger_anchors where circle_id=p_circle order by seq loop
    if a.seq>n or not exists(select 1 from ledger_records l where l.circle_id=p_circle and l.seq=a.seq and l.record_hash=a.record_hash) then
      return query select false,n,a.seq,'entries covered by a published checkpoint were removed or rewritten'::text,a.seq; return; end if;
  end loop;
  select max(seq) into mx from ledger_anchors where circle_id=p_circle;
  return query select true,n,null::bigint,null::text,mx;
end $$;
create function verify_chain(p_circle uuid) returns table(valid boolean, checked int, broken_seq bigint, reason text, anchored_seq bigint)
language plpgsql security definer stable set search_path=public as $$
begin if not is_member(p_circle) then raise exception 'forbidden'; end if; return query select * from _verify_chain(p_circle); end $$;

create function _circles_needing_anchor() returns table(circle_id uuid, seq bigint, record_hash text) language sql security definer stable set search_path=public as $$
  select h.circle_id, h.seq, h.record_hash from (select distinct on (circle_id) circle_id, seq, record_hash from ledger_records order by circle_id, seq desc) h
  where not exists(select 1 from ledger_anchors a where a.circle_id=h.circle_id and a.seq>=h.seq) $$;

------------------------------------------------------------------ helpers
create function is_demo_mode() returns boolean language sql stable security definer set search_path=public as $$ select coalesce((select value='true' from app_config where key='demo_mode'),true) $$;
create function _demo_mode() returns boolean language sql stable security definer set search_path=public as $$ select is_demo_mode() $$;

create function circle_cycle(p_circle uuid) returns int language plpgsql stable security definer set search_path=public as $$
declare c savings_circles; n int; begin
  if not is_member(p_circle) then raise exception 'forbidden'; end if;
  select * into c from savings_circles where id=p_circle;
  if c.started_at is null then return null; end if;
  select count(*) into n from circle_members where circle_id=p_circle;
  return least(floor(extract(epoch from (now()-c.started_at))/86400.0/c.cycle_days)::int+1, n); end $$;

-- money currently in the pool = contributions + repayments - payouts - loan principal handed out
create function circle_balance(p_circle uuid) returns bigint language plpgsql stable security definer set search_path=public as $$
begin
  if not is_member(p_circle) then raise exception 'forbidden'; end if;
  return coalesce((select sum(amount_paise) from contributions where circle_id=p_circle and status='recorded'),0)
       + coalesce((select sum(r.amount_paise) from repayments r join loans l on l.id=r.loan_id where l.circle_id=p_circle),0)
       - coalesce((select sum(amount_paise) from payouts where circle_id=p_circle),0)
       - coalesce((select sum(amount_paise) from loans where circle_id=p_circle and status in ('approved','closed')),0); end $$;

------------------------------------------------------------------ C. roles and admin approvals
create function set_member_role(p_circle uuid, p_user uuid, p_role text) returns void language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from savings_circles where id=p_circle and owner_id=auth.uid()) then raise exception 'forbidden'; end if;
  if p_role not in ('admin','member') then raise exception 'bad input'; end if;
  if p_user=auth.uid() and p_role<>'admin' then raise exception 'owner stays admin'; end if;
  update circle_members set role=p_role where circle_id=p_circle and user_id=p_user;
  if not found then raise exception 'not a member'; end if;
  insert into audit_logs(actor_id,action,detail) values(auth.uid(),'role_changed',jsonb_build_object('circle',p_circle,'user',p_user,'role',p_role)); end $$;

create function list_members(p_circle uuid) returns table(user_id uuid, role text, payout_pos int, label text, joined_at timestamptz) language plpgsql stable security definer set search_path=public as $$
begin
  if not is_circle_admin(p_circle) then raise exception 'forbidden'; end if;
  return query select m.user_id, m.role, m.payout_pos, (left(u.email,2)||'***'||substr(u.email,position('@' in u.email)))::text, m.joined_at
    from circle_members m join auth.users u on u.id=m.user_id where m.circle_id=p_circle order by m.joined_at; end $$;

------------------------------------------------------------------ D. invite code only for admins
create function get_invite(p_circle uuid) returns table(code text, expires_at timestamptz, revoked boolean) language plpgsql stable security definer set search_path=public as $$
begin
  if not is_circle_admin(p_circle) then raise exception 'forbidden'; end if;
  return query select c.invite_code, c.invite_expires_at, c.invite_revoked from savings_circles c where c.id=p_circle; end $$;
revoke select on savings_circles from anon, authenticated;
grant select (id,name,contribution_paise,owner_id,created_at,invite_expires_at,invite_revoked,started_at,cycle_days,interest_bps) on savings_circles to authenticated;

------------------------------------------------------------------ E. circle rules: start, cycles, payouts
create function start_circle(p_circle uuid, p_cycle_days int default 30, p_interest_bps int default 0) returns void language plpgsql security definer set search_path=public as $$
begin
  if not is_circle_admin(p_circle) then raise exception 'forbidden'; end if;
  if p_cycle_days not between 1 and 366 or p_interest_bps not between 0 and 3000 then raise exception 'bad input'; end if;
  perform pg_advisory_xact_lock(hashtext(p_circle::text));
  if exists(select 1 from savings_circles where id=p_circle and started_at is not null) then raise exception 'already started'; end if;
  if (select count(*) from circle_members where circle_id=p_circle)<2 then raise exception 'need at least 2 members'; end if;
  with o as (select user_id, row_number() over (order by random()) rn from circle_members where circle_id=p_circle)
    update circle_members m set payout_pos=o.rn from o where m.circle_id=p_circle and m.user_id=o.user_id;
  update savings_circles set started_at=now(), cycle_days=p_cycle_days, interest_bps=p_interest_bps where id=p_circle;
  insert into audit_logs(actor_id,action,detail) values(auth.uid(),'circle_started',jsonb_build_object('circle',p_circle,'cycle_days',p_cycle_days,'interest_bps',p_interest_bps)); end $$;

create or replace function review_join(p_circle uuid, p_user uuid, p_approve boolean) returns void language plpgsql security definer set search_path=public as $$
begin
  if not is_circle_admin(p_circle) then raise exception 'forbidden'; end if;
  if p_approve and exists(select 1 from savings_circles where id=p_circle and started_at is not null) then raise exception 'circle already started'; end if;
  update join_requests set status=case when p_approve then 'approved' else 'rejected' end where circle_id=p_circle and user_id=p_user and status='pending';
  if not found then raise exception 'no pending request'; end if;
  if p_approve then insert into circle_members(circle_id,user_id) values(p_circle,p_user) on conflict do nothing; end if;
  insert into audit_logs(actor_id,action,detail) values(auth.uid(),'join_reviewed',jsonb_build_object('circle',p_circle,'user',p_user,'approved',p_approve)); end $$;

create function record_payout(p_circle uuid) returns payouts language plpgsql security definer set search_path=public as $$
declare c savings_circles; cyc int; nxt int; n int; paid int; rec uuid; amt bigint; po payouts; begin
  if not is_circle_admin(p_circle) then raise exception 'forbidden'; end if;
  perform pg_advisory_xact_lock(hashtext(p_circle::text));
  select * into c from savings_circles where id=p_circle;
  cyc:=circle_cycle(p_circle); if cyc is null then raise exception 'circle not started'; end if;
  select count(*) into n from circle_members where circle_id=p_circle;
  nxt:=coalesce((select max(cycle_no) from payouts where circle_id=p_circle),0)+1;
  if nxt>n then raise exception 'all payouts done'; end if;
  if nxt>cyc then raise exception 'next payout cycle has not started'; end if;
  select count(*) into paid from contributions where circle_id=p_circle and cycle_no=nxt and status='recorded';
  if paid<n then raise exception 'cycle not fully funded'; end if;
  select user_id into rec from circle_members where circle_id=p_circle and payout_pos=nxt;
  amt:=c.contribution_paise*n;
  if amt>circle_balance(p_circle) then raise exception 'pool has insufficient funds'; end if;
  insert into payouts(circle_id,cycle_no,recipient_id,amount_paise,created_by) values(p_circle,nxt,rec,amt,auth.uid()) returning * into po;
  perform _append_ledger(p_circle, rec, null, jsonb_build_object('kind','payout','payment_ref','PAYOUT-'||upper(substr(po.id::text,1,8)),'user',rec,'circle',p_circle,'cycle',nxt,'amount_paise',amt,'demo',_demo_mode()));
  insert into audit_logs(actor_id,action,detail) values(auth.uid(),'payout_recorded',jsonb_build_object('circle',p_circle,'cycle',nxt,'recipient',rec));
  return po; end $$;

------------------------------------------------------------------ G. payments: gateway decides, not the browser
create or replace function _record(p_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare p payments; cyc int; begin
  select * into p from payments where id=p_id;
  perform pg_advisory_xact_lock(hashtext(p.circle_id::text));
  cyc:=circle_cycle(p.circle_id); if cyc is null then raise exception 'circle not started'; end if;
  begin insert into contributions(circle_id,user_id,cycle_no,amount_paise,status) values(p.circle_id,p.user_id,cyc,p.amount_paise,'recorded');
  exception when unique_violation then raise exception 'already contributed this cycle'; end;
  update payments set cycle_no=cyc where id=p.id;
  perform _append_ledger(p.circle_id,p.user_id,p.id,jsonb_build_object('payment_ref',p.demo_ref,'user',p.user_id,'circle',p.circle_id,'amount_paise',p.amount_paise,'cycle',cyc,'method',p.method,'demo',p.is_demo)); end $$;

create or replace function _record_repayment(p_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare p payments; i loan_installments; begin
  select * into p from payments where id=p_id;
  perform pg_advisory_xact_lock(hashtext(p.circle_id::text));
  select * into i from loan_installments where id=p.installment_id for update;
  if i.status='paid' then raise exception 'already paid'; end if;
  update loan_installments set status='paid', paid_at=now() where id=i.id;
  insert into repayments(loan_id,user_id,amount_paise) values(i.loan_id,p.user_id,p.amount_paise);
  if not exists(select 1 from loan_installments where loan_id=i.loan_id and status<>'paid') then update loans set status='closed' where id=i.loan_id; end if;
  perform _append_ledger(p.circle_id,p.user_id,p.id,jsonb_build_object('kind','repayment','payment_ref',p.demo_ref,'user',p.user_id,'circle',p.circle_id,'loan',i.loan_id,'installment_no',i.no,'amount_paise',p.amount_paise,'method',p.method,'demo',p.is_demo)); end $$;

create or replace function pay_contribution(p_circle uuid, p_method text, p_scenario text, p_key text) returns payments language plpgsql security definer set search_path=public,extensions as $$
declare c savings_circles; p payments; cyc int; demo boolean; begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  if not is_member(p_circle) then raise exception 'forbidden'; end if;
  if p_method not in ('gpay','phonepe','paytm') or p_scenario not in ('success','failed','pending') or length(p_key) not between 8 and 64 then raise exception 'bad input'; end if;
  select * into p from payments where user_id=auth.uid() and idem_key=p_key;
  if found then return p; end if;
  cyc:=circle_cycle(p_circle); if cyc is null then raise exception 'circle not started'; end if;
  if exists(select 1 from contributions where circle_id=p_circle and user_id=auth.uid() and cycle_no=cyc) then raise exception 'already contributed this cycle'; end if;
  if exists(select 1 from payments where circle_id=p_circle and user_id=auth.uid() and kind='contribution' and status='pending') then raise exception 'payment pending'; end if;
  demo:=_demo_mode(); select * into c from savings_circles where id=p_circle;
  insert into payments(demo_ref,user_id,circle_id,amount_paise,method,status,idem_key,is_demo)
    values(case when demo then 'DEMO-' else 'PAY-' end||upper(substr(encode(gen_random_bytes(5),'hex'),1,10)),auth.uid(),p_circle,c.contribution_paise,p_method,case when demo then p_scenario else 'pending' end,p_key,demo) returning * into p;
  if p.status='success' then perform _record(p.id); select * into p from payments where id=p.id; end if;
  return p; end $$;

create or replace function repay_installment(p_installment uuid, p_method text, p_scenario text, p_key text) returns payments language plpgsql security definer set search_path=public,extensions as $$
declare i loan_installments; l loans; p payments; demo boolean; begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  if p_method not in ('gpay','phonepe','paytm') or p_scenario not in ('success','failed','pending') or length(p_key) not between 8 and 64 then raise exception 'bad input'; end if;
  select * into p from payments where user_id=auth.uid() and idem_key=p_key;
  if found then return p; end if;
  select * into i from loan_installments where id=p_installment;
  if not found then raise exception 'forbidden'; end if;
  select * into l from loans where id=i.loan_id;
  if l.user_id<>auth.uid() then raise exception 'forbidden'; end if;
  if l.status<>'approved' or i.status='paid' then raise exception 'not payable'; end if;
  if exists(select 1 from loan_installments where loan_id=i.loan_id and status in ('due','overdue') and no<i.no) then raise exception 'pay earlier installment first'; end if;
  if exists(select 1 from payments where installment_id=i.id and status='pending') then raise exception 'payment pending'; end if;
  demo:=_demo_mode();
  insert into payments(demo_ref,user_id,circle_id,amount_paise,method,status,idem_key,kind,installment_id,is_demo)
    values(case when demo then 'DEMO-' else 'PAY-' end||upper(substr(encode(gen_random_bytes(5),'hex'),1,10)),auth.uid(),l.circle_id,i.amount_paise,p_method,case when demo then p_scenario else 'pending' end,p_key,'repayment',i.id,demo) returning * into p;
  if p.status='success' then perform _record_repayment(p.id); select * into p from payments where id=p.id; end if;
  return p; end $$;

create or replace function confirm_payment(p_id uuid) returns payments language plpgsql security definer set search_path=public as $$
declare p payments; begin
  if not _demo_mode() then raise exception 'payments are confirmed by the payment gateway'; end if;
  select * into p from payments where id=p_id and user_id=auth.uid() for update;
  if not found or p.status<>'pending' then raise exception 'not pending'; end if;
  update payments set status='success' where id=p_id;
  if p.kind='repayment' then perform _record_repayment(p_id); else perform _record(p_id); end if;
  select * into p from payments where id=p_id; return p; end $$;

-- Called ONLY by the payment-webhook Edge Function (service role) after it verified the gateway's signature. Idempotent.
create function settle_payment(p_id uuid, p_status text, p_gateway_ref text) returns payments language plpgsql security definer set search_path=public as $$
declare p payments; begin
  if p_status not in ('success','failed') then raise exception 'bad input'; end if;
  select * into p from payments where id=p_id for update;
  if not found then raise exception 'not found'; end if;
  if p.status<>'pending' then return p; end if;
  update payments set status=p_status, gateway_ref=left(p_gateway_ref,100) where id=p_id;
  if p_status='success' then if p.kind='repayment' then perform _record_repayment(p_id); else perform _record(p_id); end if; end if;
  select * into p from payments where id=p_id; return p; end $$;

------------------------------------------------------------------ F. loans: pool check, interest, two admins, ledger
create or replace function request_loan(p_circle uuid, p_amount_paise bigint, p_months int, p_purpose text) returns loans language plpgsql security definer set search_path=public as $$
declare c savings_circles; l loans; em text; elig int; need int; begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  if not is_member(p_circle) then raise exception 'forbidden'; end if;
  select * into c from savings_circles where id=p_circle;
  if p_amount_paise is null or p_months is null or p_amount_paise<=0 or p_months not between 1 and 12 or p_amount_paise<p_months
     or p_amount_paise>c.contribution_paise*10 or char_length(coalesce(p_purpose,''))>120 then raise exception 'bad input'; end if;
  if exists(select 1 from loans where circle_id=p_circle and user_id=auth.uid() and status in ('pending','approved')) then raise exception 'open loan exists'; end if;
  if p_amount_paise>circle_balance(p_circle) then raise exception 'pool has insufficient funds'; end if;
  select count(*) into elig from circle_members where circle_id=p_circle and role='admin' and user_id<>auth.uid();
  if elig=0 then raise exception 'needs a second admin'; end if; -- nobody else could approve this request
  need:=least(case when p_amount_paise>c.contribution_paise*5 then 2 else 1 end, elig); -- big loans need two different admins
  select email into em from auth.users where id=auth.uid();
  insert into loans(circle_id,user_id,amount_paise,duration_months,status,purpose,label,approvals_needed)
    values(p_circle,auth.uid(),p_amount_paise,p_months,'pending',nullif(trim(p_purpose),''),left(em,2)||'***'||substr(em,position('@' in em)),need) returning * into l;
  insert into audit_logs(actor_id,action,detail) values(auth.uid(),'loan_requested',jsonb_build_object('loan',l.id,'approvals_needed',need));
  return l; end $$;

create or replace function review_loan(p_loan uuid, p_approve boolean) returns loans language plpgsql security definer set search_path=public as $$
declare l loans; c savings_circles; n int; base bigint; k int; cnt int; total bigint; begin
  select * into l from loans where id=p_loan for update;
  if not found then raise exception 'not found'; end if;
  if not is_circle_admin(l.circle_id) then raise exception 'forbidden'; end if;
  if l.user_id=auth.uid() then raise exception 'self-approval not allowed'; end if;
  if l.status<>'pending' then raise exception 'not pending'; end if;
  if not p_approve then
    update loans set status='rejected', reviewed_by=auth.uid(), reviewed_at=now() where id=l.id returning * into l;
    insert into audit_logs(actor_id,action,detail) values(auth.uid(),'loan_reviewed',jsonb_build_object('loan',l.id,'approved',false));
    return l;
  end if;
  insert into loan_approvals(loan_id,admin_id) values(l.id,auth.uid()) on conflict do nothing;
  if not found then raise exception 'you already approved this loan'; end if;
  select count(*) into cnt from loan_approvals where loan_id=l.id;
  if cnt<l.approvals_needed then
    insert into audit_logs(actor_id,action,detail) values(auth.uid(),'loan_approval_recorded',jsonb_build_object('loan',l.id,'have',cnt,'need',l.approvals_needed));
    return l;
  end if;
  perform pg_advisory_xact_lock(hashtext(l.circle_id::text));
  select * into c from savings_circles where id=l.circle_id;
  if l.amount_paise>circle_balance(l.circle_id) then raise exception 'pool has insufficient funds'; end if;
  n:=l.duration_months; total:=l.amount_paise+(l.amount_paise*c.interest_bps*n)/10000; base:=total/n;
  for k in 1..n loop
    insert into loan_installments(loan_id,no,due_date,amount_paise) values(l.id,k,(current_date+make_interval(months=>k))::date,case when k=n then total-base*(n-1) else base end);
  end loop;
  update loans set status='approved', reviewed_by=auth.uid(), reviewed_at=now(), disbursed_at=now(), total_paise=total where id=l.id returning * into l;
  perform _append_ledger(l.circle_id, l.user_id, null, jsonb_build_object('kind','loan_disbursed','payment_ref','LOAN-'||upper(substr(l.id::text,1,8)),'user',l.user_id,'circle',l.circle_id,'loan',l.id,
    'amount_paise',l.amount_paise,'total_repayable_paise',total,'approved_by',(select jsonb_agg(admin_id order by created_at) from loan_approvals where loan_id=l.id),'demo',_demo_mode()));
  insert into audit_logs(actor_id,action,detail) values(auth.uid(),'loan_reviewed',jsonb_build_object('loan',l.id,'approved',true));
  return l; end $$;

create function sweep_overdue(p_circle uuid) returns int language plpgsql security definer set search_path=public as $$
declare n int; begin
  if not is_member(p_circle) then raise exception 'forbidden'; end if;
  update loan_installments i set status='overdue' from loans l where l.id=i.loan_id and l.circle_id=p_circle and l.status='approved' and i.status='due' and i.due_date<current_date;
  get diagnostics n=row_count; return n; end $$;

------------------------------------------------------------------ grants
revoke all on function _verify_chain(uuid), _circles_needing_anchor(), _demo_mode(), block_ledger_truncate(), settle_payment(uuid,text,text) from public, anon, authenticated;
grant execute on function _verify_chain(uuid), _circles_needing_anchor(), settle_payment(uuid,text,text) to service_role;
revoke all on function verify_chain, is_demo_mode, circle_cycle, circle_balance, set_member_role, list_members, get_invite, start_circle, record_payout, sweep_overdue from public, anon;
grant execute on function verify_chain, is_demo_mode, circle_cycle, circle_balance, set_member_role, list_members, get_invite, start_circle, record_payout, sweep_overdue to authenticated;
revoke all on function review_join, request_loan, review_loan, pay_contribution, repay_installment, confirm_payment from public, anon;
grant execute on function review_join, request_loan, review_loan, pay_contribution, repay_installment, confirm_payment to authenticated;
notify pgrst, 'reload schema';
