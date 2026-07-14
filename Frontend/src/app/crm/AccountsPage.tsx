import { useEffect, useState } from "react";
import { Link } from "react-router";
import { crmApi, type Account } from "../lib/crmApi";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Users2, Plus, ArrowRight, Loader2 } from "lucide-react";

const statusColor: Record<string, string> = { PROSPECT: "bg-slate-500", ACTIVE: "bg-green-500", SUSPENDED: "bg-amber-500", CHURNED: "bg-red-500" };

export function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = async () => {
    const res = await crmApi.accounts();
    if (res.success && res.data) setAccounts(res.data);
    else setError(res.message || "Failed to load accounts.");
    setLoading(false);
  };
  useEffect(() => { load().catch(() => { setError("Unable to reach the server."); setLoading(false); }); }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3"><Users2 className="h-8 w-8 text-primary" /> Accounts</h1>
          <p className="text-muted-foreground mt-1">Client organizations, scoped to what you own or manage.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="flex items-center gap-2"><Plus className="h-4 w-4" /> New Account</Button></DialogTrigger>
          <NewAccountDialog onCreated={() => { setOpen(false); load(); }} />
        </Dialog>
      </div>

      {loading && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading…</div>}
      {error && !loading && <div className="rounded-md bg-red-500/10 text-red-700 p-4">{error}</div>}
      {!loading && !error && accounts.length === 0 && <Card><CardContent className="p-10 text-center text-muted-foreground">No accounts in your scope yet.</CardContent></Card>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {accounts.map((a) => (
          <Link key={a.id} to={`/crm/accounts/${a.id}`}>
            <Card className="hover:shadow-lg hover:border-primary/30 transition-all h-full">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-lg">{a.name}</h3>
                  <Badge className={`${statusColor[a.status] || "bg-slate-500"} text-white capitalize`}>{a.status.toLowerCase()}</Badge>
                </div>
                <p className="text-sm text-muted-foreground mb-3">{a.domain || "—"} · {a.segment || "unclassified"} · portal: {a.portal_tier}</p>
                <div className="flex items-center justify-end text-sm text-primary">Open <ArrowRight className="h-4 w-4 ml-1" /></div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

function NewAccountDialog({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState({ name: "", domain: "", segment: "MID_MARKET", portal_tier: "NONE" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setErr(null);
    const res = await crmApi.createAccount({ name: form.name, domain: form.domain || null, segment: form.segment, portal_tier: form.portal_tier });
    setSaving(false);
    if (res.success) onCreated(); else setErr(res.errors?.name || res.message || "Failed.");
  };
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>New Account</DialogTitle></DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div><Label htmlFor="na-name">Name *</Label><Input id="na-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div><Label htmlFor="na-domain">Domain</Label><Input id="na-domain" placeholder="acme.com" value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Segment</Label>
            <Select value={form.segment} onValueChange={(v) => setForm({ ...form, segment: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="SMB">SMB</SelectItem><SelectItem value="MID_MARKET">Mid-Market</SelectItem><SelectItem value="ENTERPRISE">Enterprise</SelectItem></SelectContent>
            </Select>
          </div>
          <div>
            <Label>Portal tier</Label>
            <Select value={form.portal_tier} onValueChange={(v) => setForm({ ...form, portal_tier: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="NONE">None</SelectItem><SelectItem value="BASIC">Basic</SelectItem><SelectItem value="FULL">Full</SelectItem></SelectContent>
            </Select>
          </div>
        </div>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <DialogFooter><Button type="submit" disabled={saving} className="flex items-center gap-2">{saving && <Loader2 className="h-4 w-4 animate-spin" />} Create</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}
