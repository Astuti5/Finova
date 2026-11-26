-- Run AFTER 005. Fixes a bug found by testing: a payment settled by the gateway webhook has no logged-in user, but _record() called
-- circle_cycle(), which requires membership of the CALLER, so every live-mode contribution failed with 'forbidden'.
create function _cycle(p_circle uuid) returns int language plpgsql stable security definer set search_path=public as $$
declare c savings_circles; n int; begin
  select * into c from savings_circles where id=p_circle;
  if c.started_at is null then return null; end if;
  select count(*) into n from circle_members where circle_id=p_circle;
  return least(floor(extract(epoch from (now()-c.started_at))/86400.0/c.cycle_days)::int+1, n); end $$;
create or replace function circle_cycle(p_circle uuid) returns int language plpgsql stable security definer set search_path=public as $$
begin if not is_member(p_circle) then raise exception 'forbidden'; end if; return _cycle(p_circle); end $$;
create or replace function _record(p_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare p payments; cyc int; begin
  select * into p from payments where id=p_id;
  perform pg_advisory_xact_lock(hashtext(p.circle_id::text));
  cyc:=_cycle(p.circle_id); if cyc is null then raise exception 'circle not started'; end if;
  begin insert into contributions(circle_id,user_id,cycle_no,amount_paise,status) values(p.circle_id,p.user_id,cyc,p.amount_paise,'recorded');
  exception when unique_violation then raise exception 'already contributed this cycle'; end;
  update payments set cycle_no=cyc where id=p.id;
  perform _append_ledger(p.circle_id,p.user_id,p.id,jsonb_build_object('payment_ref',p.demo_ref,'user',p.user_id,'circle',p.circle_id,'amount_paise',p.amount_paise,'cycle',cyc,'method',p.method,'demo',p.is_demo)); end $$;
revoke all on function _cycle(uuid) from public, anon, authenticated;
notify pgrst, 'reload schema';