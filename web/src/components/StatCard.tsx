import type { LucideIcon } from "lucide-react";
export default function StatCard({ label, value, Icon, tone = "text-cyan" }: { label: string; value: string; Icon: LucideIcon; tone?: string }) {
  return <div className="card p-4 flex items-center gap-3"><div className={`rounded-lg bg-canvas p-2 ${tone}`}><Icon size={20} aria-hidden /></div>
    <div><p className="text-xs text-slate-400">{label}</p><p className="text-xl font-semibold text-white">{value}</p></div></div>;
}
