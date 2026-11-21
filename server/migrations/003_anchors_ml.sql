-- Run after 002. Real on-chain checkpoints are written ONLY by the anchor-ledger Edge Function (service role).
create table ledger_anchors(id uuid primary key default gen_random_uuid(), circle_id uuid not null references savings_circles on delete cascade, seq bigint not null,
  record_hash text not null, tx_hash text not null, block_number bigint not null, chain_id int not null, created_at timestamptz not null default now(), unique(circle_id,seq));
alter table ledger_anchors enable row level security;
create policy an_sel on ledger_anchors for select using (is_member(circle_id));
alter table model_predictions add column kind text, add column result jsonb, add column model_version text;
