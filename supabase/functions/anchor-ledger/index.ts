// Publishes a ledger checkpoint (the head hash of a circle's chain) to the FinovaAnchor contract on Sepolia.
//
// Two ways to call it:
//   1. A circle admin clicks "Anchor to Sepolia" in the app (normal user JWT).
//   2. A scheduler calls it with header  x-cron-secret: <CRON_SECRET>  and every circle with un-anchored entries gets a checkpoint.
//
// Required secrets (supabase secrets set NAME=value):
//   SEPOLIA_RPC_URL     - an HTTPS RPC endpoint for Sepolia (Alchemy / Infura / publicnode ...)
//   ANCHOR_PRIVATE_KEY  - private key of the ANCHORER wallet (hot key; it only needs a little SepoliaETH)
//   ANCHOR_CONTRACT     - address of the deployed FinovaAnchor contract
//   ALLOWED_ORIGIN      - the exact address of your site, e.g. https://finova-rust.vercel.app (no trailing slash)
// Optional: CRON_SECRET (16+ random characters) to allow scheduled anchoring.
//
// Every failure answers with { error, code, ... } so the app can show the real reason instead of "failed".
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { ethers } from "npm:ethers@6.13.2";

const origin = Deno.env.get("ALLOWED_ORIGIN") ?? "";
const cors = { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret", Vary: "Origin" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEPOLIA = 11155111n;
const ABI = ["function anchor(bytes32 circleKey, uint64 seq, bytes32 recordHash)", "error NotAnchorer()", "error SeqNotIncreasing()", "error ZeroHash()"];

type Fail = { status: number; code: string; error: string; extra?: Record<string, unknown> };
const fail = (status: number, code: string, error: string, extra?: Record<string, unknown>): Fail => ({ status, code, error, extra });
const isFail = (e: unknown): e is Fail => typeof e === "object" && e !== null && "status" in e && "code" in e && "error" in e;
const same = (a: string, b: string) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };

// Turn a low-level ethers error into something a person can act on.
function explain(e: any): Fail {
  const name = e?.revert?.name ?? "";
  if (name === "NotAnchorer") return fail(500, "not_anchorer", "The server wallet is not the anchorer of this contract. Redeploy with ANCHORER_ADDRESS set to the wallet behind ANCHOR_PRIVATE_KEY, or have the contract owner call setAnchorer.");
  if (name === "SeqNotIncreasing") return fail(409, "already_anchored", "This entry, or a newer one, is already anchored on-chain.");
  if (e?.code === "INSUFFICIENT_FUNDS") return fail(500, "no_funds", "The server wallet cannot pay gas. Send it some SepoliaETH from a Sepolia faucet.");
  if (["NETWORK_ERROR", "SERVER_ERROR", "TIMEOUT"].includes(e?.code)) return fail(502, "rpc_error", "Could not reach the Sepolia RPC endpoint. Check SEPOLIA_RPC_URL and its rate limit.");
  return fail(500, "anchor_failed", "Anchoring failed.");
}

async function connect() {
  const rpc = Deno.env.get("SEPOLIA_RPC_URL")!, pk = Deno.env.get("ANCHOR_PRIVATE_KEY")!, addr = Deno.env.get("ANCHOR_CONTRACT")!;
  if (!ethers.isAddress(addr)) throw fail(500, "bad_contract_address", "ANCHOR_CONTRACT is not a valid address.");
  const provider = new ethers.JsonRpcProvider(rpc);
  let net; try { net = await provider.getNetwork(); } catch (e) { throw explain(Object.assign(e as object, { code: "NETWORK_ERROR" })); }
  if (net.chainId !== SEPOLIA) throw fail(500, "wrong_network", `SEPOLIA_RPC_URL points to chain ${net.chainId}, not Sepolia (11155111).`);
  if ((await provider.getCode(addr)) === "0x") throw fail(500, "contract_not_found", "No contract exists at ANCHOR_CONTRACT on Sepolia. Wrong address, or it was deployed to another network.");
  let wallet; try { wallet = new ethers.Wallet(pk, provider); } catch { throw fail(500, "bad_private_key", "ANCHOR_PRIVATE_KEY is not a valid private key."); }
  if ((await provider.getBalance(wallet.address)) === 0n) throw fail(500, "no_funds", "The server wallet has 0 SepoliaETH, so it cannot pay gas. Send some from a Sepolia faucet.", { wallet: wallet.address });
  return new ethers.Contract(addr, ABI, wallet);
}

