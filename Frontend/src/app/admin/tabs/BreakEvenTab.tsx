import { useEffect, useState } from "react";
import { financialApi, type BreakEven } from "../../lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../../components/ui/table";
import { Loader2, Plus, Trash2, Calculator } from "lucide-react";

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

export function BreakEvenTab() {
  const [rows, setRows] = useState<BreakEven[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", fixed: "", price: "", variable: "", periods: "12" });
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [calc, setCalc] = useState<BreakEven | null>(null);

  const load = () => {
    financialApi.serviceLines().then((res) => {
      if (res.success && res.data) setRows(res.data);
      else setError(res.message || "Failed to load.");
      setLoading(false);
    }).catch(() => { setError("Unable to reach the server."); setLoading(false); });
  };
  useEffect(load, []);

  const preview = async () => {
    const res = await financialApi.breakEven({
      fixedCost: Number(form.fixed), price: Number(form.price), variableCost: Number(form.variable), periodsPerYear: Number(form.periods) || 1,
    });
    if (res.success && res.data) { setCalc(res.data); setFormErr(null); }
    else setFormErr(res.message || "Check your inputs.");
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setFormErr(null);
    const res = await financialApi.addServiceLine({
      name: form.name, fixed_cost: Number(form.fixed), price: Number(form.price), variable_cost: Number(form.variable), periods_per_year: Number(form.periods) || 1,
    });
    setSaving(false);
    if (res.success) { setForm({ name: "", fixed: "", price: "", variable: "", periods: "12" }); setCalc(null); load(); }
    else setFormErr(res.errors ? Object.values(res.errors)[0] : res.message || "Failed.");
  };

  const remove = async (id: number) => { await financialApi.deleteServiceLine(id); load(); };

  if (loading) return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading…</div>;
  if (error) return <div className="rounded-md bg-red-500/10 text-red-700 p-4">{error}</div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Service line break-even</CardTitle>
          <p className="text-sm text-muted-foreground">Q* = Fixed cost ÷ (Price − Variable cost). With periods/year set, the result is units (e.g. clients) needed over a year.</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={add} className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
            <div className="col-span-2 md:col-span-1"><Label htmlFor="be-name">Name</Label><Input id="be-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label htmlFor="be-fixed">Fixed/yr</Label><Input id="be-fixed" type="number" required value={form.fixed} placeholder="240000" onChange={(e) => setForm({ ...form, fixed: e.target.value })} /></div>
            <div><Label htmlFor="be-price">Price</Label><Input id="be-price" type="number" required value={form.price} placeholder="2000" onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
            <div><Label htmlFor="be-var">Variable</Label><Input id="be-var" type="number" required value={form.variable} placeholder="800" onChange={(e) => setForm({ ...form, variable: e.target.value })} /></div>
            <div><Label htmlFor="be-per">Periods/yr</Label><Input id="be-per" type="number" value={form.periods} onChange={(e) => setForm({ ...form, periods: e.target.value })} /></div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={preview} className="flex items-center gap-1"><Calculator className="h-4 w-4" /></Button>
              <Button type="submit" disabled={saving} className="flex items-center gap-1">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Save</Button>
            </div>
            {formErr && <p className="text-sm text-red-600 col-span-2 md:col-span-6">{formErr}</p>}
          </form>
          {calc && (
            <div className="mt-4 rounded-lg border p-4 flex flex-wrap items-center gap-6">
              <div><p className="text-xs text-muted-foreground">Contribution / unit</p><p className="text-lg font-bold">{money(calc.contributionMargin)}</p></div>
              <div><p className="text-xs text-muted-foreground">Break-even</p><p className="text-lg font-bold text-primary">{calc.breakEvenUnitsCeil} units <span className="text-sm text-muted-foreground">({calc.breakEvenUnits})</span></p></div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Saved service lines</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow><TableHead>Name</TableHead><TableHead className="text-right">Fixed/yr</TableHead><TableHead className="text-right">Price</TableHead><TableHead className="text-right">Variable</TableHead><TableHead className="text-right">Contribution</TableHead><TableHead className="text-right">Break-even</TableHead><TableHead /></TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No service lines yet.</TableCell></TableRow>}
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-right">{money(r.fixedCost)}</TableCell>
                  <TableCell className="text-right">{money(r.price)}</TableCell>
                  <TableCell className="text-right">{money(r.variableCost)}</TableCell>
                  <TableCell className="text-right">{money(r.contributionMargin)}</TableCell>
                  <TableCell className="text-right font-bold text-primary">{r.breakEvenUnitsCeil}</TableCell>
                  <TableCell className="text-right"><Button variant="ghost" size="sm" onClick={() => remove(r.id!)}><Trash2 className="h-4 w-4 text-red-500" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
