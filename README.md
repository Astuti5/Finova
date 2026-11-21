# Finova
Community savings + loans platform (web, Vite + React + TS + Tailwind) on Supabase, deployed on Vercel.

## Run locally
1. Create a Supabase project; run `server/migrations/001_init.sql` in the SQL editor.
2. `cp .env.example web/.env` and fill in URL + **anon** key.
3. `cd web && npm install && npm run dev`

## Deploy (Vercel)
Import the repo, set **Root Directory = web**, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Build `npm run build`, output `dist`. In Supabase > Auth > URL config, add your Vercel URL.

## Status
Built: auth, dashboard, circles with admin-approved invites, demo payments, hash-chained ledger + verify, schema + RLS, security headers.
Not yet built: loans UI, contributions form, repayments, anomaly UI, ledger UI, ML service, contracts, security tests, Edge Functions.
Not yet run: npm install/build and RLS tests have not been executed. Do this first.
Contributions/loans are platform records; no real money moves. ML and ledger are not wired up, so no model outputs or hashes are shown.

## Demo flow (migration 002)
Run `server/migrations/002_invites_payments_ledger.sql` after 001. Then: sign up two users > A creates a circle and copies the invite code > B requests to join > A approves on the Circles page > either pays a DEMO contribution (success / failed / pending) > open Ledger and click **Verify chain**.
Tamper test (staging only): `security/tests/tamper_demo.sql`.
Payments are simulated; ledger entries are hash-chained in Postgres, not on Ethereum. Loan repayments, Sepolia anchoring and wallet connect are not built yet.
Not yet run: SQL and build are untested. Run them first and send any errors.

## Blockchain, ML (migration 003 + new modules)
**Anchoring (Sepolia testnet):**
1. `cd contracts && npm install && npx hardhat test`, then export `SEPOLIA_RPC_URL` and `DEPLOYER_PRIVATE_KEY` (throwaway wallet with test ETH) and run `npm run deploy:sepolia`.
2. Run `server/migrations/003_anchors_ml.sql`.
3. `supabase secrets set ALLOWED_ORIGIN=... SEPOLIA_RPC_URL=... ANCHOR_PRIVATE_KEY=... ANCHOR_CONTRACT=0x...` then `supabase functions deploy anchor-ledger`.
4. On the Ledger page a circle admin clicks **Anchor to Sepolia**. Only the head hash goes on-chain; the function refuses to anchor a ledger that fails verification. Edge functions live in `supabase/functions/` (the CLI's required location).

**ML service:** `cd ml-service && pip install -r requirements.txt -r requirements-dev.txt && python -m pytest`. Deploy the Dockerfile to Render/Railway/Fly with env `ML_SHARED_SECRET`, then `supabase secrets set ML_SERVICE_URL=... ML_SHARED_SECRET=...` and `supabase functions deploy ml-proxy`. The AI insights page works only after that; the rest of the app does not depend on it. See `docs/ml-data-card.md`.
Wallet connect is read-only (address and network display). A single owner wallet signs anchors, which is acceptable only on testnet.
