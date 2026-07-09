import { useEffect, useState } from "react";
import { projectsApi, type EvmComputed } from "../../lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../../components/ui/table";
import { Loader2, AlertCircle, Plus, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import { useCurrency } from "../../lib/currency";

export function EvmTab({ projectId, bac, onChange }: { projectId: number; bac: string | number | null; onChange: () => void }) {
  const { format: money } = useCurrency();
  const [snapshots, setSnapshots] = useState<EvmComputed[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ status_date: "", planned_value: "", earned_value: "", actual_cost: "", note: "" });
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    projectsApi
      .evm(projectId)
      .then((res) => {
        if (res.success && res.data) setSnapshots(res.data.snapshots);
        else setError(res.message || "Could not load EVM data.");
      })
      .catch(() => setError("Unable to reach the server."))
      .finally(() => setLoading(false));
  };

  useEffect(load, [projectId]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormErr(null);
    const res = await projectsApi.addEvm(projectId, {
      status_date: form.status_date || undefined,
      planned_value: Number(form.planned_value),
      earned_value: Number(form.earned_value),
      actual_cost: Number(form.actual_cost),
      note: form.note || undefined,
    });
    setSaving(false);
    if (res.success) {
      setForm({ status_date: "", planned_value: "", earned_value: "", actual_cost: "", note: "" });
      load();
    } else {
      setFormErr(res.errors ? Object.values(res.errors)[0] : res.message || "Failed to add snapshot.");
    }
  };

  const remove = async (id: number) => {
    await projectsApi.deleteEvm(projectId, id);
    load();
  };

  if (bac == null)
    return (
      <Card>
        <CardContent className="p-8 flex items-center gap-3 text-muted-foreground">
          <AlertCircle className="h-5 w-5" />
          Set a project budget (BAC) to compute Earned Value indices.
        </CardContent>
      </Card>
    );

  const latest = snapshots[snapshots.length - 1];

  return (
    <div className="space-y-6">
      {latest && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <IndexCard label="Cost Performance (CPI)" value={fmt(latest.cpi)} good={latest.cpi != null && latest.cpi >= 1} hint={`${money(latest.inputs.ev)} earned / ${money(latest.inputs.ac)} spent`} />
            <IndexCard label="Schedule Performance (SPI)" value={fmt(latest.spi)} good={latest.spi != null && latest.spi >= 1} hint={`${money(latest.inputs.ev)} earned / ${money(latest.inputs.pv)} planned`} />
            <IndexCard label="Estimate at Completion" value={money(latest.estimateAtCompletion)} good={latest.estimateAtCompletion != null && Number(bac) >= latest.estimateAtCompletion} hint={`Budget ${money(Number(bac))}`} money />
            <IndexCard label="Variance at Completion" value={money(latest.varianceAtCompletion)} good={latest.varianceAtCompletion != null && latest.varianceAtCompletion >= 0} hint={`${round(latest.percentComplete)}% complete`} money />
          </div>

          <Card>
            <CardContent className="p-5">
              <p className="text-sm">
                <span className="font-medium">Reading:</span> the project is{" "}
                <Badge className={latest.status.cost === "over_budget" ? "bg-red-500 text-white" : "bg-green-500 text-white"}>
                  {latest.status.cost.replace("_", " ")}
                </Badge>{" "}
                and{" "}
                <Badge className={latest.status.schedule === "behind_schedule" ? "bg-red-500 text-white" : "bg-green-500 text-white"}>
                  {latest.status.schedule.replace("_", " ")}
                </Badge>
                . At the current cost efficiency, projected final cost is{" "}
                <strong>{money(latest.estimateAtCompletion)}</strong> against a{" "}
                <strong>{money(Number(bac))}</strong> budget
                {latest.varianceAtCompletion != null && latest.varianceAtCompletion < 0 && (
                  <> — a forecast overrun of <strong className="text-red-600">{money(Math.abs(latest.varianceAtCompletion))}</strong></>
                )}
                .
              </p>
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Add status snapshot</CardTitle>
          <p className="text-sm text-muted-foreground">
            Record Planned Value (budgeted cost of work scheduled), Earned Value (budgeted cost of work done), and Actual Cost.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={add} className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
            <div>
              <Label htmlFor="ev-date">Date</Label>
              <Input id="ev-date" type="date" value={form.status_date}
                onChange={(e) => setForm({ ...form, status_date: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="ev-pv">Planned (PV)</Label>
              <Input id="ev-pv" type="number" step="any" required value={form.planned_value} placeholder="100000"
                onChange={(e) => setForm({ ...form, planned_value: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="ev-ev">Earned (EV)</Label>
              <Input id="ev-ev" type="number" step="any" required value={form.earned_value} placeholder="80000"
                onChange={(e) => setForm({ ...form, earned_value: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="ev-ac">Actual (AC)</Label>
              <Input id="ev-ac" type="number" step="any" required value={form.actual_cost} placeholder="95000"
                onChange={(e) => setForm({ ...form, actual_cost: e.target.value })} />
            </div>
            <div>
              <Button type="submit" disabled={saving} className="flex items-center gap-2 w-full">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Add
              </Button>
            </div>
            {formErr && <p className="text-sm text-red-600 col-span-2 md:col-span-5">{formErr}</p>}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Snapshot history</CardTitle></CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading…</div>
          ) : error ? (
            <div className="p-6 text-red-600">{error}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">PV</TableHead>
                  <TableHead className="text-right">EV</TableHead>
                  <TableHead className="text-right">AC</TableHead>
                  <TableHead className="text-right">CPI</TableHead>
                  <TableHead className="text-right">SPI</TableHead>
                  <TableHead className="text-right">EAC</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {snapshots.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No snapshots yet.</TableCell></TableRow>
                )}
                {snapshots.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{formatDate(s.status_date)}</TableCell>
                    <TableCell className="text-right">{money(s.inputs.pv)}</TableCell>
                    <TableCell className="text-right">{money(s.inputs.ev)}</TableCell>
                    <TableCell className="text-right">{money(s.inputs.ac)}</TableCell>
                    <TableCell className={`text-right font-medium ${cls(s.cpi)}`}>{fmt(s.cpi)}</TableCell>
                    <TableCell className={`text-right font-medium ${cls(s.spi)}`}>{fmt(s.spi)}</TableCell>
                    <TableCell className="text-right">{money(s.estimateAtCompletion)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => remove(s.id)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function IndexCard({ label, value, good, hint, money: isMoney }: { label: string; value: string; good: boolean; hint?: string; money?: boolean }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <div className="flex items-center gap-2">
          <p className={`text-2xl font-bold ${isMoney ? "" : good ? "text-green-600" : "text-red-600"}`}>{value}</p>
          {!isMoney && (good ? <TrendingUp className="h-4 w-4 text-green-600" /> : <TrendingDown className="h-4 w-4 text-red-600" />)}
        </div>
        {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );
}

const cls = (v: number | null) => (v == null ? "" : v >= 1 ? "text-green-600" : "text-red-600");
const fmt = (v: number | null) => (v == null ? "—" : v.toFixed(2));
const round = (n: number | null) => (n == null ? "—" : Math.round(n * 10) / 10);
const formatDate = (d: string) => {
  try {
    return new Date(d).toLocaleDateString();
  } catch {
    return d;
  }
};
