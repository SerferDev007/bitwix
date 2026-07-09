import { useEffect, useState } from "react";
import { employeesApi, type Employee, type RosterSummary } from "../../lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Badge } from "../../components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../../components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../../components/ui/select";
import { Plus, Trash2, Loader2 } from "lucide-react";

const stateColors: Record<string, string> = {
  engaged: "bg-green-500",
  at_risk: "bg-amber-500",
  departed: "bg-red-500",
};
const stateLabels: Record<string, string> = { engaged: "Engaged", at_risk: "At-Risk", departed: "Departed" };

export function RosterTab() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [summary, setSummary] = useState<RosterSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", role: "", skills: "", monthly_salary: "", utilization: "", engagement_state: "engaged" });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const res = await employeesApi.list();
    if (res.success && res.data) {
      setEmployees(res.data);
      setSummary(res.summary ?? null);
    } else setError(res.message || "Failed to load roster.");
    setLoading(false);
  };

  useEffect(() => {
    load().catch(() => {
      setError("Unable to reach the server.");
      setLoading(false);
    });
  }, []);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const res = await employeesApi.create({
      name: form.name,
      role: form.role || null,
      skills: form.skills,
      monthly_salary: form.monthly_salary || null,
      utilization: form.utilization || null,
      engagement_state: form.engagement_state as Employee["engagement_state"],
    });
    setSaving(false);
    if (res.success) {
      setForm({ name: "", role: "", skills: "", monthly_salary: "", utilization: "", engagement_state: "engaged" });
      load();
    }
  };

  const remove = async (id: number) => {
    await employeesApi.remove(id);
    load();
  };

  if (loading) return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading roster…</div>;
  if (error) return <div className="rounded-md bg-red-500/10 text-red-700 p-4">{error}</div>;

  return (
    <div className="space-y-6">
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Engaged" value={summary.byState.engaged} color="text-green-600" />
          <Stat label="At-Risk" value={summary.byState.at_risk} color="text-amber-600" />
          <Stat label="Departed" value={summary.byState.departed} color="text-red-600" />
          <Stat label="Avg. utilization" value={summary.avgUtilization != null ? `${summary.avgUtilization}%` : "—"} />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Add employee</CardTitle>
          <p className="text-sm text-muted-foreground">Skills are comma-separated. Engagement state feeds the retention model's starting counts.</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={add} className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
            <div>
              <Label htmlFor="emp-name">Name</Label>
              <Input id="emp-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="emp-role">Role</Label>
              <Input id="emp-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="emp-skills">Skills</Label>
              <Input id="emp-skills" placeholder="Node,Auth" value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="emp-util">Utilization %</Label>
              <Input id="emp-util" type="number" step="any" value={form.utilization} onChange={(e) => setForm({ ...form, utilization: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="emp-state">State</Label>
              <Select value={form.engagement_state} onValueChange={(v) => setForm({ ...form, engagement_state: v })}>
                <SelectTrigger id="emp-state"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="engaged">Engaged</SelectItem>
                  <SelectItem value="at_risk">At-Risk</SelectItem>
                  <SelectItem value="departed">Departed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={saving} className="flex items-center gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Skills</TableHead>
                <TableHead className="text-right">Utilization</TableHead>
                <TableHead>State</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No employees yet.</TableCell></TableRow>
              )}
              {employees.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">{e.name}</TableCell>
                  <TableCell className="text-muted-foreground">{e.role || "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(e.skills || []).map((s) => (
                        <span key={s} className="bg-primary/10 text-primary px-2 py-0.5 rounded text-xs">{s}</span>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">{e.utilization != null ? `${e.utilization}%` : "—"}</TableCell>
                  <TableCell>
                    <Badge className={`${stateColors[e.engagement_state]} text-white`}>{stateLabels[e.engagement_state]}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => remove(e.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className={`text-2xl font-bold ${color || ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
