"""Executable database tests for Finova (migrations 001-005 + 007). Starts a temporary PostgreSQL via pgserver, applies the
migrations with a small Supabase compatibility layer (auth schema, roles, auth.uid()), then runs every check as a real role.
Run:  pip install pgserver "psycopg[binary]"   then   python db_security_tests.py      (SKIP_007=1 shows the webhook bug 007 fixes)"""
import os, uuid, pathlib, psycopg, pgserver
M = pathlib.Path(__file__).resolve().parents[2] / "server" / "migrations"
srv = pgserver.get_server("/tmp/finova_pg_v2", cleanup_mode="delete"); conn = psycopg.connect(srv.get_uri(), autocommit=True)
def x(sql, p=None):
    with conn.cursor() as c:
        c.execute(sql, p); return c.fetchall() if c.description else None
for r in ("anon", "authenticated", "service_role"):
    try: x(f"create role {r} nologin")
    except Exception: pass
x("create schema if not exists auth; create schema if not exists extensions;")
x("create table auth.users(id uuid primary key default gen_random_uuid(), email text)")
x("create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$")
x("grant usage on schema auth, public, extensions to anon, authenticated, service_role; grant execute on function auth.uid() to anon, authenticated, service_role")
x("alter default privileges in schema public grant all on tables to anon, authenticated, service_role; alter default privileges in schema public grant all on sequences to anon, authenticated, service_role; alter default privileges in schema public grant execute on functions to anon, authenticated, service_role")
shim = False
try: x("create extension if not exists pgcrypto")
except Exception:
    shim = True; x("create function public.gen_random_bytes(n int) returns bytea language sql as $$ select decode(substr(md5(random()::text||clock_timestamp()::text)||md5(random()::text),1,n*2),'hex') $$")
files = ["001_init.sql", "002_invites_payments_ledger.sql", "003_anchors_ml.sql", "004_loans.sql", "005_hardening_and_circle_rules.sql"] + ([] if os.environ.get("SKIP_007") else ["007_fix_gateway_cycle.sql"])
for f in files:
    s = (M / f).read_text()
    if shim: s = s.replace("create extension if not exists pgcrypto;", "")
    x(s)
print("migrations applied:", ", ".join(files))
def au(uid, sql, p=None, role="authenticated"):
    x(f"set role {role}"); x("select set_config('request.jwt.claim.sub', %s, false)", (str(uid),))
    try: return ("ok", x(sql, p))
    except Exception as e: return ("err", str(e).splitlines()[0])
    finally: x("reset role")