async function anchorOne(admin: ReturnType<typeof createClient>, contract: ethers.Contract, circleId: string, head: { seq: number; record_hash: string }, actor: string | null) {
  try {
    const tx = await contract.anchor(ethers.id(circleId), head.seq, "0x" + head.record_hash); // only hashes leave the database
    const receipt = await tx.wait(1);
    const { error } = await admin.from("ledger_anchors").insert({ circle_id: circleId, seq: head.seq, record_hash: head.record_hash, tx_hash: receipt.hash, block_number: receipt.blockNumber, chain_id: 11155111 });
    if (error) throw error;
    await admin.from("audit_logs").insert({ actor_id: actor, action: "ledger_anchored", detail: { circle: circleId, seq: head.seq, tx: receipt.hash, by: actor ? "admin" : "scheduler" } });
    return { tx_hash: receipt.hash as string, block_number: receipt.blockNumber as number, seq: head.seq };
  } catch (e) { throw isFail(e) ? e : explain(e); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed", code: "method" }, 405);
  const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } = Deno.env.toObject();
  const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
  const isCron = cronSecret.length >= 16 && same(req.headers.get("x-cron-secret") ?? "", cronSecret);
  const missing = ["SEPOLIA_RPC_URL", "ANCHOR_PRIVATE_KEY", "ANCHOR_CONTRACT", "ALLOWED_ORIGIN"].filter((n) => !Deno.env.get(n));
  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (isCron) {
      if (missing.length) return json({ error: "Anchoring is not configured on the server.", code: "not_configured", missing }, 503);
      const { data: todo, error: te } = await admin.rpc("_circles_needing_anchor");
      if (te) return json({ error: "Could not list circles. Did migration 005 run?", code: "migration_missing" }, 500);
      const contract = await connect(); const results: unknown[] = [];
      for (const c of (todo ?? []).slice(0, 5)) { // a few per run keeps us inside the function time limit
        const { data: v } = await admin.rpc("_verify_chain", { p_circle: c.circle_id });
        if (!v?.[0]?.valid) { await admin.from("audit_logs").insert({ actor_id: null, action: "anchor_skipped_tamper", detail: { circle: c.circle_id, reason: v?.[0]?.reason } }); results.push({ circle: c.circle_id, status: "ledger_failed_verification" }); continue; }
        try { results.push({ circle: c.circle_id, status: "anchored", ...(await anchorOne(admin, contract, c.circle_id, c, null)) }); }
        catch (e) { results.push({ circle: c.circle_id, status: "error", code: isFail(e) ? e.code : "anchor_failed" }); }
      }
      return json({ results });
    }

    const user = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: u } = await user.auth.getUser();
    if (!u.user) return json({ error: "Please sign in again.", code: "unauthorized" }, 401);
    const body = await req.json().catch(() => ({}));
    const circleId = String(body?.circle_id ?? "");
    if (!UUID.test(circleId)) return json({ error: "Invalid request.", code: "bad_request" }, 400);
    const { data: isAdmin } = await user.rpc("is_circle_admin", { c: circleId });
    if (isAdmin !== true) return json({ error: "Only a circle admin can anchor this ledger.", code: "forbidden" }, 403);
    const { data: v, error: ve } = await user.rpc("verify_chain", { p_circle: circleId });
    if (ve) return json({ error: "verify_chain failed. Has migration 005 been run in Supabase?", code: "migration_missing" }, 500);
    if (!v?.[0]?.valid) return json({ error: "The ledger failed verification, so it will not be anchored.", code: "tampered", reason: v?.[0]?.reason ?? null }, 409);
    if (missing.length) return json({ error: "Anchoring is not configured on the server.", code: "not_configured", missing }, 503);

    const { data: head } = await admin.from("ledger_records").select("seq,record_hash").eq("circle_id", circleId).order("seq", { ascending: false }).limit(1).maybeSingle();
    if (!head) return json({ error: "Nothing to anchor yet. Make a successful contribution first.", code: "nothing_to_anchor" }, 409);
    const { data: last } = await admin.from("ledger_anchors").select("seq,created_at").eq("circle_id", circleId).order("seq", { ascending: false }).limit(1).maybeSingle();
    if (last && last.seq >= head.seq) return json({ error: "The latest entry is already anchored.", code: "already_anchored" }, 409);
    if (last && Date.now() - new Date(last.created_at).getTime() < 60_000) return json({ error: "Try again in a minute.", code: "rate_limited" }, 429);

    const contract = await connect();
    return json(await anchorOne(admin, contract, circleId, head, u.user.id));
  } catch (e) {
    const f = isFail(e) ? e : explain(e);
    console.error("anchor failed", f.code, e);
    return json({ error: f.error, code: f.code, ...(f.extra ?? {}) }, f.status);
  }
});
