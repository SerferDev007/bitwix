import { useEffect, useState } from "react";
import { financialApi, type InvestmentRanked } from "../../lib/api";
import { useCurrency } from "../../lib/currency";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Badge } from "../../components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../../components/ui/table";
import { Loader2, Plus, Trash2, Trophy } from "lucide-react";

export function InvestmentsTab() {
  const { format } = useCurrency();
  const [rows, setRows] = useState<InvestmentRanked[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", initial: "", flows: "", rate: "0.12" });
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  const load = () => {
    financialApi.investments().then((res) => {
      if (res.success && res.data) setRows(res.data);
      else setError(res.message || "Failed to load.");
      setLoading(false);
    }).catch(() => { setError("Unable to reach the server."); setLoading(false); });
  };
  useEffect(load, []);

  const add = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setFormErr(null);
    const flows = form.flows.split(",").map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n));
    const res = await financialApi.addInvestment({
      name: form.name, initial_investment: Number(form.initial), cash_flows: flows, discount_rate: Number(form.rate),
    });
    setSaving(false);
    if (res.success) { setForm({ name: "", initial: "", flows: "", rate: "0.12" }); load(); }
    else setFormErr(res.errors ? Object.values(res.errors)[0] : res.message || "Failed.");
  };

  const remove = async (id: number) => { await financialApi.deleteInvestment(id); load(); };

  if (loading) return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading…</div>;
  if (error) return <div className="rounded-md bg-red-500/10 text-red-700 p-4">{error}</div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Add investment candidate</CardTitle>
          <p className="text-sm text-muted-foreground">Cash flows are year-end amounts, comma-separated. Ranked by NPV at the given discount rate.</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={add} className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
            <div><Label htmlFor="inv-name">Name</Label><Input id="inv-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label htmlFor="inv-init">Initial ($)</Label><Input id="inv-init" type="number" required value={form.initial} placeholder="200000" onChange={(e) => setForm({ ...form, initial: e.target.value })} /></div>
            <div className="col-span-2"><Label htmlFor="inv-flows">Cash flows</Label><Input id="inv-flows" required value={form.flows} placeholder="90000,90000,90000" onChange={(e) => setForm({ ...form, flows: e.target.value })} /></div>
            <div><Label htmlFor="inv-rate">Disc. rate</Label><Input id="inv-rate" type="number" step="any" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} /></div>
            <div className="col-span-2 md:col-span-5">
              {formErr && <p className="text-sm text-red-600 mb-2">{formErr}</p>}
              <Button type="submit" disabled={saving} className="flex items-center gap-2">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Ranked by NPV</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow><TableHead>Rank</TableHead><TableHead>Name</TableHead><TableHead className="text-right">Initial</TableHead><TableHead className="text-right">PV inflows</TableHead><TableHead className="text-right">NPV</TableHead><TableHead className="text-right">PI</TableHead><TableHead /></TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No investments yet.</TableCell></TableRow>}
              {rows.map((r) => (
                <TableRow key={r.id} className={r.rank === 1 ? "bg-green-500/5" : ""}>
                  <TableCell>{r.rank === 1 ? <Trophy className="h-4 w-4 text-amber-500" /> : r.rank}</TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-right">{format(r.initialInvestment)}</TableCell>
                  <TableCell className="text-right">{format(r.pvOfInflows)}</TableCell>
                  <TableCell className={`text-right font-medium ${r.npv >= 0 ? "text-green-600" : "text-red-600"}`}>{format(r.npv)}</TableCell>
                  <TableCell className="text-right">{r.profitabilityIndex != null ? r.profitabilityIndex.toFixed(2) : "—"}</TableCell>
                  <TableCell className="text-right"><Button variant="ghost" size="sm" onClick={() => remove(r.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-xs text-muted-foreground p-4">
            NPV discounts each future cash flow to today; the profitability index (PV of inflows per dollar invested) guides choices under a capital constraint. A later-loaded stream can beat a larger undiscounted total.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
