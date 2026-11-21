import { NavLink, Outlet, Navigate } from "react-router-dom";
import { LayoutDashboard, Users, Landmark, Bell, Search, LogOut, ShieldCheck, Brain } from "lucide-react";
import { useAuth } from "../context/AuthContext"; import { supabase } from "../services/supabase";
const nav = [["/", "Dashboard", LayoutDashboard], ["/circles", "Savings circles", Users], ["/loans", "Loans", Landmark], ["/ledger", "Ledger", ShieldCheck], ["/ai", "AI insights", Brain]] as const;
export default function AppLayout() {
  const { session, loading } = useAuth();
  if (loading) return <p className="p-8">Loading…</p>;
  if (!session) return <Navigate to="/login" replace />;
  return (<div className="min-h-screen md:flex">
    <aside className="md:w-56 border-b md:border-b-0 md:border-r border-line bg-surface p-4">
      <p className="text-lg font-bold text-white mb-4">Fin<span className="text-violet">ova</span></p>
      <nav className="flex md:flex-col gap-1 overflow-x-auto" aria-label="Main">{nav.map(([to, label, Icon]) =>
        <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => `flex items-center gap-2 rounded-lg px-3 py-2 text-sm whitespace-nowrap ${isActive ? "bg-violet text-white" : "text-slate-400 hover:bg-canvas"}`}>
          <Icon size={18} aria-hidden />{label}</NavLink>)}</nav></aside>
    <div className="flex-1 min-w-0">
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <label className="relative flex-1 max-w-sm"><span className="sr-only">Search</span><Search size={16} className="absolute left-3 top-2.5 text-slate-500" aria-hidden />
          <input className="input pl-9" placeholder="Search" /></label>
        <button aria-label="Notifications" className="p-2 rounded-lg hover:bg-surface"><Bell size={18} /></button>
        <span className="hidden sm:block text-xs text-slate-400">{session.user.email}</span>
        <button aria-label="Log out" onClick={() => supabase.auth.signOut()} className="p-2 rounded-lg hover:bg-surface"><LogOut size={18} /></button>
      </header><main className="p-4 md:p-6"><Outlet /></main></div></div>);
}
