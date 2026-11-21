import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { ethers } from "npm:ethers@6.13.2";

const origin = Deno.env.get("ALLOWED_ORIGIN") ?? "";
const cors = { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", Vary: "Origin" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ABI = ["function anchor(bytes32 circleKey, uint64 seq, bytes32 recordHash)"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } = Deno.env.toObject();
  const rpc = Deno.env.get("SEPOLIA_RPC_URL"), pk = Deno.env.get("ANCHOR_PRIVATE_KEY"), addr = Deno.env.get("ANCHOR_CONTRACT");
  if (!rpc || !pk || !addr || !origin) return json({ error: "Anchoring is not configured" }, 503);
  try {
    const user = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: u } = await user.auth.getUser();
    if (!u.user) return json({ error: "Unauthorized" }, 401);
    const body = await req.json().catch(() => ({}));
    const circleId = String(body?.circle_id ?? "");
    if (!UUID.test(circleId)) return json({ error: "Invalid request" }, 400);
    const { data: isAdmin } = await user.rpc("is_circle_admin", { c: circleId });
    if (isAdmin !== true) return json({ error: "Forbidden" }, 403);
    const { data: v } = await user.rpc("verify_chain", { p_circle: circleId });
    if (!v?.[0]?.valid) return json({ error: "Ledger failed verification; not anchoring" }, 409);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: head } = await admin.from("ledger_records").select("seq,record_hash").eq("circle_id", circleId).order("seq", { ascending: false }).limit(1).maybeSingle();
    if (!head) return json({ error: "Nothing to anchor" }, 409);
    const { data: last } = await admin.from("ledger_anchors").select("seq,created_at").eq("circle_id", circleId).order("seq", { ascending: false }).limit(1).maybeSingle();
    if (last && last.seq >= head.seq) return json({ error: "Already anchored" }, 409);
    if (last && Date.now() - new Date(last.created_at).getTime() < 60_000) return json({ error: "Try again in a minute" }, 429);

    const provider = new ethers.JsonRpcProvider(rpc);
    if ((await provider.getNetwork()).chainId !== 11155111n) return json({ error: "Wrong network" }, 500);
    const contract = new ethers.Contract(addr, ABI, new ethers.Wallet(pk, provider));
    const tx = await contract.anchor(ethers.id(circleId), head.seq, "0x" + head.record_hash); // only hashes leave the database
    const receipt = await tx.wait(1);
    const { error } = await admin.from("ledger_anchors").insert({ circle_id: circleId, seq: head.seq, record_hash: head.record_hash, tx_hash: receipt.hash, block_number: receipt.blockNumber, chain_id: 11155111 });
    if (error) throw error;
    await admin.from("audit_logs").insert({ actor_id: u.user.id, action: "ledger_anchored", detail: { circle: circleId, seq: head.seq, tx: receipt.hash } });
    return json({ tx_hash: receipt.hash, block_number: receipt.blockNumber, seq: head.seq });
  } catch (e) { console.error("anchor failed", e); return json({ error: "Anchoring failed" }, 500); }
});
