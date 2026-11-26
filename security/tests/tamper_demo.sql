-- STAGING ONLY. Replace CIRCLE-UUID. Run in the Supabase SQL editor (as the database owner, i.e. the strongest attacker).
-- Demonstrates exactly what the hash chain catches by itself, and what only an on-chain checkpoint can catch.

-- 1) Edit one amount. The hash chain alone catches this.
alter table ledger_records disable trigger ledger_immutable;
update ledger_records set payload = jsonb_set(payload,'{amount_paise}','999999') where circle_id='CIRCLE-UUID' and seq=1;
alter table ledger_records enable trigger ledger_immutable;
select * from _verify_chain('CIRCLE-UUID');  -- expect valid=false, reason 'entry contents do not match its hash'
-- (undo your edit before the next step, or use a fresh circle)

-- 2) Delete the newest entries. The chain alone CANNOT notice (a shorter chain is still a valid chain).
--    Once that entry was anchored on Sepolia and the checkpoint is stored, it IS noticed.
alter table ledger_records disable trigger ledger_immutable;
delete from ledger_records where circle_id='CIRCLE-UUID' and seq=(select max(seq) from ledger_records where circle_id='CIRCLE-UUID');
alter table ledger_records enable trigger ledger_immutable;
select * from _verify_chain('CIRCLE-UUID');  -- expect valid=false, reason 'entries covered by a published checkpoint were removed or rewritten'

-- 3) Rewrite history AND recompute every hash. Also only a checkpoint can catch this.
--    In the app, the "Verify against Ethereum" button catches it even if the attacker also edits the ledger_anchors table,
--    because that button reads the hashes straight from the contract on Sepolia, not from your database.
