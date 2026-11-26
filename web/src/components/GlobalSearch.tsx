import { useEffect, useRef, useState } from "react"; import { useNavigate } from "react-router-dom"; import { Search } from "lucide-react";
import { supabase } from "../services/supabase";
type Hit = { label: string; hint: string; to: string };
const PAGES: Hit[] = [{ label: "Dashboard", hint: "Page", to: "/" }, { label: "Savings circles", hint: "Page", to: "/circles" }, { label: "Loans", hint: "Page", to: "/loans" }, { label: "Ledger", hint: "Page", to: "/ledger" }, { label: "AI insights", hint: "Page", to: "/ai" }];
export default function GlobalSearch() {
  const nav = useNavigate(); const [q, setQ] = useState(""); const [hits, setHits] = useState<Hit[]>([]); const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const seq = useRef(0);
  useEffect(() => {
    const term = q.trim().replace(/[^A-Za-z0-9 _-]/g, "").slice(0, 40); // letters, digits, space, _ and - only (keeps the filter syntax safe)
    if (!term) { setHits([]); return; }
    const id = ++seq.current; setBusy(true);
    const t = setTimeout(async () => {
      const low = term.toLowerCase(); const pages = PAGES.filter(p => p.label.toLowerCase().includes(low));
      const [c, l] = await Promise.all([supabase.from("savings_circles").select("id,name").ilike("name", `%${term}%`).limit(5),
        supabase.from("ledger_records").select("id,seq,record_hash,payload").or(`record_hash.ilike.%${term}%,payload->>payment_ref.ilike.%${term}%`).limit(5)]);
      if (id !== seq.current) return;
      const circles: Hit[] = (c.data ?? []).map(r => ({ label: r.name as string, hint: "Circle", to: "/circles" }));
      const ledger: Hit[] = (l.data ?? []).map(r => ({ label: `Ledger entry #${r.seq} · ${(r.payload as { payment_ref?: string })?.payment_ref ?? String(r.record_hash).slice(0, 10)}`, hint: "Ledger", to: "/ledger" }));
      setHits([...pages, ...circles, ...ledger]); setBusy(false);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  const go = (h: Hit) => { setOpen(false); setQ(""); nav(h.to); };
  return (<div className="relative flex-1 max-w-sm"><label className="relative block"><span className="sr-only">Search pages, circles and ledger entries</span><Search size={16} className="absolute left-3 top-2.5 text-slate-500" aria-hidden />
    <input className="input pl-9" placeholder="Search pages, circles, ledger" value={q} onChange={e => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
      onKeyDown={e => { if (e.key === "Enter" && hits[0]) go(hits[0]); if (e.key === "Escape") setOpen(false); }} /></label>
    {open && q.trim() && <ul className="absolute z-20 mt-1 w-full rounded-lg border border-line bg-surface shadow-lg" role="listbox">
      {hits.map((h, i) => <li key={i}><button type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-canvas" onMouseDown={() => go(h)}><span className="truncate">{h.label}</span><span className="text-xs text-slate-500">{h.hint}</span></button></li>)}
      {hits.length === 0 && <li className="px-3 py-2 text-sm text-slate-400">{busy ? "Searching…" : "No matches"}</li>}</ul>}</div>);
}
