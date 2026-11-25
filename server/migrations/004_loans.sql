-- Run after 003. Loans: request, admin approval, repayment schedule, DEMO repayments (no real money moves).
alter table loans add column purpose text check (purpose is null or char_length(purpose)<=120), add column label text,
  add column reviewed_by uuid references auth.users, add column reviewed_at timestamptz;
create table loan_installments(id uuid primary key default gen_random_uuid(), loan_id uuid not null references loans on delete cascade, no int not null check (no>0),
  due_date date not null, amount_paise bigint not null check (amount_paise>0), status text not null default 'due' check (status in ('due','paid')), paid_at timestamptz, unique(loan_id,no));
alter table loan_installments enable row level security;
alter table payments add column kind text not null default 'contribution' check (kind in ('contribution','repayment')), add column installment_id uuid references loan_installments;
drop policy l_sel on loans; drop policy l_ins on loans; -- loans are created only by request_loan()
create policy l_sel on loans for select using (user_id=auth.uid() or is_circle_admin(circle_id));
create policy li_sel on loan_installments for select using (exists(select 1 from loans l where l.id=loan_id)); -- loans RLS already limits who can see the loan
grant select on loan_installments to authenticated;

create function _append_ledger(p_circle uuid, p_user uuid, p_payment uuid, pl jsonb) returns void language plpgsql security definer set search_path=public as $$
declare prev text; sq bigint; begin
  perform pg_advisory_xact_lock(hashtext(p_circle::text));
  select seq,record_hash into sq,prev from ledger_records where circle_id=p_circle order by seq desc limit 1;
  sq:=coalesce(sq,0)+1; prev:=coalesce(prev,repeat('0',64));
  insert into ledger_records(user_id,circle_id,payment_id,seq,prev_hash,payload,record_hash,simulated)
    values(p_user,p_circle,p_payment,sq,prev,pl,encode(sha256(convert_to(prev||pl::text,'UTF8')),'hex'),true); end $$;

