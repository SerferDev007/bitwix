import { useEffect, useState } from "react";
import { employeesApi, type RetentionRun } from "../../lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../../components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../../components/ui/table";
import { Loader2, AlertCircle, ShieldCheck, TrendingDown } from "lucide-react";

export function RetentionTab() {
  const [scenarios, setScenarios] = useState<{ id: number; name: string }[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [run, setRun] = useState<RetentionRun | null>(null);
  const [horizon, setHorizon] = useState(12);
  const [fromRoster, setFromRoster] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    employeesApi
      .retentions()
      .then((res) => {
        if (res.success && res.data) {
          setScenarios(res.data);
          if (res.data.length) load(res.data[0].id, 12, false);
          else setLoading(false);
        } else {
          setError(res.message || "Failed to load scenarios.");
          setLoading(false);
        }
      })
      .catch(() => {
        setError("Unable to reach the server.");
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async (id: number, h: number, roster: boolean) => {
    setLoading(true);
    setError(null);
    setSelectedId(String(id));
    const res = await employeesApi.retention(id, { horizon: h, fromRoster: roster });
    setLoading(false);
    if (res.success && res.data) setRun(res.data);
    else setError(res.message || "Could not run the projection.");
  };

  if (loading && !run) return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading…</div>;
  if (!scenarios.length) return <Card><CardContent className="p-10 text-center text-muted-foreground">No saved retention scenarios.</CardContent></Card>;

  const cmp = run?.comparison;
  const maxDeparted = run
    ? Math.max(
        ...run.projection.timeline.map((t) => t.counts[run.projection.departedIndex] || 0),
        1
      )
    : 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label>Scenario</Label>
          <Select value={selectedId} onValueChange={(v) => load(Number(v), horizon, fromRoster)}>
            <SelectTrigger className="w-72"><SelectValue placeholder="Choose a scenario" /></SelectTrigger>
            <SelectContent>
              {scenarios.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="ret-horizon">Horizon (months)</Label>
          <Input id="ret-horizon" type="number" className="w-32" value={horizon}
            onChange={(e) => setHorizon(Number(e.target.value))} />
        </div>
        <label className="flex items-center gap-2 text-sm h-10">
          <input type="checkbox" checked={fromRoster} onChange={(e) => setFromRoster(e.target.checked)} />
          Start from live roster counts
        </label>
        <Button onClick={() => load(Number(selectedId), horizon, fromRoster)} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Run projection"}
        </Button>
      </div>

      {error && <div className="flex items-center gap-2 rounded-md bg-red-500/10 text-red-700 p-4"><AlertCircle className="h-5 w-5" /> {error}</div>}

      {run && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">Starting active workforce</p>
                <p className="text-2xl font-bold">{run.projection.summary.startTotalActive}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground flex items-center gap-1"><TrendingDown className="h-4 w-4" /> Projected departures ({run.horizon} mo)</p>
                <p className="text-2xl font-bold text-red-600">{run.projection.summary.cumulativeDepartures ?? "—"}</p>
              </CardContent>
            </Card>
            {cmp && (
              <Card className="border-green-500/40">
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground flex items-center gap-1"><ShieldCheck className="h-4 w-4 text-green-600" /> Departures avoided by intervention</p>
                  <p className="text-2xl font-bold text-green-600">{cmp.departuresAvoided ?? "—"}</p>
                </CardContent>
              </Card>
            )}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Workforce projection</CardTitle>
              <p className="text-sm text-muted-foreground">Expected head count in each engagement state over time. The bar tracks the absorbing (Departed) state.</p>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    {run.projection.states.map((s) => <TableHead key={s} className="text-right">{s}</TableHead>)}
                    <TableHead className="w-40">Departed trend</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {run.projection.timeline.map((t) => {
                    const dep = t.counts[run.projection.departedIndex] || 0;
                    return (
                      <TableRow key={t.period}>
                        <TableCell className="font-medium">{t.period}</TableCell>
                        {t.counts.map((c, i) => (
                          <TableCell key={i} className="text-right">{round(c)}</TableCell>
                        ))}
                        <TableCell>
                          <div className="h-2 rounded-full bg-muted overflow-hidden">
                            <div className="h-full bg-red-500" style={{ width: `${(dep / maxDeparted) * 100}%` }} />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {cmp && (
            <Card>
              <CardHeader><CardTitle className="text-base">Baseline vs. intervention (cumulative departures)</CardTitle></CardHeader>
              <CardContent>
                <div className="flex items-center gap-6 text-sm">
                  <div>
                    <span className="inline-block w-3 h-3 rounded-full bg-red-500 mr-2" />
                    Baseline: <strong>{cmp.baseline.summary.cumulativeDepartures}</strong>
                  </div>
                  <div>
                    <span className="inline-block w-3 h-3 rounded-full bg-green-500 mr-2" />
                    With intervention: <strong>{cmp.intervention.summary.cumulativeDepartures}</strong>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mt-3">
                  Improving the At-Risk → Engaged transition (e.g. mentoring, workload rebalancing) keeps{" "}
                  <strong className="text-green-600">{cmp.departuresAvoided}</strong> more people over {run.horizon} months —
                  a figure that can be weighed directly against the program's cost.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

const round = (n: number) => Math.round(n * 100) / 100;
