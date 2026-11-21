-- Staging only. Shows that Verify Chain detects tampering. Replace the circle id.
alter table ledger_records disable trigger ledger_immutable;
update ledger_records set payload = jsonb_set(payload,'{amount_paise}','999999') where circle_id='CIRCLE-UUID' and seq=1;
alter table ledger_records enable trigger ledger_immutable;
select * from verify_chain('CIRCLE-UUID'); -- expect valid=false, broken_seq=1
