import { useEffect, useState } from "react";
import { clientsApi, type Portfolio } from "../../lib/api";
import { useCurrency } from "../../lib/currency";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Badge } from "../../components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../../components/ui/table";
import { Loader2, Plus, Trash2 } from "lucide-react";

const tierColors: Record<string, string> = { strategic: "bg-primary", managed: "bg-blue-500", efficient: "bg-slate-400" };

export function PortfolioTab() {
  const { format } = useCurrency();
  const [data, setData] = useState<Portfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", margin: "", retention: "0.85", discount: "0.10", score: "3" });
  const [saving, setSaving] = useState(false);

  const load = () => {
    clientsApi.list().then((res) => {
      if (res.success && res.data) setData(res.data);
      else setError(res.message || "Failed to load.");
      setLoading(false);
    }).catch(() => { setError("Unable to reach the server."); setLoading(false); });
  };
  useEffect(load, []);

  const add = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    const res = await clientsApi.create({
      name: form.name, annual_margin: Number(form.margin), retention_rate: Number(form.retention), discount_rate: Number(form.discount), strategic_score: Number(form.score),
    });
    setSaving(false);
    if (res.success) { setForm({ name: "", margin: "", retention: "0.85", discount: "0.10", score: "3" }); load(); }
  };
  const remove = async (id: number) => { await clientsApi.remove(id); load(); };

  if (loading) return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading…</div>;
  if (error) return <div className="rounded-md bg-red-500/10 text-red-700 p-4">{error}</div>;

  return (
    <div className="space-y-6">
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Total portfolio CLV" value={format(data.totalClv)} />
          <Stat label="Strategic tier CLV" value={format(data.clvByTier.strategic)} color="text-primary" />
          <Stat label="Managed tier CLV" value={format(data.clvByTier.managed)} color="text-blue-600" />
          <Stat label="Efficient tier CLV" value={format(data.clvByTier.efficient)} color="text-slate-500" />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Add client</CardTitle>
          <p className="text-sm text-muted-foreground">CLV = margin × [r ÷ (1 + i − r)]. Retention and discount are decimals (0.85, 0.10). Strategic score 1–5.</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={add} className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
            <div className="col-span-2 md:col-span-1"><Label htmlFor="cl-name">Name</Label><Input id="cl-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label htmlFor="cl-margin">Annual margin</Label><Input id="cl-margin" type="number" required value={form.margin} placeholder="40000" onChange={(e) => setForm({ ...form, margin: e.target.value })} /></div>
            <div><Label htmlFor="cl-ret">Retention</Label><Input id="cl-ret" type="number" step="any" value={form.retention} onChange={(e) => setForm({ ...form, retention: e.target.value })} /></div>
            <div><Label htmlFor="cl-disc">Discount</Label><Input id="cl-disc" type="number" step="any" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} /></div>
            <div><Label htmlFor="cl-score">Strategic</Label><Input id="cl-score" type="number" min="1" max="5" value={form.score} onChange={(e) => setForm({ ...form, score: e.target.value })} /></div>
            <Button type="submit" disabled={saving} className="flex items-center gap-2">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Portfolio (ranked by CLV)</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow><TableHead>#</TableHead><TableHead>Client</TableHead><TableHead className="text-right">Margin</TableHead><TableHead className="text-right">Retention</TableHead><TableHead className="text-right">CLV</TableHead><TableHead>Tier</TableHead><TableHead /></TableRow>
            </TableHeader>
            <TableBody>
              {(!data || data.clients.length === 0) && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No clients yet.</TableCell></TableRow>}
              {data?.clients.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.rank}</TableCell>
                  <TableCell className="font-medium">{c.name}{c.notes && <span className="block text-xs text-muted-foreground">{c.notes}</span>}</TableCell>
                  <TableCell className="text-right">{format(c.annualMargin)}</TableCell>
                  <TableCell className="text-right">{Math.round(c.retentionRate * 100)}%</TableCell>
                  <TableCell className="text-right font-bold text-primary">{format(c.clv)}</TableCell>
                  <TableCell><Badge className={`${tierColors[c.tier]} text-white capitalize`}>{c.tier}</Badge></TableCell>
                  <TableCell className="text-right"><Button variant="ghost" size="sm" onClick={() => remove(c.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-xs text-muted-foreground p-4">
            CLV rises sharply and nonlinearly with retention — a few points of retention improvement can lift lifetime value substantially, which is why defending strategic accounts usually beats chasing new ones.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">{label}</p><p className={`text-2xl font-bold ${color || ""}`}>{value}</p></CardContent></Card>;
}
