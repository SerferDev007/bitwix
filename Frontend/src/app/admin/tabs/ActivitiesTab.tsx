import { useState } from "react";
import { projectsApi, type Activity, type Project } from "../../lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../../components/ui/table";
import { Plus, Trash2, Loader2 } from "lucide-react";

// Expected duration helper (mirrors the backend PERT formula) for display.
const te = (o: number, m: number, p: number) => (o + 4 * m + p) / 6;

export function ActivitiesTab({ project, onChange }: { project: Project & { activities: Activity[] }; onChange: () => void }) {
  const activities = project.activities;
  const [form, setForm] = useState({ code: "", name: "", optimistic: "", most_likely: "", pessimistic: "", predecessors: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    const res = await projectsApi.addActivity(project.id, {
      code: form.code.trim(),
      name: form.name.trim(),
      optimistic: Number(form.optimistic),
      most_likely: Number(form.most_likely),
      pessimistic: Number(form.pessimistic),
      predecessors: form.predecessors.split(",").map((s) => s.trim()).filter(Boolean),
    });
    setSaving(false);
    if (res.success) {
      setForm({ code: "", name: "", optimistic: "", most_likely: "", pessimistic: "", predecessors: "" });
      onChange();
    } else {
      setErr(res.errors ? Object.values(res.errors)[0] : res.message || "Failed to add activity.");
    }
  };

  const remove = async (activityId: number) => {
    await projectsApi.deleteActivity(project.id, activityId);
    onChange();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Add activity</CardTitle>
          <p className="text-sm text-muted-foreground">
            Enter three-point estimates (optimistic, most likely, pessimistic) in days. Predecessors are activity codes, comma-separated.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={add} className="grid grid-cols-2 md:grid-cols-7 gap-3 items-end">
            <div className="col-span-1">
              <Label htmlFor="ac-code">Code</Label>
              <Input id="ac-code" value={form.code} required placeholder="A"
                onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label htmlFor="ac-name">Name</Label>
              <Input id="ac-name" value={form.name} required placeholder="Requirements"
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="ac-o">Optim.</Label>
              <Input id="ac-o" type="number" step="any" value={form.optimistic} required placeholder="2"
                onChange={(e) => setForm({ ...form, optimistic: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="ac-m">Likely</Label>
              <Input id="ac-m" type="number" step="any" value={form.most_likely} required placeholder="4"
                onChange={(e) => setForm({ ...form, most_likely: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="ac-p">Pessim.</Label>
              <Input id="ac-p" type="number" step="any" value={form.pessimistic} required placeholder="6"
                onChange={(e) => setForm({ ...form, pessimistic: e.target.value })} />
            </div>
            <div className="col-span-2 md:col-span-1">
              <Label htmlFor="ac-pred">Preds</Label>
              <Input id="ac-pred" value={form.predecessors} placeholder="A,B"
                onChange={(e) => setForm({ ...form, predecessors: e.target.value })} />
            </div>
            <div className="col-span-2 md:col-span-7">
              {err && <p className="text-sm text-red-600 mb-2">{err}</p>}
              <Button type="submit" disabled={saving} className="flex items-center gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Add activity
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">o</TableHead>
                <TableHead className="text-right">m</TableHead>
                <TableHead className="text-right">p</TableHead>
                <TableHead className="text-right">tₑ</TableHead>
                <TableHead>Predecessors</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {activities.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    No activities yet. Add one above to build the network.
                  </TableCell>
                </TableRow>
              )}
              {activities.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-mono font-medium">{a.code}</TableCell>
                  <TableCell>{a.name}</TableCell>
                  <TableCell className="text-right">{a.o}</TableCell>
                  <TableCell className="text-right">{a.m}</TableCell>
                  <TableCell className="text-right">{a.p}</TableCell>
                  <TableCell className="text-right font-medium">{te(a.o, a.m, a.p).toFixed(2)}</TableCell>
                  <TableCell className="font-mono text-sm">{a.predecessors.join(", ") || "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => remove(a.id)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
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
