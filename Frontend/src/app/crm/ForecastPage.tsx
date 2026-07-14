import { useEffect, useState } from "react";
import { crmApi, type ForecastRow } from "../lib/crmApi";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { TrendingUp, Loader2 } from "lucide-react";

const money = (n: number | string) => `$${Math.round(Number(n)).toLocaleString()}`;

export function ForecastPage() {
  const [rows, setRows] = useState<ForecastRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    crmApi.forecast()
      .then((res) => { if (res.success && res.data) setRows(res.data); else setError(res.message || "Failed to load forecast."); })
      .catch(() => setError("Unable to reach the server."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading…</div>;
  if (error) return <div className="rounded-md bg-red-500/10 text-red-700 p-4">{error}</div>;

  const totalPipeline = rows.reduce((s, r) => s + Number(r.pipeline_total), 0);
  const totalWeighted = rows.reduce((s, r) => s + Number(r.weighted_forecast), 0);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-3"><TrendingUp className="h-8 w-8 text-primary" /> Forecast</h1>
        <p className="text-muted-foreground mt-1">Weighted by stage probability, scoped to what you can see.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Open pipeline</p><p className="text-2xl font-bold">{money(totalPipeline)}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Weighted forecast</p><p className="text-2xl font-bold text-primary">{money(totalWeighted)}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">By month</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Period</TableHead><TableHead className="text-right">Deals</TableHead><TableHead className="text-right">Pipeline</TableHead><TableHead className="text-right">Weighted</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No open opportunities.</TableCell></TableRow>}
              {rows.map((r) => (
                <TableRow key={r.period}>
                  <TableCell className="font-medium">{r.period}</TableCell>
                  <TableCell className="text-right">{r.deal_count}</TableCell>
                  <TableCell className="text-right">{money(r.pipeline_total)}</TableCell>
                  <TableCell className="text-right font-medium text-primary">{money(r.weighted_forecast)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
