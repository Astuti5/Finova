import { useEffect, useState } from "react"; import { Boxes, ShieldCheck, ShieldAlert, Search, Network } from "lucide-react";
import { JsonRpcProvider, Contract, id as keccakId } from "ethers";
import { supabase } from "../services/supabase"; import { inr } from "../utils/schemas"; import { functionError } from "../utils/errors"; import WalletButton from "../components/WalletButton";
type A = { seq: number; tx_hash: string; block_number: number; created_at: string };
type Payload = { amount_paise: number; payment_ref?: string; cycle?: number; method?: string; kind?: string; installment_no?: number };
type R = { id: string; seq: number; record_hash: string; prev_hash: string; payload: Payload; created_at: string; tx_hash: string | null };
type V = { valid: boolean; checked: number; broken_seq: number | null; reason: string | null; anchored_seq: number | null };
const short = (h: string) => `${h.slice(0, 10)}…${h.slice(-8)}`;
const what = (p: Payload) => p.kind === "repayment" ? `repayment #${p.installment_no}` : p.kind === "payout" ? `payout, cycle ${p.cycle}` : p.kind === "loan_disbursed" ? "loan disbursed" : `contribution, cycle ${p.cycle}`;

// Reading the contract straight from a public Sepolia node means this check does not depend on Finova's own backend.
const ANCHOR = import.meta.env.VITE_ANCHOR_CONTRACT as string | undefined, RPC = import.meta.env.VITE_SEPOLIA_RPC_URL as string | undefined;
const ABI = ["function count(bytes32) view returns (uint256)", "function anchorAt(bytes32,uint256) view returns (tuple(bytes32 recordHash,uint64 seq,uint64 timestamp))", "function latest(bytes32) view returns (tuple(bytes32 recordHash,uint64 seq,uint64 timestamp))"];

