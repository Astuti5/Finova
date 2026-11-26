import { CheckCircle2, Clock, XCircle, AlertTriangle } from "lucide-react";
const map = { completed:["Completed","text-ok",CheckCircle2], recorded:["Recorded","text-ok",CheckCircle2], approved:["Approved","text-ok",CheckCircle2],
  closed:["Closed","text-ok",CheckCircle2], paid:["Paid","text-ok",CheckCircle2], due:["Due","text-warn",Clock], overdue:["Overdue","text-bad",AlertTriangle], pending:["Pending","text-warn",Clock], flagged:["Flagged","text-warn",AlertTriangle], rejected:["Rejected","text-bad",XCircle], failed:["Failed","text-bad",XCircle] } as const;
export default function StatusBadge({ status }: { status: string }) {
  const [label, cls, Icon] = (map as any)[status] ?? [status, "text-slate-400", Clock];
  return <span className={`inline-flex items-center gap-1 text-xs font-medium ${cls}`}><Icon size={14} aria-hidden />{label}</span>;
}