A, B, C, D, E = (str(uuid.uuid4()) for _ in range(5))
for u, m in ((A, "alice"), (B, "bob"), (C, "carol"), (D, "dave"), (E, "erin")): x("insert into auth.users(id,email) values(%s,%s)", (u, m + "@example.com"))
R = []
def rec(i, d, ok, act): R.append((i, d, "PASS" if ok else "FAIL", str(act)[:80]))
def err(r, word): return r[0] == "err" and word in r[1]
cid = au(A, "select create_circle('Test',50000)")[1][0][0]; code = x("select invite_code from savings_circles where id=%s", (cid,))[0][0]
for u in (B, D, E): au(u, "select join_circle(%s)", (code,)); au(A, "select review_join(%s,%s,true)", (cid, u))
au(C, "select join_circle(%s)", (code,))
r = au(A, "select invite_code from savings_circles"); rec("S01", "Invite code cannot be read directly, even by the admin (column privilege)", r[0] == "err", r)
r = au(A, "select code from get_invite(%s)", (cid,)); r2 = au(B, "select code from get_invite(%s)", (cid,)); rec("S02", "get_invite works for admin, forbidden for member", r[0] == "ok" and r[1][0][0] == code and err(r2, "forbidden"), (r[0], r2))
r = au(B, "select id from pay_contribution(%s,'gpay','success','key-b-0001')", (cid,)); rec("S03", "Cannot pay before the circle is started", err(r, "not started"), r)
r = au(B, "select start_circle(%s,30,200)", (cid,)); rec("S04a", "Non-admin cannot start a circle", err(r, "forbidden"), r)
r = au(A, "select start_circle(%s,30,200)", (cid,)); pos = x("select array_agg(payout_pos order by payout_pos) from circle_members where circle_id=%s", (cid,))[0][0]
rec("S04b", "Admin starts circle; payout order 1..4 assigned", r[0] == "ok" and pos == [1, 2, 3, 4], pos)
r = au(A, "select start_circle(%s,30,200)", (cid,)); rec("S04c", "Cannot start twice", err(r, "already started"), r)
r = au(A, "select review_join(%s,%s,true)", (cid, C)); rec("S05", "No new members after start", err(r, "already started"), r)
r = au(B, "select status from pay_contribution(%s,'gpay','success','key-b-0001')", (cid,)); rec("S06a", "Member pays cycle 1 (demo success)", r[0] == "ok" and r[1][0][0] == "success", r)
r = au(B, "select id from pay_contribution(%s,'gpay','success','key-b-0002')", (cid,)); rec("S06b", "Second payment in the same cycle is refused", err(r, "already contributed"), r)
au(B, "select id from pay_contribution(%s,'gpay','success','key-b-0001')", (cid,)); rec("S07", "Replay of the same key adds nothing", x("select count(*) from contributions where user_id=%s", (B,))[0][0] == 1, "1 contribution")
au(A, "select id from pay_contribution(%s,'gpay','success','key-a-0001')", (cid,)); au(D, "select id from pay_contribution(%s,'gpay','success','key-d-0001')", (cid,))
r = au(A, "select record_payout(%s)", (cid,)); rec("S08a", "Payout refused until every member paid the cycle", err(r, "not fully funded"), r)
r = au(B, "select record_payout(%s)", (cid,)); rec("S08b", "Non-admin cannot record a payout", err(r, "forbidden"), r)
r = au(D, "select id from request_loan(%s,200000,2,'x')", (cid,)); rec("S09", "Loan above the pool balance is refused", err(r, "insufficient funds"), r)
r = au(A, "select id from request_loan(%s,50000,1,'x')", (cid,)); rec("S10", "Admin loan refused while there is no second admin", err(r, "second admin"), r)
r = au(B, "select set_member_role(%s,%s,'admin')", (cid, B)); rec("S11a", "Only the owner can make admins", err(r, "forbidden"), r)
au(A, "select set_member_role(%s,%s,'admin')", (cid, D)); rec("S11b", "Owner promotes a member to admin", x("select role from circle_members where circle_id=%s and user_id=%s", (cid, D))[0][0] == "admin", "dave is admin")
r = au(B, "select id,status from request_loan(%s,100000,2,'stock')", (cid,)); lb = x("select id,approvals_needed from loans where user_id=%s", (B,))[0]
rec("S12", "Small loan needs one admin approval", r[0] == "ok" and lb[1] == 1, lb[1])
r = au(B, "select review_loan(%s,true)", (lb[0],)); rec("S13a", "Borrower cannot approve own loan", err(r, "forbidden"), r)
r = au(D, "select status from review_loan(%s,true)", (lb[0],)); inst = x("select amount_paise from loan_installments where loan_id=%s order by no", (lb[0],)); tot = x("select total_paise from loans where id=%s", (lb[0],))[0][0]
rec("S13b", "Admin approves: interest 2%/month x 2 = 104000 in 2 installments", r[1][0][0] == "approved" and tot == 104000 and sum(i[0] for i in inst) == 104000 and len(inst) == 2, (tot, inst))
rec("S14", "Disbursement is written to the ledger", x("select count(*) from ledger_records where circle_id=%s and payload->>'kind'='loan_disbursed'", (cid,))[0][0] == 1, "1 entry")
r = au(B, "select id from request_loan(%s,1000,1,'x')", (cid,)); rec("S15", "Only one open loan per member", err(r, "open loan"), r)
x("insert into contributions(circle_id,user_id,cycle_no,amount_paise,status) select %s,%s,g,50000,'recorded' from generate_series(2,9) g", (cid, E))  # superuser inflates the pool for the big-loan test
au(E, "select id from request_loan(%s,350000,3,'big')", (cid,)); le = x("select id,approvals_needed from loans where user_id=%s", (E,))[0]
rec("S16a", "Loan above 5x contribution needs two admins", le[1] == 2, le[1])
r = au(A, "select status from review_loan(%s,true)", (le[0],)); rec("S16b", "First approval leaves it pending", r[0] == "ok" and r[1][0][0] == "pending", r)
r = au(A, "select review_loan(%s,true)", (le[0],)); rec("S16c", "Same admin cannot approve twice", err(r, "already approved"), r)
r = au(D, "select status from review_loan(%s,true)", (le[0],)); rec("S16d", "Second admin approves: loan becomes active", r[0] == "ok" and r[1][0][0] == "approved", r)
x("update app_config set value='false' where key='demo_mode'")
r = au(E, "select status from pay_contribution(%s,'gpay','success','key-e-0001')", (cid,)); pe = x("select id,is_demo from payments where idem_key='key-e-0001'")[0]
rec("S17a", "Live mode: browser cannot declare success (stays pending)", r[0] == "ok" and r[1][0][0] == "pending" and pe[1] is False, r)
r = au(E, "select confirm_payment(%s)", (pe[0],)); rec("S17b", "Live mode: confirm_payment is refused", err(r, "gateway"), r)
r = au(E, "select settle_payment(%s,'success','x')", (pe[0],)); rec("S17c", "Ordinary users cannot call settle_payment", r[0] == "err", r)
r = au("", "select status from settle_payment(%s,'success','GW-123')", (pe[0],), role="service_role")
rec("S17d", "Gateway settlement (service role, no user) records the contribution", r[0] == "ok" and r[1][0][0] == "success" and x("select count(*) from contributions where user_id=%s and cycle_no=1", (E,))[0][0] == 1, r)
au("", "select status from settle_payment(%s,'success','GW-123')", (pe[0],), role="service_role")
rec("S17e", "Replayed webhook is harmless", x("select count(*) from contributions where user_id=%s and cycle_no=1", (E,))[0][0] == 1, "1 contribution")
x("update app_config set value='true' where key='demo_mode'")
if os.environ.get("SKIP_007"):  # demo of the bug that 007 fixes: show the webhook checks, then stop
    [print(" | ".join(row)) for row in R if row[0].startswith("S17")]; raise SystemExit
