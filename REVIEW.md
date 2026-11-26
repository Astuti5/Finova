# Review of the friend's update (005, 006, anchor-ledger, webhook, contract, pages)

Verified by running it: migrations 001-005 + 007 on PostgreSQL (46 of 46 checks pass); contract compiled and its 8 tests pass.

## Bug found and fixed
- **Live-mode payments could never be settled.** `settle_payment` (webhook) -> `_record` -> `circle_cycle` demanded that the *caller* is a circle member, but a webhook has no user. Result: error "forbidden" (test S17d fails without the fix). Fix: `007_fix_gateway_cycle.sql`, run right after 005.

## Things to fix or know before relying on it
1. **CSP blocks "Verify against Ethereum".** web/vercel.json only allowed Supabase; the browser read of the Sepolia RPC was blocked. Fixed (publicnode host added). If you use another RPC host, add it to connect-src.
2. **Do not put a keyed RPC URL in VITE_SEPOLIA_RPC_URL.** Anything in VITE_ is public. Use a keyless public endpoint (https://ethereum-sepolia-rpc.publicnode.com) or a key restricted to your domain.
3. **Live payments are not finished.** Nothing creates a gateway order or checkout that carries `payment_id`, so keep `demo_mode = true`. Real money needs a gateway account, an order-creation function, and the webhook must also check amount and currency before calling settle_payment.
4. **payment-webhook** must be deployed with `--no-verify-jwt` (its HMAC check is what protects it). Replace the body/header parsing with the gateway's real format; keep the signature check.
5. **006 puts your anon key and CRON_SECRET into a pg_cron job** (stored in the database). Fine for testing; never commit the filled-in file.
6. **Existing circles are not started.** After 005, payments need "circle started": start each old circle from the Circles page. Old contributions keep their old cycle numbers.
7. **Windows PowerShell:** `NAME=value npx ...` does not work. Use `$env:NAME="value"` lines (see the steps).
8. contracts/package.json now lists every Hardhat toolbox dependency to avoid npm's ERESOLVE error.
