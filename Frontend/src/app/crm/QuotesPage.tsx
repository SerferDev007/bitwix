import { useEffect, useState } from "react";
import { crmApi, type Quote, type Opportunity } from "../lib/crmApi";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { FileSignature, Plus, Loader2, Trash2, Send, CheckCircle2 } from "lucide-react";

const stColor: Record<string, string> = { DRAFT: "bg-slate-500", PENDING_APPROVAL: "bg-amber-500", APPROVED: "bg-blue-500", SENT: "bg-green-500", ACCEPTED: "bg-green-600", REJECTED: "bg-red-500" };
const money = (n: number | string) => `₹${Math.round(Number(n)).toLocaleString()}`;

export function QuotesPage() {
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [oppId, setOppId] = useState("");
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [items, setItems] = useState([{ name: "", qty: 1, unit_price: 0 }]);
  const [discount, setDiscount] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    crmApi.opportunities().then((r) => {
      if (r.success && r.data) { const open = r.data.filter((o) => !["CLOSED_WON", "CLOSED_LOST"].includes(o.stage)); setOpps(open); if (open.length) selectOpp(String(open[0].id)); }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const selectOpp = async (id: string) => {
    setOppId(id);
    const res = await crmApi.quotes(Number(id));
    if (res.success && res.data) setQuotes(res.data);
  };

  const setItem = (i: number, field: string, v: string) => {
    const next = items.map((it) => ({ ...it }));
    (next[i] as Record<string, unknown>)[field] = field === "name" ? v : Number(v) || 0;
    setItems(next);
  };
  const subtotal = items.reduce((s, it) => s + it.qty * it.unit_price, 0);
  const total = subtotal * (1 - discount / 100);

  const create = async () => {
    setSaving(true); setMsg(null);
    const res = await crmApi.createQuote({ opportunity_id: Number(oppId), line_items: items.filter((it) => it.name), discount_pct: discount });
    setSaving(false);
    if (res.success) { setMsg(res.data?.needsApproval ? "Quote created — needs manager approval (discount over threshold)." : "Quote created (approved)."); setItems([{ name: "", qty: 1, unit_price: 0 }]); setDiscount(0); selectOpp(oppId); }
    else setMsg(res.message || "Failed.");
  };
  const doAct = async (fn: Promise<{ success: boolean; message?: string }>) => { const r = await fn; setMsg(r.message || (r.success ? "Done" : "Failed")); selectOpp(oppId); };

  if (loading) return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading…</div>;
  if (!opps.length) return <Card><CardContent className="p-10 text-center text-muted-foreground">No open opportunities. Create one in the Pipeline first.</CardContent></Card>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-3"><FileSignature className="h-8 w-8 text-primary" /> Quotes</h1>
        <p className="text-muted-foreground mt-1">Line items freeze at creation. Discounts over threshold need Sales-Manager approval, and no one sends an unapproved quote.</p>
      </div>
      {msg && <div className="rounded-md bg-primary/5 border p-3 text-sm">{msg}</div>}

      <div>
        <Label>Opportunity</Label>
        <Select value={oppId} onValueChange={selectOpp}>
          <SelectTrigger className="w-96"><SelectValue placeholder="Choose" /></SelectTrigger>
          <SelectContent>{opps.map((o) => <SelectItem key={o.id} value={String(o.id)}>{o.name} — {o.account_name}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">New quote</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {items.map((it, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="flex-1"><Label className="text-xs">Item</Label><Input value={it.name} onChange={(e) => setItem(i, "name", e.target.value)} /></div>
              <div className="w-20"><Label className="text-xs">Qty</Label><Input type="number" value={it.qty} onChange={(e) => setItem(i, "qty", e.target.value)} /></div>
              <div className="w-32"><Label className="text-xs">Unit price</Label><Input type="number" value={it.unit_price} onChange={(e) => setItem(i, "unit_price", e.target.value)} /></div>
              <Button variant="ghost" size="sm" onClick={() => setItems(items.filter((_, j) => j !== i))} disabled={items.length === 1}><Trash2 className="h-4 w-4 text-red-500" /></Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setItems([...items, { name: "", qty: 1, unit_price: 0 }])} className="flex items-center gap-1"><Plus className="h-4 w-4" /> Add line</Button>
          <div className="flex items-end gap-4 pt-2 border-t">
            <div className="w-32"><Label className="text-xs">Discount %</Label><Input type="number" value={discount} onChange={(e) => setDiscount(Number(e.target.value) || 0)} /></div>
            <div className="text-sm">Subtotal <strong>{money(subtotal)}</strong> · Total <strong className="text-primary">{money(total)}</strong></div>
            <Button onClick={create} disabled={saving || !oppId} className="ml-auto flex items-center gap-2">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create quote</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Quotes for this opportunity</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {quotes.length === 0 && <p className="text-sm text-muted-foreground">No quotes yet.</p>}
          {quotes.map((q) => (
            <div key={q.id} className="flex items-center justify-between border-b pb-2 last:border-0">
              <span className="text-sm">v{q.version} · {money(q.total)} <span className="text-muted-foreground">({q.discount_pct}% off)</span></span>
              <span className="flex items-center gap-2">
                <Badge className={`${stColor[q.status]} text-white`}>{q.status.replace("_", " ")}</Badge>
                {q.status === "PENDING_APPROVAL" && <Button size="sm" variant="outline" onClick={() => doAct(crmApi.approveQuote(q.id))} className="h-7 text-xs"><CheckCircle2 className="h-3 w-3 mr-1" />Approve</Button>}
                {q.status === "APPROVED" && <Button size="sm" variant="outline" onClick={() => doAct(crmApi.sendQuote(q.id))} className="h-7 text-xs"><Send className="h-3 w-3 mr-1" />Send</Button>}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
