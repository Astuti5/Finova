import { useState } from "react"; import { supabase } from "../services/supabase";
type J = Record<string, any>; type F = Record<string, string>;
const CREDIT0: F = { on_time_ratio: "0.9", delay_std_days: "2", tenure_cycles: "12", past_defaults: "0", income_monthly: "18000", income_volatility: "0.2", loan_to_income: "0.5", group_avg_on_time: "0.85" };
const TX0: F = { amount_ratio: "1", tx_per_hour: "0", hours_since_prev: "24", hour_of_day: "14" };
const REPLY: Record<string, (a?: number) => string> = {
  request_loan: a => `${a ? `₹${a} ka ` : ""}loan request samjha gaya. (Demo: loan screens abhi available nahi hain, koi paisa nahi bheja gaya.)`,
  check_trust_score: () => "Neeche Credit risk card se demo score dekh sakte hain. Yeh asli creditworthiness nahi hai.",
  why_score_low: () => "Score ko on-time payments, delay, past defaults aur loan-to-income jaise factors prabhavit karte hain (Credit risk card mein dikhte hain).",
  payout_turn: () => "Payout order abhi app mein available nahi hai.", my_contribution: () => "Apna total contribution Dashboard par dekhein.", unknown: () => "Samajh nahi aaya, dobara try karein.",
};
const nums = (v: F) => Object.fromEntries(Object.entries(v).map(([k, x]) => [k, Number(x)]));
function Fields({ v, set }: { v: F; set: (x: F) => void }) {
  return <div className="grid grid-cols-2 gap-3">{Object.keys(v).map(k => <label key={k} className="text-xs text-slate-400">{k}<input className="input mt-1" inputMode="decimal" value={v[k]} onChange={e => set({ ...v, [k]: e.target.value })} /></label>)}</div>;
}
export default function AI() {
  const [credit, setCredit] = useState(CREDIT0), [tx, setTx] = useState(TX0), [text, setText] = useState("mujhe 5000 ka loan chahiye");
  const [cr, setCr] = useState<J | null>(null), [ar, setAr] = useState<J | null>(null), [nr, setNr] = useState<J | null>(null); const [err, setErr] = useState(""), [busy, setBusy] = useState("");
  async function run(kind: string, input: J, set: (r: J) => void) {
    setErr(""); if (Object.values(input).some(x => typeof x === "number" && !Number.isFinite(x))) return setErr("Enter valid numbers.");
    setBusy(kind); const { data, error } = await supabase.functions.invoke("ml-proxy", { body: { kind, input } }); setBusy("");
    if (error) return setErr("No result. The ML service may not be configured, or an input is out of range."); set(data);
  }
  return (<div className="space-y-6"><h1 className="text-2xl font-bold text-white">AI insights</h1>
    <p className="rounded-lg border border-warn/50 bg-warn/10 p-3 text-sm text-warn">DEMO: models are trained on synthetic data. Outputs are not real creditworthiness, fraud verdicts or financial advice.</p>
    {err && <p role="alert" className="text-bad text-sm">{err}</p>}
    <section className="card p-4 space-y-3"><h2 className="font-semibold text-white">Credit risk (what-if)</h2><Fields v={credit} set={setCredit} />
      <button className="btn" disabled={!!busy} onClick={() => run("credit", nums(credit), setCr)}>{busy === "credit" ? "Scoring…" : "Estimate risk"}</button>
      {cr && <div className="text-sm space-y-1"><p>Default probability <b className="text-white">{(cr.default_probability * 100).toFixed(1)}%</b> · category <b className={cr.risk_category === "low" ? "text-ok" : cr.risk_category === "medium" ? "text-warn" : "text-bad"}>{cr.risk_category}</b></p>
        <ul className="list-disc pl-5 text-slate-300">{cr.factors.map((f: J) => <li key={f.feature}>{f.feature}: {f.effect}</li>)}</ul><p className="text-xs text-slate-500">{cr.disclaimer} Model {cr.model_version}. Factors are linear contributions, not SHAP.</p></div>}</section>
    <section className="card p-4 space-y-3"><h2 className="font-semibold text-white">Transaction anomaly check</h2><Fields v={tx} set={setTx} />
      <button className="btn" disabled={!!busy} onClick={() => run("anomaly", nums(tx), setAr)}>{busy === "anomaly" ? "Checking…" : "Check transaction"}</button>
      {ar && <div className="text-sm"><p>{ar.flagged ? <b className="text-warn">Flagged as unusual</b> : <b className="text-ok">Looks normal</b>} · score {ar.anomaly_score}</p>
        {ar.indicators.length > 0 && <ul className="list-disc pl-5 text-slate-300">{ar.indicators.map((i: string) => <li key={i}>{i}</li>)}</ul>}</div>}</section>
    <section className="card p-4 space-y-3"><h2 className="font-semibold text-white">Hinglish assistant</h2>
      <input className="input" maxLength={200} value={text} onChange={e => setText(e.target.value)} aria-label="Message" />
      <button className="btn" disabled={!!busy || !text.trim()} onClick={() => run("nlp", { text: text.trim() }, setNr)}>{busy === "nlp" ? "Thinking…" : "Send"}</button>
      {nr && <div className="text-sm space-y-1"><p className="text-slate-400">Intent: {nr.intent} ({(nr.confidence * 100).toFixed(0)}%){nr.amount_rupees ? ` · amount ₹${nr.amount_rupees}` : ""}</p><p className="text-white">{(REPLY[nr.intent] ?? REPLY.unknown)(nr.amount_rupees ?? undefined)}</p></div>}</section></div>);
}
