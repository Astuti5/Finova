import { useEffect, useState, FormEvent } from "react"; import { Link } from "react-router-dom";
import { supabase } from "../services/supabase"; import { useAuth } from "../context/AuthContext"; import { circleSchema, inviteSchema, toPaise, inr } from "../utils/schemas";
type Circle = { id: string; name: string; contribution_paise: number; invite_code: string; invite_expires_at: string };
type Req = { circle_id: string; user_id: string; label: string; status: string };
export default function Circles() {
  const uid = useAuth().session!.user.id;
  const [list, setList] = useState<Circle[]>([]); const [admin, setAdmin] = useState<Set<string>>(new Set()); const [reqs, setReqs] = useState<Req[]>([]);
  const [name, setName] = useState(""); const [amt, setAmt] = useState(""); const [code, setCode] = useState(""); const [msg, setMsg] = useState("");
  const load = async () => {
    const [c, m, r] = await Promise.all([supabase.from("savings_circles").select("id,name,contribution_paise,invite_code,invite_expires_at"),
      supabase.from("circle_members").select("circle_id").eq("user_id", uid).eq("role", "admin"), supabase.from("join_requests").select("circle_id,user_id,label,status").eq("status", "pending")]);
    setList((c.data as Circle[]) ?? []); setAdmin(new Set((m.data ?? []).map(x => x.circle_id))); setReqs((r.data as Req[]) ?? []); };
  useEffect(() => { load(); }, []);
  const run = async (fn: string, args: object, ok: string, bad: string) => { const { error } = await supabase.rpc(fn, args); setMsg(error ? bad : ok); load(); };
  function create(e: FormEvent) { e.preventDefault(); const p = circleSchema.safeParse({ name, contribution_rupees: amt }); if (!p.success) return setMsg(p.error.issues[0].message);
    run("create_circle", { p_name: p.data.name, p_contribution_paise: toPaise(p.data.contribution_rupees) }, "Circle created.", "Could not create circle."); }
  function join(e: FormEvent) { e.preventDefault(); const p = inviteSchema.safeParse(code.toUpperCase()); if (!p.success) return setMsg(p.error.issues[0].message);
    run("join_circle", { p_code: p.data }, "Request sent. An admin must approve it.", "Invalid, expired or revoked code (or too many attempts)."); }
  return (<div className="space-y-6"><h1 className="text-2xl font-bold text-white">Savings circles</h1>{msg && <p role="status" className="text-cyan text-sm">{msg}</p>}
    <div className="grid gap-4 md:grid-cols-2">
      <form onSubmit={create} className="card p-4 space-y-3"><h2 className="font-semibold text-white">Create a circle</h2>
        <input className="input" placeholder="Circle name" value={name} onChange={e => setName(e.target.value)} aria-label="Circle name" />
        <input className="input" placeholder="Monthly contribution (₹)" inputMode="decimal" value={amt} onChange={e => setAmt(e.target.value)} aria-label="Monthly contribution" /><button className="btn">Create circle</button></form>
      <form onSubmit={join} className="card p-4 space-y-3"><h2 className="font-semibold text-white">Join with invite code</h2><p className="text-xs text-slate-400">A valid code sends a request; a circle admin approves it.</p>
        <input className="input" placeholder="8-character code" value={code} onChange={e => setCode(e.target.value)} aria-label="Invite code" maxLength={8} /><button className="btn">Request to join</button></form></div>
    <ul className="grid gap-3 md:grid-cols-2">{list.length === 0 && <li className="text-sm text-slate-400">You are not in any circle yet.</li>}
      {list.map(c => { const isAdmin = admin.has(c.id); return (<li key={c.id} className="card p-4 space-y-2">
        <p className="font-semibold text-white">{c.name} {isAdmin && <span className="text-xs text-violet">Admin</span>}</p>
        <p className="text-sm text-slate-400">{inr(c.contribution_paise)} per cycle</p>
        {isAdmin && <p className="text-sm">Invite code <b className="text-cyan font-mono">{c.invite_code}</b> <span className="text-xs text-slate-500">expires {new Date(c.invite_expires_at).toLocaleDateString("en-IN")}</span>
          <button className="ml-2 text-xs text-violet underline" onClick={() => run("rotate_invite", { p_circle: c.id }, "New code generated.", "Could not rotate.")}>New code</button></p>}
        {isAdmin && reqs.filter(r => r.circle_id === c.id && r.user_id !== uid).map(r => <div key={r.user_id} className="flex items-center gap-2 text-sm"><span className="flex-1">{r.label}</span>
          <button className="text-ok underline" onClick={() => run("review_join", { p_circle: c.id, p_user: r.user_id, p_approve: true }, "Member approved.", "Failed.")}>Approve</button>
          <button className="text-bad underline" onClick={() => run("review_join", { p_circle: c.id, p_user: r.user_id, p_approve: false }, "Request rejected.", "Failed.")}>Reject</button></div>)}
        <div className="flex gap-3 text-sm"><Link className="text-cyan underline" to={`/pay/${c.id}`}>Pay contribution (demo)</Link><Link className="text-cyan underline" to="/ledger">Ledger</Link></div></li>); })}</ul>
    {reqs.filter(r => r.user_id === uid).map(r => <p key={r.circle_id} className="text-sm text-warn">You have a join request awaiting admin approval.</p>)}</div>);
}
