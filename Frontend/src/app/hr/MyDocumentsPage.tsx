import { useEffect, useState } from "react";
import { hrApi, type Employee, type Payslip } from "../lib/hrApi";
import { openDocument, openPayslip } from "../lib/hrDocs";
import { useHrAuth } from "./HrRequireAuth";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Loader2, AlertCircle, FileText, ScrollText, Download, IdCard } from "lucide-react";

const inr = (v: string | number | null | undefined) => (v == null ? "—" : `₹ ${Number(v).toLocaleString("en-IN")}`);
const shortDate = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");

export function MyDocumentsPage() {
  const { user } = useHrAuth();
  const [emp, setEmp] = useState<Employee | null>(null);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user.employeeId) { setError("No employee record is linked to your account."); setLoading(false); return; }
    Promise.all([hrApi.employee(user.employeeId), hrApi.payslips(user.employeeId)])
      .then(([e, p]) => {
        if (e.success && e.data) setEmp(e.data); else setError(e.message || "Could not load your record.");
        if (p.success && p.data) setPayslips(p.data);
      })
      .catch(() => setError("Unable to reach the server."))
      .finally(() => setLoading(false));
  }, [user.employeeId]);

  const doc = (type: "offer" | "joining" | "experience") => {
    if (!emp) return;
    const r = openDocument(type, emp);
    if (!r.ok) setError(r.message || "Could not open the document.");
  };
  const slip = (run: Payslip) => {
    if (!emp) return;
    const r = openPayslip(emp, run);
    if (!r.ok) setError(r.message || "Could not open the payslip.");
  };

  if (loading) return <div className="min-h-[40vh] flex items-center justify-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Documents</h1>
        <p className="text-muted-foreground text-sm">Download your employment letters and payslips.</p>
      </div>

      {error && <div className="flex items-start gap-2 rounded-md bg-red-500/10 text-red-700 p-3 text-sm"><AlertCircle className="h-5 w-5 mt-0.5" /><span>{error}</span></div>}

      {emp && (
        <>
          {/* Profile */}
          <Card>
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><IdCard className="h-5 w-5" /> {emp.name}</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div><p className="text-xs text-muted-foreground">Employee code</p><p className="font-medium">{emp.employee_code || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Designation</p><p className="font-medium">{emp.role || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Department</p><p className="font-medium">{emp.department || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Status</p><p className="font-medium capitalize">{emp.hr_status}</p></div>
                <div><p className="text-xs text-muted-foreground">Date of joining</p><p className="font-medium">{shortDate(emp.date_of_joining)}</p></div>
                {emp.date_of_exit && <div><p className="text-xs text-muted-foreground">Date of exit</p><p className="font-medium">{shortDate(emp.date_of_exit)}</p></div>}
                <div><p className="text-xs text-muted-foreground">Monthly salary</p><p className="font-medium">{inr(emp.monthly_salary)}</p></div>
              </div>
            </CardContent>
          </Card>

          {/* Letters */}
          <Card>
            <CardHeader><CardTitle className="text-lg">Employment letters</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={() => doc("offer")} className="flex items-center gap-2"><FileText className="h-4 w-4" /> Offer letter</Button>
              <Button variant="outline" onClick={() => doc("joining")} className="flex items-center gap-2"><FileText className="h-4 w-4" /> Joining letter</Button>
              {emp.hr_status === "terminated" && (
                <Button variant="outline" onClick={() => doc("experience")} className="flex items-center gap-2"><ScrollText className="h-4 w-4" /> Experience letter</Button>
              )}
            </CardContent>
          </Card>

          {/* Payslips */}
          <Card>
            <CardHeader><CardTitle className="text-lg">Payslips</CardTitle></CardHeader>
            <CardContent className="p-0">
              {payslips.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">No payslips yet — a payslip appears here once a payroll run covering you is approved.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3">Period</th>
                        <th className="px-4 py-3">Gross</th>
                        <th className="px-4 py-3">Net pay</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Download</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {payslips.map((p) => (
                        <tr key={p.run_id} className="hover:bg-muted/30">
                          <td className="px-4 py-3 font-medium">{p.label}</td>
                          <td className="px-4 py-3 text-muted-foreground">{inr(p.gross)}</td>
                          <td className="px-4 py-3 font-medium">{inr(p.net)}</td>
                          <td className="px-4 py-3"><span className={`inline-block rounded-full px-2 py-0.5 text-xs ${p.status === "POSTED" ? "bg-green-500/15 text-green-700" : "bg-blue-500/15 text-blue-700"}`}>{p.status}</span></td>
                          <td className="px-4 py-3 text-right"><Button size="sm" variant="outline" onClick={() => slip(p)} className="flex items-center gap-1"><Download className="h-3 w-3" /> Payslip</Button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
