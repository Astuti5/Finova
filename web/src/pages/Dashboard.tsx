import { useEffect, useState } from "react"; import { PiggyBank, Users, Landmark, Clock } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { supabase } from "../services/supabase"; import { inr } from "../utils/schemas"; import { useAuth } from "../context/AuthContext"; import StatCard from "../components/StatCard"; import StatusBadge from "../components/StatusBadge";
type C = { id: string; amount_paise: number; status: string; created_at: string };
export default function Dashboard() {
  const uid = useAuth().session!.user.id;
  const [c, setC] = useState<C[]>([]); const [circles, setCircles] = useState(0); const [loans, setLoans] = useState(0); const [err, setErr] = useState("");
  useEffect(() => { (async () => { // filtered to this user; RLS also enforces access
    const [a, b, d] = await Promise.all([
      supabase.from("contributions").select("id,amount_paise,status,created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(200),
      supabase.from("circle_members").select("circle_id", { count: "exact", head: true }).eq("user_id", uid),
      supabase.from("loans").select("amount_paise").in("status", ["pending", "approved"])]);
    if (a.error || b.error || d.error) return setErr("Could not load your data.");
    setC(a.data as C[]); setCircles(b.count ?? 0); setLoans((d.data ?? []).reduce((s, l) => s + l.amount_paise, 0));
  })(); }, []);
  const total = c.reduce((s, x) => s + x.amount_paise, 0);
  const byMonth = Object.entries(c.reduce<Record<string, number>>((m, x) => { const k = x.created_at.slice(0, 7); m[k] = (m[k] ?? 0) + x.amount_paise / 100; return m; }, {})).sort().map(([month, rupees]) => ({ month, rupees }));
  return (<div className="space-y-6"><h1 className="text-2xl font-bold text-white">Dashboard</h1>
    {err && <p role="alert" className="text-bad">{err}</p>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Total contributions (recorded)" value={inr(total)} Icon={PiggyBank} tone="text-ok" />
      <StatCard label="Active circles" value={String(circles)} Icon={Users} tone="text-violet" />
      <StatCard label="Outstanding loan requests" value={inr(loans)} Icon={Landmark} tone="text-warn" />
      <StatCard label="Pending contributions" value={String(c.filter(x => x.status === "pending").length)} Icon={Clock} /></div>
    <section className="card p-4"><h2 className="font-semibold text-white mb-3">Monthly contributions</h2>
      {byMonth.length === 0 ? <p className="text-sm text-slate-400">No contributions yet. Join or create a circle to get started.</p> :
        <div className="h-64"><ResponsiveContainer><BarChart data={byMonth}><XAxis dataKey="month" stroke="#64748b" /><YAxis stroke="#64748b" />
          <Tooltip contentStyle={{ background: "#131822", border: "1px solid #232B3A" }} /><Bar dataKey="rupees" fill="#8B5CF6" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>}</section>
    <section className="card overflow-x-auto"><h2 className="font-semibold text-white p-4">Recent transactions</h2>
      <table className="w-full text-sm"><thead className="text-left text-slate-400"><tr><th className="px-4 py-2">Date</th><th>Amount</th><th>Status</th></tr></thead>
        <tbody>{c.slice(0, 8).map(x => <tr key={x.id} className="border-t border-line"><td className="px-4 py-2">{new Date(x.created_at).toLocaleDateString("en-IN")}</td><td>{inr(x.amount_paise)}</td><td><StatusBadge status={x.status} /></td></tr>)}</tbody></table>
      <p className="p-4 text-xs text-slate-500">Entries are platform records. No real money moves through Finova.</p></section></div>);
}
