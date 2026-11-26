import { useEffect, useState, FormEvent } from "react"; import { Link } from "react-router-dom";
import { supabase } from "../services/supabase"; import { useAuth } from "../context/AuthContext"; import { circleSchema, inviteSchema, toPaise, inr } from "../utils/schemas"; import { friendly } from "../utils/errors";
type Circle = { id: string; name: string; contribution_paise: number; owner_id: string; invite_expires_at: string; started_at: string | null; cycle_days: number; interest_bps: number };
type Req = { circle_id: string; user_id: string; label: string; status: string };
type Member = { user_id: string; role: string; payout_pos: number | null; label: string };
export default function Circles() {
  const uid = useAuth().session!.user.id;
  const [list, setList] = useState<Circle[]>([]); const [admin, setAdmin] = useState<Set<string>>(new Set()); const [reqs, setReqs] = useState<Req[]>([]);
  const [codes, setCodes] = useState<Record<string, string>>({}); const [members, setMembers] = useState<Record<string, Member[]>>({});
  const [name, setName] = useState(""); const [amt, setAmt] = useState(""); const [code, setCode] = useState(""); const [msg, setMsg] = useState(""); const [days, setDays] = useState("30"); const [rate, setRate] = useState("0");
  const load = async () => {
    const [c, m, r] = await Promise.all([supabase.from("savings_circles").select("id,name,contribution_paise,owner_id,invite_expires_at,started_at,cycle_days,interest_bps"),
      supabase.from("circle_members").select("circle_id").eq("user_id", uid).eq("role", "admin"), supabase.from("join_requests").select("circle_id,user_id,label,status").eq("status", "pending")]);
    if (c.error || m.error || r.error) setMsg("Could not load circles (code " + (c.error?.code ?? m.error?.code ?? r.error?.code) + "). Check that all migrations (001 to 005) ran in Supabase.");
    const cs = (c.data as Circle[]) ?? []; const adm = new Set((m.data ?? []).map(x => x.circle_id));
    setList(cs); setAdmin(adm); setReqs((r.data as Req[]) ?? []);
    const cd: Record<string, string> = {}, ms: Record<string, Member[]> = {}; // invite codes and the member list are only served to admins
    await Promise.all(cs.filter(x => adm.has(x.id)).map(async x => { const [i, l] = await Promise.all([supabase.rpc("get_invite", { p_circle: x.id }), supabase.rpc("list_members", { p_circle: x.id })]);
      if (i.data?.[0]) cd[x.id] = i.data[0].code; ms[x.id] = (l.data as Member[]) ?? []; }));
    setCodes(cd); setMembers(ms); };
  useEffect(() => { load(); }, []);
  const run = async (fn: string, args: object, ok: string, bad: string) => { const { error } = await supabase.rpc(fn, args); setMsg(error ? friendly(error.message, bad) : ok); load(); };
  function create(e: FormEvent) { e.preventDefault(); const p = circleSchema.safeParse({ name, contribution_rupees: amt }); if (!p.success) return setMsg(p.error.issues[0].message);
    run("create_circle", { p_name: p.data.name, p_contribution_paise: toPaise(p.data.contribution_rupees) }, "Circle created.", "Could not create circle."); }
  function join(e: FormEvent) { e.preventDefault(); const p = inviteSchema.safeParse(code.toUpperCase()); if (!p.success) return setMsg(p.error.issues[0].message);
    supabase.rpc("join_circle", { p_code: p.data }).then(({ data, error }) => { setMsg(error ? "Too many attempts. Try again later." : data ? "Request sent. An admin must approve it." : "Invalid, expired or revoked code."); load(); }); }
  function start(id: string) { const d = Number(days), r = Number(rate); if (!Number.isInteger(d) || d < 1 || d > 366 || !(r >= 0 && r <= 30)) return setMsg("Cycle length must be 1 to 366 days and interest 0 to 30 % per month.");
    run("start_circle", { p_circle: id, p_cycle_days: d, p_interest_bps: Math.round(r * 100) }, "Circle started. Members are locked in and the payout order is set.", "Could not start the circle."); }
  return (<div className="space-y-6"><h1 className="text-2xl font-bold text-white">Savings circles</h1>{msg && <p role="status" className="text-cyan text-sm">{msg}</p>}
    <div className="grid gap-4 md:grid-cols-2">
      <form onSubmit={create} className="card p-4 space-y-3"><h2 className="font-semibold text-white">Create a circle</h2>
        <input className="input" placeholder="Circle name" value={name} onChange={e => setName(e.target.value)} aria-label="Circle name" />
        <input className="input" placeholder="Contribution per cycle (₹)" inputMode="decimal" value={amt} onChange={e => setAmt(e.target.value)} aria-label="Contribution per cycle" /><button className="btn">Create circle</button></form>
      <form onSubmit={join} className="card p-4 space-y-3"><h2 className="font-semibold text-white">Join with invite code</h2><p className="text-xs text-slate-400">A valid code sends a request; a circle admin approves it.</p>
        <input className="input" placeholder="8-character code" value={code} onChange={e => setCode(e.target.value)} aria-label="Invite code" maxLength={8} /><button className="btn">Request to join</button></form></div>
    <ul className="grid gap-3 md:grid-cols-2">{list.length === 0 && <li className="text-sm text-slate-400">You are not in any circle yet.</li>}
      {list.map(c => { const isAdmin = admin.has(c.id), isOwner = c.owner_id === uid; return (<li key={c.id} className="card p-4 space-y-2">
        <p className="font-semibold text-white">{c.name} {isAdmin && <span className="text-xs text-violet">Admin</span>} {isOwner && <span className="text-xs text-cyan">Owner</span>}</p>
        <p className="text-sm text-slate-400">{inr(c.contribution_paise)} per cycle · {c.started_at ? `started, ${c.cycle_days}-day cycles${c.interest_bps ? `, loans at ${(c.interest_bps / 100).toFixed(2)}% per month` : ", interest-free loans"}` : "not started yet"}</p>
        {isAdmin && codes[c.id] && <p className="text-sm">Invite code <b className="text-cyan font-mono">{codes[c.id]}</b> <span className="text-xs text-slate-500">expires {new Date(c.invite_expires_at).toLocaleDateString("en-IN")}</span>
          <button className="ml-2 text-xs text-violet underline" onClick={() => run("rotate_invite", { p_circle: c.id }, "New code generated.", "Could not rotate.")}>New code</button></p>}
        {isAdmin && reqs.filter(r => r.circle_id === c.id && r.user_id !== uid).map(r => <div key={r.user_id} className="flex items-center gap-2 text-sm"><span className="flex-1">{r.label}</span>
          <button className="text-ok underline" onClick={() => run("review_join", { p_circle: c.id, p_user: r.user_id, p_approve: true }, "Member approved.", "Failed.")}>Approve</button>
          <button className="text-bad underline" onClick={() => run("review_join", { p_circle: c.id, p_user: r.user_id, p_approve: false }, "Request rejected.", "Failed.")}>Reject</button></div>)}
        {isAdmin && (members[c.id]?.length ?? 0) > 0 && <div className="text-sm space-y-1"><p className="text-xs text-slate-400">Members{c.started_at ? " and payout order" : ""}</p>
          {members[c.id].map(m => <div key={m.user_id} className="flex items-center gap-2"><span className="flex-1">{m.label}{m.user_id === uid ? " (you)" : ""} <span className="text-xs text-slate-500">{m.role}{m.payout_pos ? ` · payout #${m.payout_pos}` : ""}</span></span>
            {isOwner && m.role === "member" && <button className="text-xs text-violet underline" onClick={() => run("set_member_role", { p_circle: c.id, p_user: m.user_id, p_role: "admin" }, "Member is now an admin. Loans can be approved by a second person.", "Could not change role.")}>Make admin</button>}</div>)}</div>}
        {isAdmin && !c.started_at && <div className="flex flex-wrap items-center gap-2 text-sm"><input className="input max-w-[6rem]" inputMode="numeric" value={days} onChange={e => setDays(e.target.value)} aria-label="Cycle length in days" /><span className="text-xs text-slate-400">days per cycle</span>
          <input className="input max-w-[6rem]" inputMode="decimal" value={rate} onChange={e => setRate(e.target.value)} aria-label="Loan interest percent per month" /><span className="text-xs text-slate-400">% / month on loans</span>
          <button className="btn" onClick={() => start(c.id)}>Start circle</button></div>}
        {isAdmin && c.started_at && <button className="text-sm text-violet underline" onClick={() => run("record_payout", { p_circle: c.id }, "Payout recorded in the ledger (demo).", "Could not record payout.")}>Record next payout (demo)</button>}
        <div className="flex gap-3 text-sm"><Link className="text-cyan underline" to={`/pay/${c.id}`}>Pay contribution</Link><Link className="text-cyan underline" to="/ledger">Ledger</Link></div></li>); })}</ul>
    {reqs.filter(r => r.user_id === uid).map(r => <p key={r.circle_id} className="text-sm text-warn">You have a join request awaiting admin approval.</p>)}</div>);
}
