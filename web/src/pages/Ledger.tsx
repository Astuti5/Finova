import { useEffect, useState } from "react"; import { Boxes, ShieldCheck, ShieldAlert, Search, Network } from "lucide-react";
import { supabase } from "../services/supabase"; import { inr } from "../utils/schemas"; import WalletButton from "../components/WalletButton";
type A = { seq: number; tx_hash: string; block_number: number; created_at: string };
type R = { id: string; seq: number; record_hash: string; prev_hash: string; payload: { amount_paise: number; payment_ref: string; cycle: number; method: string }; created_at: string; tx_hash: string | null };
const short = (h: string) => `${h.slice(0, 10)}…${h.slice(-8)}`;
export default function Ledger() {
  const [circles, setCircles] = useState<{ id: string; name: string }[]>([]); const [cid, setCid] = useState(""); const [recs, setRecs] = useState<R[]>([]); const [q, setQ] = useState("");
  const [result, setResult] = useState<{ valid: boolean; checked: number; broken_seq: number | null } | null>(null); const [err, setErr] = useState(""); const [anchors, setAnchors] = useState<A[]>([]); const [busy, setBusy] = useState(false); const [tick, setTick] = useState(0);
  useEffect(() => { supabase.from("savings_circles").select("id,name").then(({ data }) => { setCircles(data ?? []); if (data?.[0]) setCid(data[0].id); }); }, []);
  useEffect(() => { if (!cid) return; setResult(null); supabase.from("ledger_records").select("id,seq,record_hash,prev_hash,payload,created_at,tx_hash").eq("circle_id", cid).order("seq", { ascending: false }).then(({ data }) => setRecs((data as R[]) ?? []));
    supabase.from("ledger_anchors").select("seq,tx_hash,block_number,created_at").eq("circle_id", cid).order("seq", { ascending: false }).then(({ data }) => setAnchors((data as A[]) ?? [])); }, [cid, tick]);
  async function verify() { setErr(""); const { data, error } = await supabase.rpc("verify_chain", { p_circle: cid }); if (error) return setErr("Verification failed to run."); setResult(data[0]); }
  async function anchorNow() { setBusy(true); setErr(""); const { error } = await supabase.functions.invoke("anchor-ledger", { body: { circle_id: cid } }); setBusy(false);
    if (error) return setErr("Anchoring failed, nothing new to anchor, or not configured. Only circle admins can anchor."); setTick(t => t + 1); }
  const shown = recs.filter(r => !q || r.record_hash.includes(q.trim().toLowerCase()) || r.payload.payment_ref.toLowerCase().includes(q.trim().toLowerCase()));
  return (<div className="space-y-6"><div className="flex items-start justify-between gap-3"><h1 className="text-2xl font-bold text-white">Ledger explorer</h1><WalletButton /></div>
    <section className="rounded-xl border border-line bg-gradient-to-r from-violet/30 to-cyan/20 p-5 space-y-3"><p className="text-xl font-semibold text-white">Hash-chained contribution ledger</p>
      <label className="relative block"><span className="sr-only">Search</span><Search size={16} className="absolute left-3 top-3 text-slate-400" aria-hidden /><input className="input pl-9" placeholder="Search by ledger hash or demo payment ID" value={q} onChange={e => setQ(e.target.value)} /></label></section>
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="card p-4 flex gap-3 items-center"><Boxes className="text-cyan" aria-hidden /><div><p className="text-xs text-slate-400">Ledger entries</p><p className="text-xl font-semibold text-white">{recs.length}</p></div></div>
      <div className="card p-4 flex gap-3 items-center"><Network className="text-violet" aria-hidden /><div><p className="text-xs text-slate-400">Network</p><p className="text-sm font-semibold text-white">{anchors.length ? "Simulated + Sepolia checkpoints" : "Simulated (off-chain)"}</p></div></div>
      <div className="card p-4 flex gap-3 items-center">{result ? (result.valid ? <ShieldCheck className="text-ok" aria-hidden /> : <ShieldAlert className="text-bad" aria-hidden />) : <ShieldCheck className="text-slate-500" aria-hidden />}
        <div><p className="text-xs text-slate-400">Integrity</p><p className="text-sm font-semibold text-white">{!result ? "Not checked" : result.valid ? `Valid (${result.checked} entries)` : `Tampering detected at entry #${result.broken_seq}`}</p></div></div></div>
    <div className="flex gap-3 items-center"><select className="input max-w-xs" value={cid} onChange={e => setCid(e.target.value)} aria-label="Circle">{circles.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <button className="btn" onClick={verify} disabled={!cid}>Verify chain</button><button className="btn" onClick={anchorNow} disabled={!cid || busy}>{busy ? "Anchoring…" : "Anchor to Sepolia (admin)"}</button></div>{err && <p role="alert" className="text-bad text-sm">{err}</p>}
    <section className="card"><h2 className="font-semibold text-white p-4">Latest entries</h2>{shown.length === 0 && <p className="px-4 pb-4 text-sm text-slate-400">No ledger entries yet. Make a successful demo contribution first.</p>}
      {shown.map(r => <div key={r.id} className="border-t border-line p-4 text-sm grid gap-1 md:grid-cols-[6rem_1fr_auto] md:items-center">
        <span className="font-mono text-cyan">#{r.seq}</span>
        <div className="min-w-0"><p className="font-mono truncate" title={r.record_hash}>Hash {short(r.record_hash)}</p><p className="font-mono text-xs text-slate-500 truncate" title={r.prev_hash}>Prev {short(r.prev_hash)}</p>
          <p className="text-xs text-slate-400">{r.payload.payment_ref} · cycle {r.payload.cycle} · {new Date(r.created_at).toLocaleString("en-IN")}</p></div>
        <div className="md:text-right"><p className="font-semibold text-white">{inr(r.payload.amount_paise)}</p>{(() => { const f = anchors.filter(a => a.seq >= r.seq); const cp = f[f.length - 1]; return cp ? <p className="text-xs text-ok">Covered by Sepolia checkpoint #{cp.seq}</p> : <p className="text-xs text-warn">Simulated · not anchored on-chain</p>; })()}</div></div>)}</section>
    <section className="card"><h2 className="font-semibold text-white p-4">On-chain checkpoints (Sepolia testnet)</h2>{anchors.length === 0 && <p className="px-4 pb-4 text-sm text-slate-400">None yet. Only the latest chain hash is published, never member or payment details.</p>}
      {anchors.map(a => <div key={a.tx_hash} className="border-t border-line p-4 text-sm flex flex-wrap gap-x-4 gap-y-1"><span className="font-mono text-cyan">Entry #{a.seq}</span><span>Block {a.block_number}</span>
        <a className="font-mono text-violet underline" target="_blank" rel="noopener noreferrer" href={`https://sepolia.etherscan.io/tx/${a.tx_hash}`}>Tx {short(a.tx_hash)}</a></div>)}</section></div>);
}