create or replace function _record(p_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare p payments; cyc int; begin
  select * into p from payments where id=p_id;
  perform pg_advisory_xact_lock(hashtext(p.circle_id::text));
  select count(*)+1 into cyc from contributions where circle_id=p.circle_id and user_id=p.user_id;
  insert into contributions(circle_id,user_id,cycle_no,amount_paise,status) values(p.circle_id,p.user_id,cyc,p.amount_paise,'recorded');
  update payments set cycle_no=cyc where id=p.id;
  perform _append_ledger(p.circle_id,p.user_id,p.id,jsonb_build_object('payment_ref',p.demo_ref,'user',p.user_id,'circle',p.circle_id,'amount_paise',p.amount_paise,'cycle',cyc,'method',p.method,'demo',true)); end $$;

create function _record_repayment(p_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare p payments; i loan_installments; begin
  select * into p from payments where id=p_id;
  perform pg_advisory_xact_lock(hashtext(p.circle_id::text));
  select * into i from loan_installments where id=p.installment_id for update;
  if i.status<>'due' then raise exception 'already paid'; end if;
  update loan_installments set status='paid', paid_at=now() where id=i.id;
  insert into repayments(loan_id,user_id,amount_paise) values(i.loan_id,p.user_id,p.amount_paise);
  if not exists(select 1 from loan_installments where loan_id=i.loan_id and status='due') then update loans set status='closed' where id=i.loan_id; end if;
  perform _append_ledger(p.circle_id,p.user_id,p.id,jsonb_build_object('kind','repayment','payment_ref',p.demo_ref,'user',p.user_id,'circle',p.circle_id,'loan',i.loan_id,'installment_no',i.no,'amount_paise',p.amount_paise,'method',p.method,'demo',true)); end $$;

create function request_loan(p_circle uuid, p_amount_paise bigint, p_months int, p_purpose text) returns loans language plpgsql security definer set search_path=public as $$
declare c savings_circles; l loans; em text; begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  if not is_member(p_circle) then raise exception 'forbidden'; end if;
  select * into c from savings_circles where id=p_circle;
  if p_amount_paise is null or p_months is null or p_amount_paise<=0 or p_months not between 1 and 12 or p_amount_paise<p_months
     or p_amount_paise>c.contribution_paise*10 or char_length(coalesce(p_purpose,''))>120 then raise exception 'bad input'; end if;
  if exists(select 1 from loans where circle_id=p_circle and user_id=auth.uid() and status in ('pending','approved')) then raise exception 'open loan exists'; end if;
  select email into em from auth.users where id=auth.uid();
  insert into loans(circle_id,user_id,amount_paise,duration_months,status,purpose,label)
    values(p_circle,auth.uid(),p_amount_paise,p_months,'pending',nullif(trim(p_purpose),''),left(em,2)||'***'||substr(em,position('@' in em))) returning * into l;
  insert into audit_logs(actor_id,action,detail) values(auth.uid(),'loan_requested',jsonb_build_object('loan',l.id));
  return l; end $$;

create function review_loan(p_loan uuid, p_approve boolean) returns loans language plpgsql security definer set search_path=public as $$
declare l loans; n int; base bigint; k int; begin
  select * into l from loans where id=p_loan for update;
  if not found then raise exception 'not found'; end if;
  if not is_circle_admin(l.circle_id) then raise exception 'forbidden'; end if;
  if l.user_id=auth.uid() then raise exception 'self-approval not allowed'; end if;
  if l.status<>'pending' then raise exception 'not pending'; end if;
  if p_approve then
    n:=l.duration_months; base:=l.amount_paise/n;
    for k in 1..n loop
      insert into loan_installments(loan_id,no,due_date,amount_paise)
        values(l.id,k,(current_date+make_interval(months=>k))::date,case when k=n then l.amount_paise-base*(n-1) else base end);
    end loop;
    update loans set status='approved', reviewed_by=auth.uid(), reviewed_at=now() where id=l.id returning * into l;
  else
    update loans set status='rejected', reviewed_by=auth.uid(), reviewed_at=now() where id=l.id returning * into l;
  end if;
  insert into audit_logs(actor_id,action,detail) values(auth.uid(),'loan_reviewed',jsonb_build_object('loan',l.id,'approved',p_approve));
  return l; end $$;

create function repay_installment(p_installment uuid, p_method text, p_scenario text, p_key text) returns payments language plpgsql security definer set search_path=public,extensions as $$
declare i loan_installments; l loans; p payments; begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  if p_method not in ('gpay','phonepe','paytm') or p_scenario not in ('success','failed','pending') or length(p_key) not between 8 and 64 then raise exception 'bad input'; end if;
  select * into p from payments where user_id=auth.uid() and idem_key=p_key;
  if found then return p; end if;
  select * into i from loan_installments where id=p_installment;
  if not found then raise exception 'forbidden'; end if;
  select * into l from loans where id=i.loan_id;
  if l.user_id<>auth.uid() then raise exception 'forbidden'; end if;
  if l.status<>'approved' or i.status<>'due' then raise exception 'not payable'; end if;
  if exists(select 1 from loan_installments where loan_id=i.loan_id and status='due' and no<i.no) then raise exception 'pay earlier installment first'; end if;
  if exists(select 1 from payments where installment_id=i.id and status='pending') then raise exception 'payment pending'; end if;
  insert into payments(demo_ref,user_id,circle_id,amount_paise,method,status,idem_key,kind,installment_id)
    values('DEMO-'||upper(substr(encode(gen_random_bytes(5),'hex'),1,10)),auth.uid(),l.circle_id,i.amount_paise,p_method,p_scenario,p_key,'repayment',i.id) returning * into p;
  if p_scenario='success' then perform _record_repayment(p.id); select * into p from payments where id=p.id; end if;
  return p; end $$;

create or replace function confirm_payment(p_id uuid) returns payments language plpgsql security definer set search_path=public as $$
declare p payments; begin
  select * into p from payments where id=p_id and user_id=auth.uid() for update;
  if not found or p.status<>'pending' then raise exception 'not pending'; end if;
  update payments set status='success' where id=p_id;
  if p.kind='repayment' then perform _record_repayment(p_id); else perform _record(p_id); end if;
  select * into p from payments where id=p_id; return p; end $$;

revoke all on function _append_ledger(uuid,uuid,uuid,jsonb), _record_repayment(uuid) from public, anon, authenticated;
revoke all on function request_loan, review_loan, repay_installment from public, anon;
grant execute on function request_loan, review_loan, repay_installment to authenticated;
notify pgrst, 'reload schema';
