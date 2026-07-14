import { useEffect, useState } from "react";
import { hrApi, HR_ROLES, type Employee, type Activation } from "../lib/hrApi";
import { useHrAuth } from "./HrRequireAuth";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Loader2, UserPlus, AlertCircle, CheckCircle2, Copy, KeyRound, UserX } from "lucide-react";

const selectClass =
  "h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

function ActivationBanner({ activation, label }: { activation: Activation; label: string }) {
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/hr/activate?token=${activation.token}`;
  const copy = () => {
    navigator.clipboard?.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  };
  return (
    <div className="rounded-md bg-green-500/10 text-green-800 p-3 text-sm space-y-2">
      <div className="flex items-center gap-2 font-medium">
        <CheckCircle2 className="h-4 w-4" /> {label}
      </div>
      <p className="text-xs text-green-900/80">
        Send this single-use activation link to the employee
        {activation.expiresInHours ? ` (expires in ${activation.expiresInHours}h)` : ""}:
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 break-all rounded bg-white/60 px-2 py-1 text-xs">{link}</code>
        <Button type="button" size="sm" variant="outline" onClick={copy} className="flex items-center gap-1">
          <Copy className="h-3 w-3" /> {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

export function HrEmployeesPage() {
  const { can } = useHrAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activation, setActivation] = useState<{ label: string; a: Activation } | null>(null);

  // Provision form
  const [form, setForm] = useState({ name: "", work_email: "", designation: "", role: "EMPLOYEE", employee_code: "", manager_id: "" });
  const [creating, setCreating] = useState(false);

  const canCreate = can("employee.create");
  const canAssignRole = can("user.role.assign");
  const canReset = can("user.password.reset");
  const canDeactivate = can("employee.deactivate");
  const showSalary = employees.some((e) => e.monthly_salary !== undefined);

  const load = () => {
    setLoading(true);
    hrApi.employees()
      .then((res) => {
        if (res.success && res.data) setEmployees(res.data);
        else setError(res.message || "Could not load employees.");
      })
      .catch(() => setError("Unable to reach the server."))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const provision = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setNotice(null); setActivation(null);
    setCreating(true);
    try {
      const res = await hrApi.provisionEmployee({
        name: form.name.trim(),
        work_email: form.work_email.trim(),
        role: form.role,
        designation: form.designation.trim() || undefined,
        employee_code: form.employee_code.trim() || undefined,
        manager_id: form.manager_id ? Number(form.manager_id) : null,
      });
      if (res.success && res.data) {
        setActivation({ label: "Employee provisioned.", a: res.data.activation });
        setForm({ name: "", work_email: "", designation: "", role: "EMPLOYEE", employee_code: "", manager_id: "" });
        load();
      } else {
        setError(res.message || Object.values(res.errors || {})[0] || "Could not provision employee.");
      }
    } catch {
      setError("Unable to reach the server.");
    } finally {
      setCreating(false);
    }
  };

  const changeRole = async (emp: Employee, role: string) => {
    if (!emp.account_id || role === emp.account_role) return;
    setError(null); setNotice(null);
    const res = await hrApi.assignRole(emp.account_id, role);
    if (res.success) { setNotice(res.message || `Role updated for ${emp.name}.`); load(); }
    else setError(res.message || "Could not change role.");
  };

  const reset = async (emp: Employee) => {
    if (!emp.account_id) return;
    setError(null); setNotice(null); setActivation(null);
    const res = await hrApi.resetPassword(emp.account_id);
    if (res.success && res.data?.token) {
      setActivation({ label: `Password reset issued for ${emp.name}.`, a: { token: res.data.token, url: `/hr/activate?token=${res.data.token}`, expiresInHours: 24 } });
    } else setError(res.message || "Could not reset password.");
  };

  const deactivate = async (emp: Employee) => {
    if (!window.confirm(`Offboard ${emp.name}? Their access is revoked; records are retained.`)) return;
    setError(null); setNotice(null);
    const res = await hrApi.deactivateEmployee(emp.id);
    if (res.success) { setNotice(res.message || `${emp.name} offboarded.`); load(); }
    else setError(res.message || "Could not deactivate.");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Employees</h1>
        <p className="text-muted-foreground text-sm">Provision accounts, manage roles, and offboard — all RBAC-scoped to what your role allows.</p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md bg-red-500/10 text-red-700 p-3 text-sm">
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" /><span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="flex items-start gap-2 rounded-md bg-green-500/10 text-green-700 p-3 text-sm">
          <CheckCircle2 className="h-5 w-5 flex-shrink-0 mt-0.5" /><span>{notice}</span>
        </div>
      )}
      {activation && <ActivationBanner activation={activation.a} label={activation.label} />}

      {canCreate && (
        <Card>
          <CardHeader><CardTitle className="text-lg flex items-center gap-2"><UserPlus className="h-5 w-5" /> Provision employee</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={provision} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="np-name">Full name</Label>
                <Input id="np-name" value={form.name} required onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Jane Doe" />
              </div>
              <div>
                <Label htmlFor="np-email">Work email</Label>
                <Input id="np-email" type="email" value={form.work_email} required onChange={(e) => setForm({ ...form, work_email: e.target.value })} placeholder="jane@bitwix.co.in" />
              </div>
              <div>
                <Label htmlFor="np-desig">Designation</Label>
                <Input id="np-desig" value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} placeholder="Software Engineer" />
              </div>
              <div>
                <Label htmlFor="np-role">RBAC role</Label>
                <select id="np-role" className={`${selectClass} w-full`} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  {HR_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <Label htmlFor="np-code">Employee code</Label>
                <Input id="np-code" value={form.employee_code} onChange={(e) => setForm({ ...form, employee_code: e.target.value })} placeholder="BWX-001" />
              </div>
              <div>
                <Label htmlFor="np-mgr">Manager ID (optional)</Label>
                <Input id="np-mgr" type="number" value={form.manager_id} onChange={(e) => setForm({ ...form, manager_id: e.target.value })} placeholder="e.g. 3" />
              </div>
              <div className="md:col-span-2">
                <Button type="submit" disabled={creating} className="flex items-center gap-2">
                  {creating && <Loader2 className="h-4 w-4 animate-spin" />} Provision & generate invite
                </Button>
              </div>
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
                    <th className="px-4 py-3">Work email</th>
                    <th className="px-4 py-3">RBAC role</th>
                    <th className="px-4 py-3">Status</th>
                    {showSalary && <th className="px-4 py-3">Salary</th>}
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {employees.map((emp) => {
                    const active = emp.hr_status === "active";
                    return (
                      <tr key={emp.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium">{emp.name}</td>
                        <td className="px-4 py-3 text-muted-foreground">{emp.role || "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{emp.work_email}</td>
                        <td className="px-4 py-3">
                          {canAssignRole && emp.account_id ? (
                            <select
                              className={selectClass}
                              value={emp.account_role || "EMPLOYEE"}
                              onChange={(e) => changeRole(emp, e.target.value)}
                            >
                              {HR_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                            </select>
                          ) : (
                            <span className="text-muted-foreground">{emp.account_role || "—"}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${active ? "bg-green-500/15 text-green-700" : "bg-gray-400/20 text-gray-600"}`}>
                            {emp.hr_status}
                          </span>
                        </td>
                        {showSalary && (
                          <td className="px-4 py-3 text-muted-foreground">
                            {emp.monthly_salary != null ? `₹ ${Number(emp.monthly_salary).toLocaleString("en-IN")}` : "—"}
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            {canReset && emp.account_id && (
                              <Button type="button" size="sm" variant="outline" onClick={() => reset(emp)} className="flex items-center gap-1">
                                <KeyRound className="h-3 w-3" /> Reset
                              </Button>
                            )}
                            {canDeactivate && active && (
                              <Button type="button" size="sm" variant="outline" onClick={() => deactivate(emp)} className="flex items-center gap-1 text-red-600 hover:text-red-700">
                                <UserX className="h-3 w-3" /> Offboard
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
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
