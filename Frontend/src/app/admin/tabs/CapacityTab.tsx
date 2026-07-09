import { useEffect, useState } from "react";
import { financialApi, type LpResult } from "../../lib/api";
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
import { Loader2, AlertCircle, Wand2 } from "lucide-react";

interface Constraint { coeffs: number[]; op: string; rhs: number; label?: string }

export function CapacityTab() {
  const [scenarios, setScenarios] = useState<{ id: number; name: string }[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [labels, setLabels] = useState<string[]>([]);
  const [coeffs, setCoeffs] = useState<number[]>([]);
  const [constraints, setConstraints] = useState<Constraint[]>([]);
  const [sense, setSense] = useState<"max" | "min">("max");
  const [result, setResult] = useState<LpResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [solving, setSolving] = useState(false);

  useEffect(() => {
    financialApi.lpList().then((res) => {
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
    const res = await financialApi.lp(id);
    setLoading(false);
    if (res.success && res.data) {
      setLabels(res.data.objective.labels || res.data.objective.coeffs.map((_, i) => `x${i + 1}`));
      setCoeffs(res.data.objective.coeffs);
      setConstraints(res.data.constraints);
      setSense(res.data.sense);
      setResult(res.data.result);
    } else setError(res.message || "Could not solve.");
  };

  const solve = async () => {
    setSolving(true); setError(null);
    const res = await financialApi.lpSolve({
      objective: { coeffs, labels },
      constraints,
      sense,
    });
    setSolving(false);
    if (res.success && res.data) setResult(res.data);
    else setError(res.message || "Could not solve.");
  };

  const setObjCoeff = (i: number, v: string) => { const n = [...coeffs]; n[i] = Number(v) || 0; setCoeffs(n); setResult(null); };
  const setConCoeff = (ci: number, vi: number, v: string) => {
    const n = constraints.map((c) => ({ ...c, coeffs: [...c.coeffs] })); n[ci].coeffs[vi] = Number(v) || 0; setConstraints(n); setResult(null);
  };
  const setConRhs = (ci: number, v: string) => { const n = constraints.map((c) => ({ ...c })); n[ci].rhs = Number(v) || 0; setConstraints(n); setResult(null); };

  if (loading && !coeffs.length) return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading…</div>;
  if (!scenarios.length && !coeffs.length) return <Card><CardContent className="p-10 text-center text-muted-foreground">No LP scenarios. Seed the demo data.</CardContent></Card>;

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
        <div>
          <Label>Objective</Label>
          <Select value={sense} onValueChange={(v) => { setSense(v as "max" | "min"); setResult(null); }}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="max">Maximize</SelectItem><SelectItem value="min">Minimize</SelectItem></SelectContent>
          </Select>
        </div>
        <Button onClick={solve} disabled={solving} className="flex items-center gap-2">
          {solving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} Solve
        </Button>
      </div>

      {error && <div className="flex items-center gap-2 rounded-md bg-red-500/10 text-red-700 p-4"><AlertCircle className="h-5 w-5" /> {error}</div>}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Model</CardTitle>
          <p className="text-sm text-muted-foreground">{sense === "max" ? "Maximize" : "Minimize"} profit per unit, subject to ≤ resource limits. Edit any value, then Solve.</p>
        </CardHeader>
        <CardContent className="space-y-4 overflow-x-auto">
          <div>
            <p className="text-sm font-medium mb-2">Objective (profit per unit)</p>
            <div className="flex flex-wrap gap-3">
              {labels.map((label, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input type="number" step="any" value={coeffs[i]} onChange={(e) => setObjCoeff(i, e.target.value)} className="w-24" />
                  <span className="text-sm text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-medium mb-2">Constraints (resource ≤ available)</p>
            <div className="space-y-2">
              {constraints.map((con, ci) => (
                <div key={ci} className="flex items-center gap-2 flex-wrap">
                  {con.coeffs.map((cf, vi) => (
                    <span key={vi} className="flex items-center gap-1">
                      <Input type="number" step="any" value={cf} onChange={(e) => setConCoeff(ci, vi, e.target.value)} className="w-20" />
                      <span className="text-xs text-muted-foreground">{labels[vi]}{vi < con.coeffs.length - 1 ? " +" : ""}</span>
                    </span>
                  ))}
                  <span className="text-sm">≤</span>
                  <Input type="number" step="any" value={con.rhs} onChange={(e) => setConRhs(ci, e.target.value)} className="w-28" />
                  <span className="text-sm text-muted-foreground">{con.label}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {result && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="md:col-span-1">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Optimal objective</p>
              <p className="text-3xl font-bold text-primary">{result.objectiveValue.toLocaleString()}</p>
              <div className="mt-3 space-y-1">
                {result.solution.map((s) => (
                  <div key={s.label} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{s.label}</span><span className="font-medium">{s.value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card className="md:col-span-2">
            <CardHeader><CardTitle className="text-base">Constraints & shadow prices</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Resource</TableHead><TableHead className="text-right">Used</TableHead><TableHead className="text-right">Available</TableHead><TableHead className="text-right">Slack</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Shadow price</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {result.constraints.map((c) => (
                    <TableRow key={c.label}>
                      <TableCell>{c.label}</TableCell>
                      <TableCell className="text-right">{c.used}</TableCell>
                      <TableCell className="text-right">{c.rhs}</TableCell>
                      <TableCell className="text-right">{c.slack}</TableCell>
                      <TableCell>{c.binding ? <Badge className="bg-primary text-primary-foreground">Binding</Badge> : <span className="text-muted-foreground text-sm">slack</span>}</TableCell>
                      <TableCell className="text-right font-medium">{c.shadowPrice}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="text-xs text-muted-foreground p-4">{result.note} A binding resource's shadow price is what one more unit of it would add to the objective — buy more only if it costs less than that.</p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
