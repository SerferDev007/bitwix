import { useEffect, useState } from "react";
import { employeesApi, type AssignmentResult } from "../../lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../../components/ui/select";
import { Loader2, AlertCircle, Wand2, TrendingDown } from "lucide-react";

export function AllocationTab() {
  const [scenarios, setScenarios] = useState<{ id: number; name: string }[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [agents, setAgents] = useState<string[]>([]);
  const [tasks, setTasks] = useState<string[]>([]);
  const [matrix, setMatrix] = useState<number[][]>([]);
  const [mode, setMode] = useState<"min" | "max">("min");
  const [result, setResult] = useState<AssignmentResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [solving, setSolving] = useState(false);

  // Load saved scenarios and open the first one.
  useEffect(() => {
    employeesApi
      .assignments()
      .then((res) => {
        if (res.success && res.data) {
          setScenarios(res.data);
          if (res.data.length) loadScenario(res.data[0].id);
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

  const loadScenario = async (id: number) => {
    setLoading(true);
    setError(null);
    setSelectedId(String(id));
    const res = await employeesApi.assignment(id);
    setLoading(false);
    if (res.success && res.data) {
      setAgents(res.data.agents);
      setTasks(res.data.tasks);
      setMatrix(res.data.cost.map((r) => [...r]));
      setMode(res.data.mode);
      setResult(res.data.result);
    } else {
      setError(res.message || "Could not solve scenario.");
    }
  };

  const editCell = (i: number, j: number, value: string) => {
    const next = matrix.map((r) => [...r]);
    next[i][j] = value === "" ? 0 : Number(value);
    setMatrix(next);
    setResult(null); // invalidate until re-solved
  };

  const solve = async (nextMode?: "min" | "max") => {
    const useMode = nextMode || mode;
    setSolving(true);
    setError(null);
    const res = await employeesApi.solveAdhoc({ agents, tasks, cost: matrix, mode: useMode });
    setSolving(false);
    if (res.success && res.data) setResult(res.data);
    else setError(res.message || "Could not solve.");
  };

  const optimalCell = (i: number, j: number) =>
    result?.assignments.some((a) => a.agent === agents[i] && a.task === tasks[j]) ?? false;

  if (loading) return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading…</div>;

  if (!scenarios.length && !matrix.length)
    return <Card><CardContent className="p-10 text-center text-muted-foreground">No saved allocation scenarios. Seed the demo data or create one via the API.</CardContent></Card>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label>Scenario</Label>
          <Select value={selectedId} onValueChange={(v) => loadScenario(Number(v))}>
            <SelectTrigger className="w-72"><SelectValue placeholder="Choose a scenario" /></SelectTrigger>
            <SelectContent>
              {scenarios.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Objective</Label>
          <Select value={mode} onValueChange={(v) => { setMode(v as "min" | "max"); solve(v as "min" | "max"); }}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="min">Minimize cost/effort</SelectItem>
              <SelectItem value="max">Maximize fit/score</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => solve()} disabled={solving} className="flex items-center gap-2">
          {solving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} Solve
        </Button>
      </div>

      {error && <div className="flex items-center gap-2 rounded-md bg-red-500/10 text-red-700 p-4"><AlertCircle className="h-5 w-5" /> {error}</div>}

      {matrix.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Cost matrix</CardTitle>
            <p className="text-sm text-muted-foreground">
              Edit any cell to explore a what-if, then Solve. Green cells are the optimal one-to-one assignment.
            </p>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="border-collapse">
              <thead>
                <tr>
                  <th className="p-2" />
                  {tasks.map((t) => <th key={t} className="p-2 text-sm font-semibold text-center min-w-24">{t}</th>)}
                </tr>
              </thead>
              <tbody>
                {agents.map((a, i) => (
                  <tr key={a}>
                    <td className="p-2 text-sm font-semibold whitespace-nowrap">{a}</td>
                    {tasks.map((t, jdx) => (
                      <td key={t} className={`p-1 border ${optimalCell(i, jdx) ? "bg-green-500/15 border-green-500" : "border-muted"}`}>
                        <Input
                          type="number" step="any" value={matrix[i][jdx]}
                          onChange={(e) => editCell(i, jdx, e.target.value)}
                          className={`w-20 text-center ${optimalCell(i, jdx) ? "font-bold text-green-700" : ""}`}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {result && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="md:col-span-2">
            <CardHeader><CardTitle className="text-lg">Optimal assignment</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {result.assignments.map((a) => (
                  <li key={a.agent} className="flex items-center justify-between border-b pb-2 last:border-0">
                    <span><span className="font-medium">{a.agent}</span> → {a.task ?? <em className="text-muted-foreground">unassigned</em>}</span>
                    <span className="font-mono">{a.cost ?? "—"}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <div className="space-y-4">
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">Optimal total ({mode === "max" ? "score" : "cost"})</p>
                <p className="text-3xl font-bold text-primary">{result.totalCost}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground flex items-center gap-1"><TrendingDown className="h-4 w-4" /> vs. greedy ({result.greedyTotalCost})</p>
                <p className={`text-2xl font-bold ${result.savingsVsGreedy > 0 ? "text-green-600" : ""}`}>
                  {result.savingsVsGreedy > 0 ? `${result.savingsVsGreedy} better` : "tied"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  The Hungarian optimum vs. assigning each best-available pairing greedily.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