export default function Ledger() {
  const [circles, setCircles] = useState<{ id: string; name: string }[]>([]); const [cid, setCid] = useState(""); const [recs, setRecs] = useState<R[]>([]); const [q, setQ] = useState("");
  const [result, setResult] = useState<V | null>(null); const [chain, setChain] = useState<{ ok: boolean; lines: string[] } | null>(null); const [err, setErr] = useState(""); const [anchors, setAnchors] = useState<A[]>([]);
  const [busy, setBusy] = useState(false); const [checking, setChecking] = useState(false); const [tick, setTick] = useState(0);
  useEffect(() => { supabase.from("savings_circles").select("id,name").then(({ data }) => { setCircles(data ?? []); if (data?.[0]) setCid(data[0].id); }); }, []);
  useEffect(() => { if (!cid) return; setResult(null); setChain(null); supabase.from("ledger_records").select("id,seq,record_hash,prev_hash,payload,created_at,tx_hash").eq("circle_id", cid).order("seq", { ascending: false }).limit(200).then(({ data }) => setRecs((data as R[]) ?? []));
    supabase.from("ledger_anchors").select("seq,tx_hash,block_number,created_at").eq("circle_id", cid).order("seq", { ascending: false }).then(({ data }) => setAnchors((data as A[]) ?? [])); }, [cid, tick]);

  async function verify() { setErr(""); const { data, error } = await supabase.rpc("verify_chain", { p_circle: cid }); if (error || !data?.[0]) return setErr("Verification failed to run. Has migration 005 been run in Supabase?"); setResult(data[0] as V); }

  async function verifyOnChain() {
    setErr(""); setChain(null);
    if (!ANCHOR || !RPC) return setChain({ ok: false, lines: ["Not configured. Set VITE_ANCHOR_CONTRACT and VITE_SEPOLIA_RPC_URL in web/.env (and in Vercel), then redeploy."] });
    setChecking(true);
    try {
      const provider = new JsonRpcProvider(RPC); if ((await provider.getNetwork()).chainId !== 11155111n) throw new Error("The RPC endpoint is not Sepolia.");
      const c = new Contract(ANCHOR, ABI, provider); const key = keccakId(cid); const n = Number(await c.count(key));
      if (n === 0) return setChain({ ok: true, lines: ["Nothing has been published on-chain for this circle yet. Until an admin anchors, deleted or rewritten entries cannot be proven."] });
      const read = async (i: number) => { try { return await c.anchorAt(key, i); } catch { if (i === n - 1) return await c.latest(key); throw new Error("This contract has no anchorAt function. Deploy the new FinovaAnchor."); } };
      const problems: string[] = []; const from = Math.max(0, n - 25); // most recent 25 checkpoints
      for (let i = from; i < n; i++) {
        const a = await read(i); const seq = Number(a.seq);
        const { data } = await supabase.from("ledger_records").select("record_hash").eq("circle_id", cid).eq("seq", seq).maybeSingle();
        if (!data) problems.push(`Entry #${seq} was published on-chain, but it is missing from the database. Entries were deleted.`);
        else if ("0x" + data.record_hash !== String(a.recordHash).toLowerCase()) problems.push(`Entry #${seq} in the database does not match what was published on-chain. History was rewritten.`);
      }
      setChain(problems.length ? { ok: false, lines: problems } : { ok: true, lines: [`All ${n - from} on-chain checkpoint(s) checked match the database. Everything up to entry #${Number((await read(n - 1)).seq)} is provably unchanged.`] });
    } catch (e: any) { setChain({ ok: false, lines: [`Could not complete the on-chain check: ${e?.message ?? "unknown error"}`] }); } finally { setChecking(false); }
  }

  async function anchorNow() { setBusy(true); setErr(""); const { error } = await supabase.functions.invoke("anchor-ledger", { body: { circle_id: cid } }); setBusy(false);
    if (error) return setErr(await functionError(error, "anchor-ledger")); setTick(t => t + 1); }
  const t = q.trim().toLowerCase(); const shown = recs.filter(r => !t || r.record_hash.includes(t) || (r.payload.payment_ref ?? "").toLowerCase().includes(t) || what(r.payload).includes(t) || String(r.payload.amount_paise / 100).includes(t));
  return (<div className="space-y-6"><div className="flex items-start justify-between gap-3"><h1 className="text-2xl font-bold text-white">Ledger explorer</h1><WalletButton /></div>
    <section className="rounded-xl border border-line bg-gradient-to-r from-violet/30 to-cyan/20 p-5 space-y-3"><p className="text-xl font-semibold text-white">Hash-chained ledger with on-chain checkpoints</p>
      <p className="text-sm text-slate-300">Each entry's hash includes the previous entry's hash, so changing history breaks the chain. Checkpoints published to Sepolia can't be edited by anyone, including the database owner, which is what exposes deleted or rewritten entries.</p>
      <label className="relative block"><span className="sr-only">Search</span><Search size={16} className="absolute left-3 top-3 text-slate-400" aria-hidden /><input className="input pl-9" placeholder="Search by ledger hash or payment ID" value={q} onChange={e => setQ(e.target.value)} /></label></section>
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="card p-4 flex gap-3 items-center"><Boxes className="text-cyan" aria-hidden /><div><p className="text-xs text-slate-400">Ledger entries</p><p className="text-xl font-semibold text-white">{recs.length}</p></div></div>
      <div className="card p-4 flex gap-3 items-center"><Network className="text-violet" aria-hidden /><div><p className="text-xs text-slate-400">Where the ledger lives</p><p className="text-sm font-semibold text-white">{anchors.length ? `Postgres + ${anchors.length} Sepolia checkpoint(s)` : "Postgres only (not on a blockchain)"}</p></div></div>
      <div className="card p-4 flex gap-3 items-center">{result ? (result.valid ? <ShieldCheck className="text-ok" aria-hidden /> : <ShieldAlert className="text-bad" aria-hidden />) : <ShieldCheck className="text-slate-500" aria-hidden />}
        <div><p className="text-xs text-slate-400">Integrity</p><p className="text-sm font-semibold text-white">{!result ? "Not checked" : result.valid ? `Valid (${result.checked} entries${result.anchored_seq ? `, checkpoint at #${result.anchored_seq}` : ", no checkpoint yet"})` : `Problem at entry #${result.broken_seq}: ${result.reason}`}</p></div></div></div>
    <div className="flex flex-wrap gap-3 items-center"><select className="input max-w-xs" value={cid} onChange={e => setCid(e.target.value)} aria-label="Circle">{circles.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <button className="btn" onClick={verify} disabled={!cid}>Verify chain</button><button className="btn" onClick={verifyOnChain} disabled={!cid || checking}>{checking ? "Reading Sepolia…" : "Verify against Ethereum"}</button>
      <button className="btn" onClick={anchorNow} disabled={!cid || busy}>{busy ? "Anchoring…" : "Anchor to Sepolia (admin)"}</button></div>
    {err && <p role="alert" className="text-bad text-sm">{err}</p>}
    {chain && <div role="status" className={`rounded-lg border p-3 text-sm ${chain.ok ? "border-ok/50 bg-ok/10 text-ok" : "border-bad/50 bg-bad/10 text-bad"}`}>{chain.lines.map(l => <p key={l}>{l}</p>)}</div>}
    <section className="card"><h2 className="font-semibold text-white p-4">Latest entries</h2>{shown.length === 0 && <p className="px-4 pb-4 text-sm text-slate-400">No ledger entries yet. Start the circle and make a successful contribution first.</p>}
      {shown.map(r => <div key={r.id} className="border-t border-line p-4 text-sm grid gap-1 md:grid-cols-[6rem_1fr_auto] md:items-center">
        <span className="font-mono text-cyan">#{r.seq}</span>
        <div className="min-w-0"><p className="font-mono truncate" title={r.record_hash}>Hash {short(r.record_hash)}</p><p className="font-mono text-xs text-slate-500 truncate" title={r.prev_hash}>Prev {short(r.prev_hash)}</p>
          <p className="text-xs text-slate-400">{r.payload.payment_ref ?? "—"} · {what(r.payload)} · {new Date(r.created_at).toLocaleString("en-IN")}</p></div>
        <div className="md:text-right"><p className="font-semibold text-white">{inr(r.payload.amount_paise)}</p>{(() => { const f = anchors.filter(a => a.seq >= r.seq); const cp = f[f.length - 1]; return cp ? <p className="text-xs text-ok">Covered by Sepolia checkpoint #{cp.seq}</p> : <p className="text-xs text-warn">Not anchored on-chain yet</p>; })()}</div></div>)}</section>
    <section className="card"><h2 className="font-semibold text-white p-4">On-chain checkpoints (Sepolia testnet)</h2>{anchors.length === 0 && <p className="px-4 pb-4 text-sm text-slate-400">None yet. Only the latest chain hash is published, never member or payment details.</p>}
      {anchors.map(a => <div key={a.tx_hash} className="border-t border-line p-4 text-sm flex flex-wrap gap-x-4 gap-y-1"><span className="font-mono text-cyan">Entry #{a.seq}</span><span>Block {a.block_number}</span>
        <a className="font-mono text-violet underline" target="_blank" rel="noopener noreferrer" href={`https://sepolia.etherscan.io/tx/${a.tx_hash}`}>Tx {short(a.tx_hash)}</a></div>)}</section></div>);
}
