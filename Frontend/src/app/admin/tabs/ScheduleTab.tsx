import { useEffect, useState } from "react";
import { projectsApi, type Schedule } from "../../lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../../components/ui/table";
import { Loader2, AlertCircle, Clock, GitBranch } from "lucide-react";

export function ScheduleTab({ projectId }: { projectId: number }) {
  const [data, setData] = useState<Schedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    projectsApi
      .schedule(projectId)
      .then((res) => {
        if (!active) return;
        if (res.success && res.data) setData(res.data);
        else setError(res.message || "Could not compute the schedule.");
      })
      .catch(() => active && setError("Unable to reach the server."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [projectId]);

  if (loading)
    return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Computing critical path…</div>;
  if (error)
    return <div className="flex items-center gap-2 rounded-md bg-red-500/10 text-red-700 p-4"><AlertCircle className="h-5 w-5" /> {error}</div>;
  if (!data || data.activities.length === 0)
    return <Card><CardContent className="p-10 text-center text-muted-foreground">Add activities to compute the schedule.</CardContent></Card>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-primary/10 p-3 rounded-lg"><Clock className="h-6 w-6 text-primary" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Minimum project duration</p>
              <p className="text-2xl font-bold">{data.projectDuration} days</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-primary/10 p-3 rounded-lg"><GitBranch className="h-6 w-6 text-primary" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Critical path</p>
              <p className="text-lg font-bold font-mono">{data.criticalPath.join(" → ") || "—"}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">CPM schedule</CardTitle>
          <p className="text-sm text-muted-foreground">
            Earliest/latest start &amp; finish, total float, and criticality. Critical activities (zero float) are highlighted — protect these first.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Activity</TableHead>
                <TableHead className="text-right">Dur.</TableHead>
                <TableHead className="text-right">ES</TableHead>
                <TableHead className="text-right">EF</TableHead>
                <TableHead className="text-right">LS</TableHead>
                <TableHead className="text-right">LF</TableHead>
                <TableHead className="text-right">Float</TableHead>
                <TableHead>Critical?</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.activities.map((a) => (
                <TableRow key={a.code} className={a.isCritical ? "bg-red-500/5" : ""}>
                  <TableCell>
                    <span className="font-mono font-medium">{a.code}</span>
                    <span className="text-muted-foreground ml-2 text-sm">{a.name}</span>
                  </TableCell>
                  <TableCell className="text-right">{round(a.duration)}</TableCell>
                  <TableCell className="text-right">{round(a.es)}</TableCell>
                  <TableCell className="text-right">{round(a.ef)}</TableCell>
                  <TableCell className="text-right">{round(a.ls)}</TableCell>
                  <TableCell className="text-right">{round(a.lf)}</TableCell>
                  <TableCell className="text-right font-medium">{round(a.float)}</TableCell>
                  <TableCell>
                    {a.isCritical ? (
                      <Badge className="bg-red-500 text-white">Critical</Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">{round(a.float)}d slack</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {data.paths.length > 1 && (
        <Card>
          <CardHeader><CardTitle className="text-base">All paths through the network</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {data.paths.map((path, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="font-mono">{path.codes.join(" → ")}</span>
                <span className={i === 0 ? "font-bold text-red-600" : "text-muted-foreground"}>
                  {round(path.length)} days{i === 0 ? " (critical)" : ""}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

const round = (n: number) => Math.round(n * 100) / 100;
