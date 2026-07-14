import { useEffect, useState } from "react";
import { crmApi, type Lead } from "../lib/crmApi";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Filter, Plus, Loader2, ArrowRightCircle, XCircle, CheckCircle2 } from "lucide-react";

const stColor: Record<string, string> = { NEW: "bg-slate-500", WORKING: "bg-blue-500", MQL: "bg-amber-500", SQL: "bg-purple-500", CONVERTED: "bg-green-500", DISQUALIFIED: "bg-red-500" };

const SIGNALS = [
  { key: "company_size_in_range", label: "Size in range (+20)" },
  { key: "industry_in_target", label: "Target industry (+15)" },
  { key: "is_decision_maker", label: "Decision-maker (+15)" },
  { key: "requested_demo", label: "Requested demo (+30)" },
  { key: "visited_pricing", label: "Visited pricing (+15)" },
  { key: "opened_3plus_emails", label: "Opened 3+ emails (+10)" },
];

export function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [threshold, setThreshold] = useState(60);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState<{ email: string; first_name: string; company_name: string; signals: Record<string, boolean> }>({ email: "", first_name: "", company_name: "", signals: {} });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const res = await crmApi.leads();
    if (res.success && res.data) { setLeads(res.data); setThreshold(res.mqlThreshold ?? 60); }
    else setError(res.message || "Failed to load leads.");
    setLoading(false);
  };
  useEffect(() => { load().catch(() => { setError("Unable to reach the server."); setLoading(false); }); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setMsg(null);
    const res = await crmApi.createLead({ email: form.email, first_name: form.first_name, company_name: form.company_name, signals: form.signals });
    setSaving(false);
    if (res.success) { setMsg(res.data ? `Scored ${res.data.score} → ${res.data.status}` : "Lead captured."); setForm({ email: "", first_name: "", company_name: "", signals: {} }); load(); }
    else setMsg(res.message || "Failed.");
  };

  const act = async (fn: Promise<{ success: boolean; message?: string }>) => { const r = await fn; setMsg(r.message || (r.success ? "Done" : "Failed")); load(); };
  const disqualify = (l: Lead) => { const reason = window.prompt("Disqualify reason:") || ""; if (reason) act(crmApi.setLeadStatus(l.id, "DISQUALIFIED", reason)); };

  if (loading) return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading…</div>;
  if (error) return <div className="rounded-md bg-red-500/10 text-red-700 p-4">{error}</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-3"><Filter className="h-8 w-8 text-primary" /> Leads</h1>
        <p className="text-muted-foreground mt-1">Scored by fit + engagement. MQL threshold: {threshold}.</p>
      </div>
      {msg && <div className="rounded-md bg-primary/5 border p-3 text-sm">{msg}</div>}

      <Card>
        <CardHeader><CardTitle className="text-lg">Capture lead</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={create} className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div><Label htmlFor="l-email">Email *</Label><Input id="l-email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div><Label htmlFor="l-name">First name</Label><Input id="l-name" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></div>
              <div><Label htmlFor="l-co">Company</Label><Input id="l-co" value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} /></div>
            </div>
            <div className="flex flex-wrap gap-3">
              {SIGNALS.map((s) => (
                <label key={s.key} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!form.signals[s.key]} onChange={(e) => setForm({ ...form, signals: { ...form.signals, [s.key]: e.target.checked } })} />
                  {s.label}
                </label>
              ))}
            </div>
            <Button type="submit" disabled={saving} className="flex items-center gap-2">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Capture & score</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead className="text-right">Score</TableHead><TableHead>Email</TableHead><TableHead>Company</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {leads.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No leads.</TableCell></TableRow>}
              {leads.map((l) => (
                <TableRow key={l.id} className={l.score >= threshold ? "bg-amber-500/5" : ""}>
                  <TableCell className="text-right font-bold">{l.score}</TableCell>
                  <TableCell className="font-medium">{l.email}{l.first_name ? ` (${l.first_name})` : ""}</TableCell>
                  <TableCell className="text-muted-foreground">{l.company_name || "—"}</TableCell>
                  <TableCell><Badge className={`${stColor[l.status]} text-white`}>{l.status}</Badge></TableCell>
                  <TableCell className="text-right">
                    {!["CONVERTED", "DISQUALIFIED"].includes(l.status) && (
                      <div className="flex gap-1 justify-end">
                        {["WORKING", "MQL"].includes(l.status) && <Button size="sm" variant="outline" onClick={() => act(crmApi.setLeadStatus(l.id, "SQL"))} className="h-7 text-xs"><CheckCircle2 className="h-3 w-3 mr-1" />SQL</Button>}
                        <Button size="sm" variant="outline" onClick={() => act(crmApi.convertLead(l.id, {}))} className="h-7 text-xs"><ArrowRightCircle className="h-3 w-3 mr-1" />Convert</Button>
                        <Button size="sm" variant="ghost" onClick={() => disqualify(l)} className="h-7 text-xs text-red-500"><XCircle className="h-3 w-3" /></Button>
                      </div>
                    )}
                    {l.status === "CONVERTED" && l.converted_account_id && <span className="text-xs text-green-600">→ account #{l.converted_account_id}</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
