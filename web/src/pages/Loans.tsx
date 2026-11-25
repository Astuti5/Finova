import { useEffect, useState, FormEvent } from "react"; import { z } from "zod";
import { supabase } from "../services/supabase"; import { useAuth } from "../context/AuthContext"; import { inr, toPaise } from "../utils/schemas"; import StatusBadge from "../components/StatusBadge";
type Circle = { id: string; name: string; contribution_paise: number };
type Loan = { id: string; circle_id: string; user_id: string; amount_paise: number; duration_months: number; status: string; purpose: string | null; label: string | null };
type Inst = { id: string; loan_id: string; no: number; due_date: string; amount_paise: number; status: string };
const schema = z.object({ amount: z.coerce.number().positive().max(10_000_000), months: z.coerce.number().int().min(1).max(12), purpose: z.string().trim().max(120) });
const friendly = (m: string) => m.includes("open loan") ? "You already have an open loan in this circle." : m.includes("self-approval") ? "You cannot approve your own loan." : m.includes("earlier") ? "Pay the earlier installment first." : m.includes("pending") ? "A payment for this installment is already pending." : m.includes("bad input") ? "Amount must be within 10 times the monthly contribution." : "Could not complete that action.";
export default function Loans() {
  const uid = useAuth().session!.user.id;
  const [circles, setCircles] = useState<Circle[]>([]); const [admin, setAdmin] = useState<Set<string>>(new Set()); const [loans, setLoans] = useState<Loan[]>([]); const [insts, setInsts] = useState<Inst[]>([]); const [pend, setPend] = useState<Record<string, string>>({});
  const [cid, setCid] = useState(""); const [amount, setAmount] = useState(""); const [months, setMonths] = useState("3"); const [purpose, setPurpose] = useState(""); const [method, setMethod] = useState("gpay"); const [scenario, setScenario] = useState("success"); const [msg, setMsg] = useState("");
  const load = async () => {
    const [c, m, l, i, p] = await Promise.all([supabase.from("savings_circles").select("id,name,contribution_paise"), supabase.from("circle_members").select("circle_id").eq("user_id", uid).eq("role", "admin"),
      supabase.from("loans").select("id,circle_id,user_id,amount_paise,duration_months,status,purpose,label").order("created_at", { ascending: false }), supabase.from("loan_installments").select("id,loan_id,no,due_date,amount_paise,status").order("no"),
      supabase.from("payments").select("id,installment_id").eq("kind", "repayment").eq("status", "pending")]);
    if (c.error || l.error || i.error) setMsg("Could not load loans (code " + (c.error?.code ?? l.error?.code ?? i.error?.code) + "). Check that migration 004 ran in Supabase.");
    const cs = (c.data as Circle[]) ?? []; setCircles(cs); setCid(x => x || cs[0]?.id || ""); setAdmin(new Set((m.data ?? []).map(r => r.circle_id))); setLoans((l.data as Loan[]) ?? []); setInsts((i.data as Inst[]) ?? []);
    setPend(Object.fromEntries(((p.data ?? []) as { id: string; installment_id: string }[]).map(r => [r.installment_id, r.id])));
  };
  useEffect(() => { load(); }, []);
  async function call(fn: string, args: object, ok: string) { const { error } = await supabase.rpc(fn, args); setMsg(error ? friendly(error.message) : ok); load(); }
  function request(e: FormEvent) { e.preventDefault(); const p = schema.safeParse({ amount, months, purpose }); if (!p.success || !cid) return setMsg("Check the amount, months and purpose.");
    call("request_loan", { p_circle: cid, p_amount_paise: toPaise(p.data.amount), p_months: p.data.months, p_purpose: p.data.purpose }, "Loan request sent. A circle admin must approve it."); }
  const cur = circles.find(c => c.id === cid); const name = (id: string) => circles.find(c => c.id === id)?.name ?? "Circle";
  const review = loans.filter(l => admin.has(l.circle_id) && l.status === "pending" && l.user_id !== uid); const mine = loans.filter(l => l.user_id === uid);
  return (<div className="space-y-6"><h1 className="text-2xl font-bold text-white">Loans</h1>
    <p className="rounded-lg border border-warn/50 bg-warn/10 p-3 text-sm text-warn">DEMO MODE: loans and repayments are platform records. No real money is lent, transferred or collected.</p>
    {msg && <p role="status" className="text-cyan text-sm">{msg}</p>}
    <form onSubmit={request} className="card p-4 space-y-3 max-w-xl"><h2 className="font-semibold text-white">Request a loan</h2>
      {circles.length === 0 ? <p className="text-sm text-slate-400">Join or create a circle first.</p> : <>
        <select className="input" value={cid} onChange={e => setCid(e.target.value)} aria-label="Circle">{circles.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <input className="input" inputMode="decimal" placeholder={`Amount in ₹ (max ${cur ? inr(cur.contribution_paise * 10) : ""})`} value={amount} onChange={e => setAmount(e.target.value)} aria-label="Amount" />
        <select className="input" value={months} onChange={e => setMonths(e.target.value)} aria-label="Months">{Array.from({ length: 12 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n} month{n > 1 ? "s" : ""}</option>)}</select>
        <input className="input" maxLength={120} placeholder="Purpose (optional)" value={purpose} onChange={e => setPurpose(e.target.value)} aria-label="Purpose" /><button className="btn">Submit request</button></>}</form>
    {review.length > 0 && <section className="card p-4 space-y-2"><h2 className="font-semibold text-white">Requests to review (admin)</h2>{review.map(l => <div key={l.id} className="flex flex-wrap items-center gap-3 border-t border-line pt-2 text-sm first:border-0 first:pt-0">
      <span className="flex-1">{l.label} · {name(l.circle_id)} · {inr(l.amount_paise)} over {l.duration_months} mo{l.purpose ? ` · ${l.purpose}` : ""}</span>
      <button className="text-ok underline" onClick={() => call("review_loan", { p_loan: l.id, p_approve: true }, "Loan approved. Schedule created.")}>Approve</button>
      <button className="text-bad underline" onClick={() => call("review_loan", { p_loan: l.id, p_approve: false }, "Loan rejected.")}>Reject</button></div>)}</section>}
    <section className="space-y-3"><h2 className="font-semibold text-white">My loans</h2>{mine.length === 0 && <p className="text-sm text-slate-400">No loans yet.</p>}
      {mine.map(l => { const rows = insts.filter(i => i.loan_id === l.id); const next = rows.find(i => i.status === "due"); return (<div key={l.id} className="card p-4 space-y-2">
        <div className="flex flex-wrap items-center gap-3"><b className="text-white">{inr(l.amount_paise)}</b><span className="text-sm text-slate-400">{name(l.circle_id)} · {l.duration_months} months</span><StatusBadge status={l.status} /></div>
        {l.purpose && <p className="text-sm text-slate-400">{l.purpose}</p>}
        {rows.length > 0 && <table className="w-full text-sm"><thead className="text-left text-slate-400"><tr><th>#</th><th>Due</th><th>Amount</th><th>Status</th></tr></thead><tbody>{rows.map(i => <tr key={i.id} className="border-t border-line"><td>{i.no}</td><td>{new Date(i.due_date).toLocaleDateString("en-IN")}</td><td>{inr(i.amount_paise)}</td><td><StatusBadge status={i.status} /></td></tr>)}</tbody></table>}
        {l.status === "approved" && next && (pend[next.id] ? <button className="btn" onClick={() => call("confirm_payment", { p_id: pend[next.id] }, "Pending payment confirmed (demo).")}>Confirm pending payment (demo)</button> :
          <div className="flex flex-wrap items-center gap-2 text-sm"><select className="input max-w-[9rem]" value={method} onChange={e => setMethod(e.target.value)} aria-label="UPI app"><option value="gpay">Google Pay</option><option value="phonepe">PhonePe</option><option value="paytm">Paytm</option></select>
            <select className="input max-w-[9rem]" value={scenario} onChange={e => setScenario(e.target.value)} aria-label="Demo outcome"><option value="success">Success</option><option value="failed">Failed</option><option value="pending">Pending</option></select>
            <button className="btn" onClick={() => call("repay_installment", { p_installment: next.id, p_method: method, p_scenario: scenario, p_key: crypto.randomUUID() }, scenario === "success" ? "Installment paid (demo)." : scenario === "failed" ? "Payment failed (demo). Nothing was recorded." : "Payment pending (demo).")}>Pay installment {next.no} (demo)</button></div>)}</div>); })}</section></div>);
}
