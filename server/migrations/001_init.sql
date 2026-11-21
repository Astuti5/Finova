-- Finova core schema. Money is stored as integer paise. RLS enabled on every table.
create extension if not exists pgcrypto;
create table profiles(id uuid primary key references auth.users on delete cascade, full_name text check (char_length(full_name)<=80), role text not null default 'user' check (role in ('user','admin')), created_at timestamptz not null default now());
create table savings_circles(id uuid primary key default gen_random_uuid(), name text not null check (char_length(name) between 3 and 60), contribution_paise bigint not null check (contribution_paise>0),
  invite_code text not null unique default upper(substr(encode(gen_random_bytes(6),'hex'),1,8)), owner_id uuid not null references auth.users, created_at timestamptz not null default now());
create table circle_members(circle_id uuid references savings_circles on delete cascade, user_id uuid references auth.users on delete cascade, joined_at timestamptz not null default now(), primary key(circle_id,user_id));
create table contributions(id uuid primary key default gen_random_uuid(), circle_id uuid not null references savings_circles, user_id uuid not null references auth.users, cycle_no int not null check (cycle_no>0),
  amount_paise bigint not null check (amount_paise>0), status text not null default 'recorded' check (status in ('pending','recorded')), created_at timestamptz not null default now(), unique(circle_id,user_id,cycle_no));
create table loans(id uuid primary key default gen_random_uuid(), circle_id uuid not null references savings_circles, user_id uuid not null references auth.users, amount_paise bigint not null check (amount_paise>0),
  duration_months int not null check (duration_months between 1 and 60), status text not null default 'pending' check (status in ('pending','approved','rejected','closed')), created_at timestamptz not null default now());
create table repayments(id uuid primary key default gen_random_uuid(), loan_id uuid not null references loans, user_id uuid not null references auth.users, amount_paise bigint not null check (amount_paise>0), created_at timestamptz not null default now());
create table transactions(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users, kind text not null, amount_paise bigint not null, flagged boolean not null default false, created_at timestamptz not null default now());
create table notifications(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users, body text not null, read boolean not null default false, created_at timestamptz not null default now());
create table audit_logs(id bigserial primary key, actor_id uuid, action text not null, detail jsonb, created_at timestamptz not null default now());
create table model_predictions(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users, score numeric, is_demo boolean not null default true, created_at timestamptz not null default now());
create table ledger_records(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users, record_hash text not null, simulated boolean not null default true, tx_hash text, created_at timestamptz not null default now());
create index on circle_members(user_id); create index on contributions(user_id); create index on loans(user_id);

create function is_member(c uuid) returns boolean language sql security definer stable set search_path=public as $$ select exists(select 1 from circle_members where circle_id=c and user_id=auth.uid()) $$;
create function is_admin() returns boolean language sql security definer stable set search_path=public as $$ select exists(select 1 from profiles where id=auth.uid() and role='admin') $$;

do $$ declare t text; begin foreach t in array array['profiles','savings_circles','circle_members','contributions','loans','repayments','transactions','notifications','audit_logs','model_predictions','ledger_records'] loop
  execute format('alter table %I enable row level security', t); end loop; end $$;

create policy p_self on profiles for select using (id=auth.uid() or is_admin());
create policy p_upd on profiles for update using (id=auth.uid()) with check (id=auth.uid() and role=(select role from profiles where id=auth.uid()));
create policy c_sel on savings_circles for select using (is_member(id));
create policy m_sel on circle_members for select using (is_member(circle_id));
create policy k_sel on contributions for select using (user_id=auth.uid() or is_member(circle_id));
create policy k_ins on contributions for insert with check (user_id=auth.uid() and is_member(circle_id) and status='recorded');
create policy l_sel on loans for select using (user_id=auth.uid());
create policy l_ins on loans for insert with check (user_id=auth.uid() and is_member(circle_id) and status='pending');
create policy r_sel on repayments for select using (user_id=auth.uid());
create policy t_sel on transactions for select using (user_id=auth.uid());
create policy n_sel on notifications for select using (user_id=auth.uid());
create policy a_sel on audit_logs for select using (is_admin());
create policy mp_sel on model_predictions for select using (user_id=auth.uid());
create policy lr_sel on ledger_records for select using (user_id=auth.uid());
-- No client UPDATE/DELETE policies on financial tables: records are append-only for users.

create function handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$ begin insert into profiles(id) values(new.id); return new; end $$;
create trigger on_signup after insert on auth.users for each row execute function handle_new_user();

create function create_circle(p_name text, p_contribution_paise bigint) returns uuid language plpgsql security definer set search_path=public as $$
declare cid uuid; begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  insert into savings_circles(name,contribution_paise,owner_id) values(trim(p_name),p_contribution_paise,auth.uid()) returning id into cid;
  insert into circle_members(circle_id,user_id) values(cid,auth.uid());
  insert into audit_logs(actor_id,action,detail) values(auth.uid(),'circle_created',jsonb_build_object('circle',cid)); return cid; end $$;
create function join_circle(p_code text) returns uuid language plpgsql security definer set search_path=public as $$
declare cid uuid; begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  select id into cid from savings_circles where invite_code=upper(p_code); if cid is null then raise exception 'invalid code'; end if;
  insert into circle_members(circle_id,user_id) values(cid,auth.uid()) on conflict do nothing;
  insert into audit_logs(actor_id,action,detail) values(auth.uid(),'circle_joined',jsonb_build_object('circle',cid)); return cid; end $$;
revoke all on function create_circle, join_circle from public; grant execute on function create_circle, join_circle to authenticated;
