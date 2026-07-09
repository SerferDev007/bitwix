import { useEffect, useState } from "react";
import { clientsApi, type QueueAnalysis } from "../../lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Badge } from "../../components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../../components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../../components/ui/table";
import { Loader2, AlertCircle, Users } from "lucide-react";

const pct = (n?: number) => (n == null ? "—" : `${Math.round(n * 100)}%`);
const mins = (hrs?: number) => (hrs == null ? "—" : `${(hrs * 60).toFixed(1)} min`);

export function SupportDeskTab() {
  const [scenarios, setScenarios] = useState<{ id: number; name: string }[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [data, setData] = useState<QueueAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    clientsApi.queues().then((res) => {
      if (res.success && res.data) {
        setScenarios(res.data);
        if (res.data.length) load(res.data[0].id);
        else setLoading(false);
      } else { setError(res.message || "Failed to load."); setLoading(false); }
    }).catch(() => { setError("Unable to reach the server."); setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async (id: number) => {
    setLoading(true); setError(null); setSelectedId(String(id));
    const res = await clientsApi.queue(id);
    setLoading(false);
    if (res.success && res.data) setData(res.data);
    else setError(res.message || "Could not analyze.");
  };

  if (loading && !data) return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading…</div>;
  if (!scenarios.length) return <Card><CardContent className="p-10 text-center text-muted-foreground">No support-desk scenarios.</CardContent></Card>;

  const target = data?.targetWaitProbability ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label>Scenario</Label>
          <Select value={selectedId} onValueChange={(v) => load(Number(v))}>
            <SelectTrigger className="w-80"><SelectValue placeholder="Choose" /></SelectTrigger>
            <SelectContent>{scenarios.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {error && <div className="flex items-center gap-2 rounded-md bg-red-500/10 text-red-700 p-4"><AlertCircle className="h-5 w-5" /> {error}</div>}

      {data && (
        <>
          <Card>
            <CardContent className="p-5 flex flex-wrap items-center gap-6">
              <div><p className="text-xs text-muted-foreground">Arrival rate (λ)</p><p className="text-lg font-bold">{data.arrivalRate}/hr</p></div>
              <div><p className="text-xs text-muted-foreground">Service rate (μ)</p><p className="text-lg font-bold">{data.serviceRate}/hr</p></div>
              <div><p className="text-xs text-muted-foreground">Offered load</p><p className="text-lg font-bold">{data.current.offeredLoad} Erlangs</p></div>
              {target != null && <div><p className="text-xs text-muted-foreground">SLA target</p><p className="text-lg font-bold">&lt; {pct(target)} wait</p></div>}
              <div className="ml-auto flex items-center gap-2 rounded-lg bg-primary/10 px-4 py-2">
                <Users className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">Recommended staffing</p>
                  <p className="text-lg font-bold text-primary">{data.recommendedServers ?? "—"} engineers</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Staffing options (M/M/c)</CardTitle>
              <p className="text-sm text-muted-foreground">
                Capacity does not scale linearly with service quality — near full utilization, one more engineer sharply cuts waiting. The recommended row is the fewest engineers meeting the SLA.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Engineers</TableHead>
                    <TableHead className="text-right">Utilization</TableHead>
                    <TableHead className="text-right">P(wait)</TableHead>
                    <TableHead className="text-right">Avg wait</TableHead>
                    <TableHead className="text-right">In queue (Lq)</TableHead>
                    <TableHead>Meets SLA?</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.options.map((o) => {
                    const meets = target == null || (o.probabilityWait != null && o.probabilityWait <= target);
                    const isRec = o.servers === data.recommendedServers;
                    return (
                      <TableRow key={o.servers} className={isRec ? "bg-green-500/10" : ""}>
                        <TableCell className="font-medium">{o.servers}{o.servers === data.currentServers && <span className="text-xs text-muted-foreground ml-2">(current)</span>}</TableCell>
                        <TableCell className="text-right">{pct(o.utilization)}</TableCell>
                        <TableCell className="text-right">{pct(o.probabilityWait)}</TableCell>
                        <TableCell className="text-right">{mins(o.avgWaitInQueue)}</TableCell>
                        <TableCell className="text-right">{o.avgNumberInQueue ?? "—"}</TableCell>
                        <TableCell>
                          {target == null ? <span className="text-muted-foreground text-sm">—</span> : meets ? <Badge className="bg-green-500 text-white">Yes</Badge> : <Badge className="bg-red-500 text-white">No</Badge>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
