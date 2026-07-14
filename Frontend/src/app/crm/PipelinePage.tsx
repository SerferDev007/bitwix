import { useEffect, useState } from "react";
import { crmApi, type Opportunity, type Account } from "../lib/crmApi";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { GitBranch, Plus, Loader2, ArrowRight } from "lucide-react";

const STAGES = ["QUALIFICATION", "DISCOVERY", "PROPOSAL", "NEGOTIATION", "CLOSED_WON", "CLOSED_LOST"];
const OPEN = ["QUALIFICATION", "DISCOVERY", "PROPOSAL", "NEGOTIATION"];
const STAGE_PROB: Record<string, number> = { QUALIFICATION: 10, DISCOVERY: 25, PROPOSAL: 50, NEGOTIATION: 75, CLOSED_WON: 100, CLOSED_LOST: 0 };

export function PipelinePage() {
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    const res = await crmApi.opportunities();
    if (res.success && res.data) setOpps(res.data);
    else setError(res.message || "Failed to load pipeline.");
    setLoading(false);
  };
  useEffect(() => { load().catch(() => { setError("Unable to reach the server."); setLoading(false); }); }, []);

  const changeStage = async (o: Opportunity, stage: string) => {
    setMsg(null);
    let lost_reason: string | undefined;
    if (stage === "CLOSED_LOST") {
      lost_reason = window.prompt("Lost reason (required):") || "";
      if (!lost_reason) return;
    }
    const res = await crmApi.setStage(o.id, stage, lost_reason);
    if (res.success) load();
    else setMsg(res.message || "Stage change rejected.");
  };

  if (loading) return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading…</div>;
  if (error) return <div className="rounded-md bg-red-500/10 text-red-700 p-4">{error}</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3"><GitBranch className="h-8 w-8 text-primary" /> Pipeline</h1>
          <p className="text-muted-foreground mt-1">Stages can't be skipped forward; a lost deal needs a reason.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="flex items-center gap-2"><Plus className="h-4 w-4" /> New Opportunity</Button></DialogTrigger>
          <NewOppDialog onCreated={() => { setOpen(false); load(); }} />
        </Dialog>
      </div>

      {msg && <div className="rounded-md bg-amber-500/10 text-amber-700 p-3 mb-4 text-sm">{msg}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {STAGES.map((stage) => {
          const inStage = opps.filter((o) => o.stage === stage);
          const total = inStage.reduce((s, o) => s + Number(o.amount), 0);
          return (
            <div key={stage} className="bg-background rounded-lg border p-3">
              <div className="flex items-center justify-between mb-3">
                <p className="font-semibold text-sm">{stage.replace("_", " ")} <span className="text-muted-foreground">({STAGE_PROB[stage]}%)</span></p>
                <span className="text-xs text-muted-foreground">${total.toLocaleString()}</span>
              </div>
              <div className="space-y-2">
                {inStage.length === 0 && <p className="text-xs text-muted-foreground py-2">—</p>}
                {inStage.map((o) => (
                  <Card key={o.id}>
                    <CardContent className="p-3">
                      <p className="text-sm font-medium">{o.name}</p>
                      <p className="text-xs text-muted-foreground">{o.account_name} · ${Number(o.amount).toLocaleString()} · {o.expected_close?.slice(0, 10)}</p>
                      {OPEN.includes(o.stage) && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {advanceTargets(o.stage).map((t) => (
                            <Button key={t} size="sm" variant="outline" className="h-6 text-xs px-2" onClick={() => changeStage(o, t)}>
                              {t === "CLOSED_WON" ? "Win" : t === "CLOSED_LOST" ? "Lose" : <>→ {t.replace("_", " ")}</>}
                            </Button>
                          ))}
                        </div>
                      )}
                      {o.stage === "CLOSED_LOST" && o.lost_reason && <p className="text-xs text-red-600 mt-1">Lost: {o.lost_reason}</p>}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Allowed forward targets: the next open stage (no skipping) plus Win/Lose.
function advanceTargets(current: string): string[] {
  const idx = OPEN.indexOf(current);
  const targets: string[] = [];
  if (idx >= 0 && idx < OPEN.length - 1) targets.push(OPEN[idx + 1]);
  targets.push("CLOSED_WON", "CLOSED_LOST");
  return targets;
}

function NewOppDialog({ onCreated }: { onCreated: () => void }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [form, setForm] = useState({ account_id: "", name: "", amount: "", expected_close: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { crmApi.accounts().then((r) => r.success && setAccounts(r.data || [])); }, []);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setErr(null);
    const res = await crmApi.createOpportunity({ account_id: Number(form.account_id), name: form.name, amount: Number(form.amount), expected_close: form.expected_close });
    setSaving(false);
    if (res.success) onCreated(); else setErr(res.message || "Failed.");
  };
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>New Opportunity</DialogTitle></DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label>Account</Label>
          <Select value={form.account_id} onValueChange={(v) => setForm({ ...form, account_id: v })}>
            <SelectTrigger><SelectValue placeholder="Choose account" /></SelectTrigger>
            <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label htmlFor="no-name">Name *</Label><Input id="no-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-4">
          <div><Label htmlFor="no-amt">Amount</Label><Input id="no-amt" type="number" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
          <div><Label htmlFor="no-close">Expected close</Label><Input id="no-close" type="date" required value={form.expected_close} onChange={(e) => setForm({ ...form, expected_close: e.target.value })} /></div>
        </div>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <DialogFooter><Button type="submit" disabled={saving || !form.account_id} className="flex items-center gap-2">{saving && <Loader2 className="h-4 w-4 animate-spin" />} Create</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}
