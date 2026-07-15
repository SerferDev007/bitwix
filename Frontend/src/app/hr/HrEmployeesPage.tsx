import { Fragment, useEffect, useState } from "react";
import { hrApi, HR_ROLES, type Employee, type Activation, type HrSettings } from "../lib/hrApi";
import { openDocument, openPayslip } from "../lib/hrDocs";
import { useHrAuth } from "./HrRequireAuth";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Loader2, UserPlus, AlertCircle, CheckCircle2, Copy, KeyRound, UserX, FileText, Pencil, ChevronDown, Save, X } from "lucide-react";

const selectClass = "h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
const inr = (v: string | number | null | undefined) => (v == null ? "—" : `₹ ${Number(v).toLocaleString("en-IN")}`);
const shortDate = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const dateInput = (d: string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "");

type DocKey = "offer" | "joining" | "payslip" | "experience";
const DOC_TYPES: { type: DocKey; label: string }[] = [
  { type: "offer", label: "Offer letter" },
  { type: "joining", label: "Joining letter" },
  { type: "payslip", label: "Payslip (latest)" },
  { type: "experience", label: "Experience letter" },
];

function ActivationBanner({ activation, label }: { activation: Activation; label: string }) {
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/hr/activate?token=${activation.token}`;
  const copy = () => navigator.clipboard?.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  return (
    <div className="rounded-md bg-green-500/10 text-green-800 p-3 text-sm space-y-2">
      <div className="flex items-center gap-2 font-medium"><CheckCircle2 className="h-4 w-4" /> {label}</div>
      <p className="text-xs text-green-900/80">Send this single-use activation link to the employee{activation.expiresInHours ? ` (expires in ${activation.expiresInHours}h)` : ""}:</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 break-all rounded bg-white/60 px-2 py-1 text-xs">{link}</code>
        <Button type="button" size="sm" variant="outline" onClick={copy} className="flex items-center gap-1"><Copy className="h-3 w-3" /> {copied ? "Copied" : "Copy"}</Button>
      </div>
    </div>
  );
}

export function HrEmployeesPage() {
  const { user, can } = useHrAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activation, setActivation] = useState<{ label: string; a: Activation } | null>(null);
  const [docsFor, setDocsFor] = useState<number | null>(null);
  const [settings, setSettings] = useState<HrSettings | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ designation: "", department: "", date_of_joining: "", date_of_exit: "", monthly_salary: "" as string | number });

  const [form, setForm] = useState({ name: "", work_email: "", designation: "", role: "EMPLOYEE", employee_code: "", manager_id: "", department: "", date_of_joining: "", monthly_salary: "" });
  const [creating, setCreating] = useState(false);

  const canCreate = can("employee.create");
  const canAssignRole = can("user.role.assign");
  const canReset = can("user.password.reset");
  const canDeactivate = can("employee.deactivate");
  const canUpdate = can("employee.update.all");
  const canSetSalary = ["SUPER_ADMIN", "HR_ADMIN"].includes(user.role);
  const showSalary = employees.some((e) => e.monthly_salary !== undefined);

  const load = () => {
    setLoading(true);
    hrApi.employees()
      .then((res) => { if (res.success && res.data) setEmployees(res.data); else setError(res.message || "Could not load employees."); })
      .catch(() => setError("Unable to reach the server."))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);
  useEffect(() => { hrApi.getSettings().then((r) => { if (r.success && r.data) setSettings(r.data); }).catch(() => {}); }, []);

  const provision = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setNotice(null); setActivation(null); setCreating(true);
    try {
      const res = await hrApi.provisionEmployee({
        name: form.name.trim(),
        work_email: form.work_email.trim(),
        role: form.role,
        designation: form.designation.trim() || undefined,
        employee_code: form.employee_code.trim() || undefined,
        manager_id: form.manager_id ? Number(form.manager_id) : null,
        department: form.department.trim() || undefined,
        date_of_joining: form.date_of_joining || undefined,
        monthly_salary: canSetSalary && form.monthly_salary ? Number(form.monthly_salary) : undefined,
      });
      if (res.success && res.data) {
        setActivation({ label: "Employee provisioned.", a: res.data.activation });
        setForm({ name: "", work_email: "", designation: "", role: "EMPLOYEE", employee_code: "", manager_id: "", department: "", date_of_joining: "", monthly_salary: "" });
        load();
      } else setError(res.message || Object.values(res.errors || {})[0] || "Could not provision employee.");
    } catch { setError("Unable to reach the server."); } finally { setCreating(false); }
  };

  const changeRole = async (emp: Employee, role: string) => {
    if (!emp.account_id || role === emp.account_role) return;
    setError(null); setNotice(null);
    const res = await hrApi.assignRole(emp.account_id, role);
    if (res.success) { setNotice(res.message || `Role updated for ${emp.name}.`); load(); } else setError(res.message || "Could not change role.");
  };

  const reset = async (emp: Employee) => {
    if (!emp.account_id) return;
    setError(null); setNotice(null); setActivation(null);
    const res = await hrApi.resetPassword(emp.account_id);
    if (res.success && res.data?.token) setActivation({ label: `Password reset issued for ${emp.name}.`, a: { token: res.data.token, url: `/hr/activate?token=${res.data.token}`, expiresInHours: 24 } });
    else setError(res.message || "Could not reset password.");
  };

  const deactivate = async (emp: Employee) => {
    if (!window.confirm(`Offboard ${emp.name}? Access is revoked and today is set as the exit date; records are retained.`)) return;
    setError(null); setNotice(null);
    const res = await hrApi.deactivateEmployee(emp.id);
    if (res.success) { setNotice(res.message || `${emp.name} offboarded.`); load(); } else setError(res.message || "Could not deactivate.");
  };

  const openEdit = (emp: Employee) => {
    setEditing(emp.id);
    setEditForm({ designation: emp.role || "", department: emp.department || "", date_of_joining: dateInput(emp.date_of_joining), date_of_exit: dateInput(emp.date_of_exit), monthly_salary: emp.monthly_salary ?? "" });
  };
  const saveEdit = async (id: number) => {
    setError(null); setNotice(null);
    const body: Record<string, unknown> = {
      designation: editForm.designation,
      department: editForm.department,
      date_of_joining: editForm.date_of_joining || null,
      date_of_exit: editForm.date_of_exit || null,
    };
    if (canSetSalary) body.monthly_salary = editForm.monthly_salary === "" ? null : Number(editForm.monthly_salary);
    const res = await hrApi.updateEmployee(id, body);
    if (res.success) { setNotice("Employee updated."); setEditing(null); load(); } else setError(res.message || "Update failed.");
  };

  const genDoc = async (emp: Employee, type: DocKey) => {
    setDocsFor(null); setError(null); setNotice(null);
    if (type === "payslip") {
      const res = await hrApi.payslips(emp.id);
      const latest = res.success && res.data ? res.data[0] : undefined;
      if (!latest) { setError(res.success ? "No approved payroll run for this employee yet." : (res.message || "Could not load payslips.")); return; }
      const r = openPayslip(emp, latest);
      if (!r.ok) setError(r.message || "Could not open payslip.");
      return;
    }
    const r = openDocument(type, emp, settings);
    if (!r.ok) setError(r.message || "Could not generate document.");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Employees</h1>
        <p className="text-muted-foreground text-sm">Provision accounts, maintain the salary feed and joining/exit dates, and generate letters &amp; payslips — all RBAC-scoped.</p>
      </div>

      {error && <div className="flex items-start gap-2 rounded-md bg-red-500/10 text-red-700 p-3 text-sm"><AlertCircle className="h-5 w-5 mt-0.5" /><span>{error}</span></div>}
      {notice && <div className="flex items-start gap-2 rounded-md bg-green-500/10 text-green-700 p-3 text-sm"><CheckCircle2 className="h-5 w-5 mt-0.5" /><span>{notice}</span></div>}
      {activation && <ActivationBanner activation={activation.a} label={activation.label} />}

      {canCreate && (
        <Card>
          <CardHeader><CardTitle className="text-lg flex items-center gap-2"><UserPlus className="h-5 w-5" /> Provision employee</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={provision} className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div><Label htmlFor="np-name">Full name</Label><Input id="np-name" value={form.name} required onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Jane Doe" /></div>
              <div><Label htmlFor="np-email">Work email</Label><Input id="np-email" type="email" value={form.work_email} required onChange={(e) => setForm({ ...form, work_email: e.target.value })} placeholder="jane@bitwix.co.in" /></div>
              <div><Label htmlFor="np-desig">Designation</Label><Input id="np-desig" value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} placeholder="Software Engineer" /></div>
              <div><Label htmlFor="np-dept">Department</Label><Input id="np-dept" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="Engineering" /></div>
              <div><Label htmlFor="np-role">RBAC role</Label><select id="np-role" className={`${selectClass} w-full`} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{HR_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</select></div>
              <div><Label htmlFor="np-doj">Date of joining</Label><Input id="np-doj" type="date" value={form.date_of_joining} onChange={(e) => setForm({ ...form, date_of_joining: e.target.value })} /></div>
              <div><Label htmlFor="np-code">Employee code</Label><Input id="np-code" value={form.employee_code} onChange={(e) => setForm({ ...form, employee_code: e.target.value })} placeholder="BWX-001" /></div>
              <div><Label htmlFor="np-mgr">Manager ID (optional)</Label><Input id="np-mgr" type="number" value={form.manager_id} onChange={(e) => setForm({ ...form, manager_id: e.target.value })} placeholder="e.g. 3" /></div>
              {canSetSalary && <div><Label htmlFor="np-sal">Monthly salary (₹)</Label><Input id="np-sal" type="number" min="0" value={form.monthly_salary} onChange={(e) => setForm({ ...form, monthly_salary: e.target.value })} placeholder="e.g. 60000" /></div>}
              <div className="md:col-span-3"><Button type="submit" disabled={creating} className="flex items-center gap-2">{creating && <Loader2 className="h-4 w-4 animate-spin" />} Provision &amp; generate invite</Button></div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-10 flex justify-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : employees.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No employees visible to your role.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Designation</th>
                    <th className="px-4 py-3">Department</th>
                    <th className="px-4 py-3">Joined</th>
                    <th className="px-4 py-3">RBAC role</th>
                    <th className="px-4 py-3">Status</th>
                    {showSalary && <th className="px-4 py-3">Salary</th>}
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {employees.map((emp) => {
                    const active = emp.hr_status === "active";
                    const cols = 6 + (showSalary ? 1 : 0) + 1;
                    return (
                      <Fragment key={emp.id}>
                        <tr className="hover:bg-muted/30 align-top">
                          <td className="px-4 py-3 font-medium">{emp.name}{emp.employee_code ? <span className="block text-xs text-muted-foreground font-normal">{emp.employee_code}</span> : null}</td>
                          <td className="px-4 py-3 text-muted-foreground">{emp.role || "—"}</td>
                          <td className="px-4 py-3 text-muted-foreground">{emp.department || "—"}</td>
                          <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{shortDate(emp.date_of_joining)}{emp.date_of_exit ? <span className="block text-xs text-red-600">exit {shortDate(emp.date_of_exit)}</span> : null}</td>
                          <td className="px-4 py-3">
                            {canAssignRole && emp.account_id ? (
                              <select className={selectClass} value={emp.account_role || "EMPLOYEE"} onChange={(e) => changeRole(emp, e.target.value)}>{HR_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</select>
                            ) : <span className="text-muted-foreground">{emp.account_role || "—"}</span>}
                          </td>
                          <td className="px-4 py-3"><span className={`inline-block rounded-full px-2 py-0.5 text-xs ${active ? "bg-green-500/15 text-green-700" : "bg-gray-400/20 text-gray-600"}`}>{emp.hr_status}</span></td>
                          {showSalary && <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{inr(emp.monthly_salary)}</td>}
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-2 flex-wrap">
                              <div className="relative">
                                <Button type="button" size="sm" variant="outline" onClick={() => setDocsFor(docsFor === emp.id ? null : emp.id)} onBlur={() => setTimeout(() => setDocsFor((d) => (d === emp.id ? null : d)), 150)} className="flex items-center gap-1"><FileText className="h-3 w-3" /> Docs <ChevronDown className="h-3 w-3" /></Button>
                                {docsFor === emp.id && (
                                  <div className="absolute right-0 mt-1 w-44 rounded-md border bg-background shadow-lg py-1 z-20 text-left">
                                    {DOC_TYPES.filter((d) => d.type !== "experience" || emp.hr_status === "terminated").map((d) => (
                                      <button key={d.type} type="button" onMouseDown={(ev) => { ev.preventDefault(); genDoc(emp, d.type); }} className="w-full text-left px-3 py-2 text-sm hover:bg-muted">{d.label}</button>
                                    ))}
                                  </div>
                                )}
                              </div>
                              {canUpdate && <Button type="button" size="sm" variant="outline" onClick={() => (editing === emp.id ? setEditing(null) : openEdit(emp))} className="flex items-center gap-1"><Pencil className="h-3 w-3" /> Edit</Button>}
                              {canReset && emp.account_id && <Button type="button" size="sm" variant="outline" onClick={() => reset(emp)} className="flex items-center gap-1"><KeyRound className="h-3 w-3" /> Reset</Button>}
                              {canDeactivate && active && <Button type="button" size="sm" variant="outline" onClick={() => deactivate(emp)} className="flex items-center gap-1 text-red-600"><UserX className="h-3 w-3" /> Offboard</Button>}
                            </div>
                          </td>
                        </tr>
                        {editing === emp.id && (
                          <tr className="bg-muted/20">
                            <td colSpan={cols} className="px-4 py-4">
                              <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                                <div><Label className="text-xs">Designation</Label><Input value={editForm.designation} onChange={(e) => setEditForm({ ...editForm, designation: e.target.value })} /></div>
                                <div><Label className="text-xs">Department</Label><Input value={editForm.department} onChange={(e) => setEditForm({ ...editForm, department: e.target.value })} /></div>
                                <div><Label className="text-xs">Date of joining</Label><Input type="date" value={editForm.date_of_joining} onChange={(e) => setEditForm({ ...editForm, date_of_joining: e.target.value })} /></div>
                                <div><Label className="text-xs">Date of exit</Label><Input type="date" value={editForm.date_of_exit} onChange={(e) => setEditForm({ ...editForm, date_of_exit: e.target.value })} /></div>
                                {canSetSalary && <div><Label className="text-xs">Monthly salary (₹)</Label><Input type="number" min="0" value={editForm.monthly_salary} onChange={(e) => setEditForm({ ...editForm, monthly_salary: e.target.value })} /></div>}
                                <div className="md:col-span-5 flex gap-2">
                                  <Button type="button" size="sm" onClick={() => saveEdit(emp.id)} className="flex items-center gap-1"><Save className="h-3 w-3" /> Save</Button>
                                  <Button type="button" size="sm" variant="outline" onClick={() => setEditing(null)} className="flex items-center gap-1"><X className="h-3 w-3" /> Cancel</Button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
