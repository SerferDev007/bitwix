import { useEffect, useState } from "react";
import { projectsApi, type PertResult } from "../../lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Button } from "../../components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../../components/ui/table";
import { Loader2, AlertCircle, Target, Sigma } from "lucide-react";

export function PertTab({ projectId, deadline }: { projectId: number; deadline: number | null }) {
  const [data, setData] = useState<PertResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<string>(deadline != null ? String(deadline) : "");

  const load = (t?: number) => {
    setLoading(true);
    setError(null);
    projectsApi
      .pert(projectId, t)
      .then((res) => {
        if (res.success && res.data) setData(res.data);
        else setError(res.message || "Could not compute PERT.");
      })
      .catch(() => setError("Unable to reach the server."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load(deadline ?? undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  if (loading && !data)
    return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Computing PERT…</div>;
  if (error)
    return <div className="flex items-center gap-2 rounded-md bg-red-500/10 text-red-700 p-4"><AlertCircle className="h-5 w-5" /> {error}</div>;
  if (!data || data.activities.length === 0)
    return <Card><CardContent className="p-10 text-center text-muted-foreground">Add activities to run PERT.</CardContent></Card>;

  const prob = data.target ? Math.round(data.target.probability * 100) : null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Stat label="Expected duration (tₑ)" value={`${round(data.expectedProjectDuration)} days`} icon={<Sigma className="h-5 w-5 text-primary" />} />
        <Stat label="Std. deviation (σ)" value={`${round(data.projectStdDev)} days`} sub={`variance ${round(data.projectVariance)}`} />
        <Stat label="50% confidence date" value={`${round(data.expectedProjectDuration)} days`} sub="the point estimate is a coin flip" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2"><Target className="h-5 w-5" /> Completion probability</CardTitle>
          <p className="text-sm text-muted-foreground">
            Assuming the critical path total is approximately normal, what is the chance of finishing by a target date?
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3 mb-6">
            <div>
              <Label htmlFor="pert-target">Target duration (days)</Label>
              <Input id="pert-target" type="number" step="any" value={target} className="w-40"
                onChange={(e) => setTarget(e.target.value)} />
            </div>
            <Button onClick={() => load(target === "" ? undefined : Number(target))} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Calculate"}
            </Button>
          </div>

          {data.target && prob != null && (
            <div className="rounded-lg border p-5">
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-sm text-muted-foreground">
                  P(finish ≤ {round(data.target.targetDuration)} days) · z = {round(data.target.z)}
                </span>
                <span className="text-3xl font-bold text-primary">{prob}%</span>
              </div>
              <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${Math.min(prob, 100)}%` }} />
              </div>
              <p className="text-sm text-muted-foreground mt-3">
                {prob >= 85
                  ? "Comfortable commitment — high confidence of meeting this date."
                  : prob >= 60
                  ? "Moderate risk — consider padding the date before committing to the client."
                  : "Low confidence — committing to this date is likely to disappoint. Add buffer."}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Activity estimates</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Activity</TableHead>
                <TableHead className="text-right">o</TableHead>
                <TableHead className="text-right">m</TableHead>
                <TableHead className="text-right">p</TableHead>
                <TableHead className="text-right">tₑ</TableHead>
                <TableHead className="text-right">σ²</TableHead>
                <TableHead>On critical path?</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.activities.map((a) => (
                <TableRow key={a.code} className={a.isCritical ? "bg-red-500/5" : ""}>
                  <TableCell><span className="font-mono font-medium">{a.code}</span> <span className="text-muted-foreground text-sm ml-1">{a.name}</span></TableCell>
                  <TableCell className="text-right">{a.o}</TableCell>
                  <TableCell className="text-right">{a.m}</TableCell>
                  <TableCell className="text-right">{a.p}</TableCell>
                  <TableCell className="text-right font-medium">{round(a.te)}</TableCell>
                  <TableCell className="text-right">{round(a.variance)}</TableCell>
                  <TableCell>{a.isCritical ? <span className="text-red-600 font-medium">Yes</span> : <span className="text-muted-foreground">—</span>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, sub, icon }: { label: string; value: string; sub?: string; icon?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">{icon}{label}</div>
        <p className="text-2xl font-bold">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

const round = (n: number) => Math.round(n * 100) / 100;