r = au(A, "select record_payout(%s)", (cid,)); rec("S18", "Payout refused when loans left the pool too low", err(r, "insufficient funds"), r)
for n_, k in ((1, "loan-b-1"), (2, "loan-b-2")):
    iid = x("select id from loan_installments where loan_id=%s and no=%s", (lb[0], n_))[0][0]; au(B, "select id from repay_installment(%s,'gpay','success',%s)", (iid, k + "-key"))
rec("S19", "Repayments close the loan", x("select status from loans where id=%s", (lb[0],))[0][0] == "closed", "closed")
r = au(A, "select amount_paise from record_payout(%s)", (cid,)); rec("S20a", "Payout 1 recorded for 4 x 500", r[0] == "ok" and r[1][0][0] == 200000, r)
rec("S20b", "Payout goes to the member with payout position 1", x("select recipient_id from payouts where circle_id=%s", (cid,))[0][0] == uuid.UUID(x("select user_id::text from circle_members where circle_id=%s and payout_pos=1", (cid,))[0][0]), "position 1")
r = au(A, "select record_payout(%s)", (cid,)); rec("S20c", "Payout 2 waits for cycle 2", err(r, "next payout cycle"), r)
x("update loan_installments set due_date=current_date-3 where loan_id=%s and no=1", (le[0],)); r = au(A, "select sweep_overdue(%s)", (cid,)); rec("S21a", "Late installment is marked overdue", r[0] == "ok" and r[1][0][0] == 1, r)
i2 = x("select id from loan_installments where loan_id=%s and no=2", (le[0],))[0][0]; r = au(E, "select id from repay_installment(%s,'gpay','success','loan-e-skip1')", (i2,)); rec("S21b", "Installment 2 cannot be paid before overdue 1", err(r, "earlier"), r)
i1 = x("select id from loan_installments where loan_id=%s and no=1", (le[0],))[0][0]; r = au(E, "select status from repay_installment(%s,'gpay','success','loan-e-pay1')", (i1,)); rec("S21c", "An overdue installment can still be paid", r[0] == "ok" and r[1][0][0] == "success", r)
r = au(A, "select valid,checked,broken_seq,reason,anchored_seq from verify_chain(%s)", (cid,)); n_entries = x("select count(*) from ledger_records where circle_id=%s", (cid,))[0][0]
rec("S22", "Full chain (contributions, loans, repayments, payout) verifies", r[0] == "ok" and r[1][0][0] is True and r[1][0][1] == n_entries, (r[1][0][:3], n_entries))
x("insert into ledger_anchors(circle_id,seq,record_hash,tx_hash,block_number,chain_id) select circle_id,seq,record_hash,'0xabc',1,11155111 from ledger_records where circle_id=%s order by seq desc limit 1", (cid,))
r = au(A, "select valid,anchored_seq from verify_chain(%s)", (cid,)); rec("S23", "A stored checkpoint is cross-checked", r[0] == "ok" and r[1][0][0] is True and r[1][0][1] == n_entries, r)
r = au(A, "delete from ledger_anchors"); rec("S24", "API roles cannot delete or edit anchors", r[0] == "err", r)
try: x("truncate ledger_records"); tr = "truncated"
except Exception as e: tr = str(e).splitlines()[0]
rec("S25", "TRUNCATE of the ledger is blocked", "append-only" in tr, tr)
x("alter table ledger_records disable trigger ledger_immutable"); x("delete from ledger_records where circle_id=%s and seq=(select max(seq) from ledger_records where circle_id=%s)", (cid, cid)); x("alter table ledger_records enable trigger ledger_immutable")
r = x("select valid,reason from _verify_chain(%s)", (cid,)); rec("S26", "Deleting the newest entries is caught by the checkpoint", r[0][0] is False and "checkpoint" in r[0][1], r)
r = au(C, "select count(*) from savings_circles"); r2 = au(C, "select valid from verify_chain(%s)", (cid,)); rec("S27", "Outsider sees nothing and cannot verify", r[1][0][0] == 0 and err(r2, "forbidden"), (r, r2))
r = au(B, "select * from list_members(%s)", (cid,)); r2 = au(A, "select label from list_members(%s)", (cid,)); rec("S28", "Member list: admins only, emails masked", err(r, "forbidden") and r2[0] == "ok" and all("***" in row[0] and "alice@example.com" != row[0] for row in r2[1]), r2[1][:2])
r = au("", "select valid from verify_chain(%s)", (cid,), role="anon"); rec("S29", "Anonymous role cannot call verify_chain", r[0] == "err", r)
for row in R: print(" | ".join(row))
print("PASS", sum(r[2] == "PASS" for r in R), "of", len(R))
