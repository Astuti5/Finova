import { useEffect, useRef, useState } from "react"; import { useParams } from "react-router-dom";
import { supabase } from "../services/supabase"; import { inr } from "../utils/schemas"; import StatusBadge from "../components/StatusBadge"; import { friendly } from "../utils/errors";
type P = { id: string; demo_ref: string; amount_paise: number; method: string; status: string; created_at: string };
const METHODS = [["gpay", "Google Pay"], ["phonepe", "PhonePe"], ["paytm", "Paytm"]] as const;
export default function Pay() {
  const { circleId } = useParams(); const key = useRef(crypto.randomUUID());
  const [circle, setCircle] = useState<{ name: string; contribution_paise: number } | null>(null);
  const [method, setMethod] = useState("gpay"); const [scenario, setScenario] = useState("success"); const [sure, setSure] = useState(false);
  const [pay, setPay] = useState<P | null>(null); const [hash, setHash] = useState<string | null>(null); const [hist, setHist] = useState<P[]>([]); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false); const [demo, setDemo] = useState(true);
  const loadHist = async () => { const { data } = await supabase.from("payments").select("id,demo_ref,amount_paise,method,status,created_at").eq("circle_id", circleId!).order("created_at", { ascending: false }).limit(10); setHist((data as P[]) ?? []); };
  useEffect(() => { supabase.from("savings_circles").select("name,contribution_paise").eq("id", circleId!).single().then(({ data }) => setCircle(data)); loadHist(); supabase.rpc("is_demo_mode").then(({ data }) => setDemo(data !== false)); }, [circleId]);
  async function done(p: P) { setPay(p); setHash(null); if (p.status === "success") { const { data } = await supabase.from("ledger_records").select("record_hash").eq("payment_id", p.id).maybeSingle(); setHash(data?.record_hash ?? null); } loadHist(); }
  async function go(fn: string, args: object) { setBusy(true); setErr(""); const { data, error } = await supabase.rpc(fn, args); setBusy(false); setSure(false); if (error) return setErr(friendly(error.message, "Payment could not be processed.")); done(data as P); }
  if (!circle) return <p>Loading…</p>;
  return (<div className="max-w-xl space-y-4"><h1 className="text-2xl font-bold text-white">Contribute to {circle.name}</h1>
    {demo ? <p className="rounded-lg border border-warn/50 bg-warn/10 p-3 text-sm text-warn">DEMO MODE: no real money moves, no UPI PIN is collected, and this is not a real Google Pay, PhonePe or Paytm transaction.</p> : <p className="rounded-lg border border-cyan/40 bg-cyan/10 p-3 text-sm text-cyan">Live mode: a payment stays pending until the payment gateway confirms it. It is only recorded in the ledger after that.</p>}
    {err && <p role="alert" className="text-bad text-sm">{err}</p>}
    {!pay ? (<div className="card p-4 space-y-4"><p className="text-3xl font-bold text-white">{inr(circle.contribution_paise)}</p>
      <fieldset className="space-y-2"><legend className="text-sm text-slate-400">Simulated UPI app</legend>{METHODS.map(([v, l]) => <label key={v} className="flex items-center gap-2 text-sm"><input type="radio" name="m" checked={method === v} onChange={() => setMethod(v)} />{l} (demo)</label>)}</fieldset>
      {demo && <label className="block text-sm">Demo outcome<select className="input mt-1" value={scenario} onChange={e => setScenario(e.target.value)}><option value="success">Success</option><option value="failed">Failed</option><option value="pending">Pending</option></select></label>}
      {!sure ? <button className="btn" onClick={() => setSure(true)}>Pay {inr(circle.contribution_paise)} (demo)</button> :
        <div className="space-y-2"><p className="text-sm">Confirm demo payment of <b>{inr(circle.contribution_paise)}</b>?</p>
          <button className="btn" disabled={busy} onClick={() => go("pay_contribution", { p_circle: circleId, p_method: method, p_scenario: scenario, p_key: key.current })}>{busy ? "Processing…" : "Confirm"}</button>
          <button className="ml-3 text-sm text-slate-400" onClick={() => setSure(false)}>Cancel</button></div>}</div>) :
      (<div className="card p-4 space-y-2"><h2 className="font-semibold text-white">Receipt (demo)</h2><StatusBadge status={pay.status} />
        <dl className="text-sm grid grid-cols-[8rem_1fr] gap-1"><dt className="text-slate-400">Demo ID</dt><dd className="font-mono">{pay.demo_ref}</dd><dt className="text-slate-400">Amount</dt><dd>{inr(pay.amount_paise)}</dd>
          <dt className="text-slate-400">Method</dt><dd>{pay.method} (simulated)</dd><dt className="text-slate-400">Date</dt><dd>{new Date(pay.created_at).toLocaleString("en-IN")}</dd>
          <dt className="text-slate-400">Ledger hash</dt><dd className="font-mono break-all">{hash ?? (pay.status === "success" ? "…" : "Not recorded")}</dd>
          <dt className="text-slate-400">Verification</dt><dd>{hash ? "Hash-chained, simulated ledger (not on-chain)" : "No contribution recorded"}</dd></dl>
        {pay.status === "pending" && demo && <button className="btn" disabled={busy} onClick={() => go("confirm_payment", { p_id: pay.id })}>Confirm pending payment (demo)</button>}
        <button className="block text-sm text-cyan underline" onClick={() => { key.current = crypto.randomUUID(); setPay(null); }}>New payment</button></div>)}
    <section className="card p-4"><h2 className="font-semibold text-white mb-2">Your payments</h2>{hist.length === 0 && <p className="text-sm text-slate-400">None yet.</p>}
      {hist.map(h => <div key={h.id} className="flex justify-between border-t border-line py-2 text-sm first:border-0"><span className="font-mono">{h.demo_ref}</span><span>{inr(h.amount_paise)}</span><StatusBadge status={h.status === "success" ? "completed" : h.status} /></div>)}</section></div>);
}
