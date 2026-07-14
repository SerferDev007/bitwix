import { Fragment, useEffect, useState } from "react";
import { hrApi, type PayrollRun, type PayrollLine } from "../lib/hrApi";
import { useHrAuth } from "./HrRequireAuth";
import { useCurrency } from "../lib/currency";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Loader2, AlertCircle, CheckCircle2, Play, Check, ChevronRight, ChevronDown } from "lucide-react";

const statusStyle: Record<string, string> = {
  DRAFT: "bg-amber-500/15 text-amber-700",
  APPROVED: "bg-blue-500/15 text-blue-700",
  POSTED: "bg-green-500/15 text-green-700",
};

export function HrPayrollPage() {
  const { can } = useHrAuth();
  const { format } = useCurrency();
  const canRun = can("payroll.run");
  const canApprove = can("payroll.approve");

  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [lines, setLines] = useState<Record<number, PayrollLine[]>>({});
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    hrApi.payrollRuns()
      .then((r) => { if (r.success && r.data) setRuns(r.data); else setError(r.message || "Could not load payroll runs."); })
      .catch(() => setError("Unable to reach the server."))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const runPayroll = async () => {
    setError(null); setNotice(null); setBusy(true);
    try {
      const res = await hrApi.createPayrollRun();
      if (res.success && res.data) { setNotice(`Drafted a run for ${res.data.employees} employee(s).`); load(); }
      else setError(res.message || "Could not run payroll.");
    } finally { setBusy(false); }
  };

  const approve = async (run: PayrollRun) => {
    setError(null); setNotice(null);
    const res = await hrApi.approvePayrollRun(run.id);
    if (res.success) { setNotice(res.message || `Run ${run.label} approved and posted to the ledger.`); load(); }
    else setError(res.message || "Could not approve the run.");
  };

  const toggle = async (run: PayrollRun) => {
    const isOpen = !open[run.id];
    setOpen((s) => ({ ...s, [run.id]: isOpen }));
    if (isOpen && !lines[run.id]) {
      const res = await hrApi.payrollRun(run.id);
      if (res.success && res.data) setLines((s) => ({ ...s, [run.id]: res.data!.lines }));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Payroll</h1>
          <p className="text-muted-foreground text-sm">Run payroll from the active roster; on approval it posts to the finance ledger, split into Cost of Revenue vs Operating Expense by cost center.</p>
        </div>
        {canRun && (
          <Button onClick={runPayroll} disabled={busy} className="flex items-center gap-2 flex-shrink-0">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Run payroll
          </Button>
        )}
      </div>

      {error && <div className="flex items-start gap-2 rounded-md bg-red-500/10 text-red-700 p-3 text-sm"><AlertCircle className="h-5 w-5 mt-0.5" /><span>{error}</span></div>}
      {notice && <div className="flex items-start gap-2 rounded-md bg-green-500/10 text-green-700 p-3 text-sm"><CheckCircle2 className="h-5 w-5 mt-0.5" /><span>{notice}</span></div>}

      <Card>
        <CardHeader><CardTitle className="text-lg">Payroll runs</CardTitle></CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-10 flex justify-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : runs.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No payroll runs yet.{canRun ? " Click “Run payroll” to draft one." : ""}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 w-6"></th>
                    <th className="px-4 py-3">Period</th>
                    <th className="px-4 py-3">Employees</th>
                    <th className="px-4 py-3">Gross</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Ledger entry</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {runs.map((run) => (
                    <Fragment key={run.id}>
                      <tr className="hover:bg-muted/30 cursor-pointer" onClick={() => toggle(run)}>
                        <td className="px-4 py-3 text-muted-foreground">{open[run.id] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
                        <td className="px-4 py-3 font-medium">{run.label}</td>
                        <td className="px-4 py-3 text-muted-foreground">{run.employees ?? "—"}</td>
                        <td className="px-4 py-3">{format(run.gross_total, { decimals: 2 })}</td>
                        <td className="px-4 py-3"><span className={`inline-block rounded-full px-2 py-0.5 text-xs ${statusStyle[run.status] || "bg-gray-400/20 text-gray-600"}`}>{run.status}</span></td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{run.je_ref || "—"}</td>
                        <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          {canApprove && run.status !== "POSTED" && (
                            <Button size="sm" variant="outline" onClick={() => approve(run)} className="flex items-center gap-1"><Check className="h-3 w-3" /> Approve &amp; post</Button>
                          )}
                        </td>
                      </tr>
                      {open[run.id] && (
                        <tr className="bg-muted/20">
                          <td></td>
                          <td colSpan={6} className="px-4 py-2">
                            {!lines[run.id] ? (
                              <div className="py-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline" /></div>
                            ) : (
                              <table className="w-full text-xs">
                                <thead className="text-muted-foreground">
                                  <tr><th className="text-left py-1">Employee</th><th className="text-left py-1">Cost center</th><th className="text-right py-1">Gross</th><th className="text-right py-1">Tax</th><th className="text-right py-1">Net</th></tr>
                                </thead>
                                <tbody>
                                  {lines[run.id].map((l) => (
                                    <tr key={l.employee_id}>
                                      <td className="py-1">{l.employee_name}</td>
                                      <td className="py-1">{l.cost_center}{l.is_billable ? " · billable" : ""}</td>
                                      <td className="py-1 text-right">{format(l.gross, { decimals: 2 })}</td>
                                      <td className="py-1 text-right">{format(l.tax, { decimals: 2 })}</td>
                                      <td className="py-1 text-right">{format(l.net, { decimals: 2 })}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Separation of duties: the HR Admin who runs payroll cannot approve it — a second HR Admin must. Approval posts a balanced <span className="font-mono">PAYROLL_APPROVED</span> entry to the ledger (visible under Admin → Ledger).
      </p>
    </div>
  );
}
