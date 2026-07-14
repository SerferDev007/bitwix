import { Fragment, useEffect, useState } from "react";
import { fmsApi, toCents, type GlAccount, type JournalEntry, type TrialBalance } from "../lib/fmsApi";
import { useCurrency } from "../lib/currency";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Loader2, AlertCircle, CheckCircle2, Scale, Zap, Undo2, ChevronRight, ChevronDown, RefreshCw } from "lucide-react";

const sel = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

// The integration contract, presented as a menu (Section 4.2).
const EVENT_TYPES = [
  { type: "INVOICE_ISSUED", label: "Invoice issued  ·  AR ↔ Deferred Revenue", kind: "amount", extra: "account_ref_id" },
  { type: "PAYMENT_RECEIVED", label: "Payment received  ·  Bank ↔ AR", kind: "amount", extra: "account_ref_id" },
  { type: "REVENUE_RECOGNIZED", label: "Revenue recognized  ·  Deferred ↔ Revenue", kind: "amount", extra: "account_ref_id" },
  { type: "CAMPAIGN_CHARGED", label: "Marketing spend  ·  Marketing ↔ Bank", kind: "amount", extra: "campaign_id" },
  { type: "COMMISSION_EARNED", label: "Commission earned  ·  Expense ↔ Payable", kind: "amount", extra: "employee" },
  { type: "PAYROLL_APPROVED", label: "Payroll approved  ·  COGS/OpEx ↔ Payables", kind: "payroll" },
] as const;

const money0 = (n: string | number) => Number(n);

export function FmsLedgerPage() {
  const { format } = useCurrency();
  const [accounts, setAccounts] = useState<GlAccount[]>([]);
  const [tb, setTb] = useState<TrialBalance | null>(null);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  // Post-event form
  const [evt, setEvt] = useState<string>("INVOICE_ISSUED");
  const [amount, setAmount] = useState("");
  const [extraVal, setExtraVal] = useState("");
  const [tax, setTax] = useState("");
  const [billable, setBillable] = useState(true);
  const [posting, setPosting] = useState(false);
  const [reconciling, setReconciling] = useState(false);

  const cfg = EVENT_TYPES.find((e) => e.type === evt)!;

  const refresh = () => {
    setLoading(true);
    Promise.all([fmsApi.trialBalance(), fmsApi.journal(50)])
      .then(([t, j]) => {
        if (t.success && t.data) setTb(t.data);
        if (j.success && j.data) setJournal(j.data);
      })
      .catch(() => setError("Unable to reach the server."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fmsApi.accounts().then((r) => { if (r.success && r.data) setAccounts(r.data); });
    refresh();
  }, []);

  const submitEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setNotice(null);
    setPosting(true);
    try {
      let event: Record<string, unknown>;
      if (cfg.kind === "payroll") {
        const gross = toCents(Number(amount) || 0);
        const taxC = toCents(Number(tax) || 0);
        if (gross <= 0 || taxC < 0 || taxC >= gross) throw new Error("Gross must be positive and greater than tax.");
        event = { lines: [{ employee: 1, cost_center: billable ? "ENG" : "G&A", gross, net: gross - taxC, tax: taxC, is_billable_role: billable }] };
      } else {
        const cents = toCents(Number(amount) || 0);
        if (cents <= 0) throw new Error("Amount must be greater than zero.");
        event = { amount: cents };
        if (extraVal) event[cfg.extra!] = Number(extraVal);
      }
      const res = await fmsApi.postEvent({ type: evt, event });
      if (res.success) {
        setNotice(res.data?.alreadyPosted ? "Event already posted (idempotent)." : `Posted ${res.data?.entryNo}.`);
        setAmount(""); setExtraVal(""); setTax("");
        refresh();
      } else setError(res.message || "Could not post the event.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post the event.");
    } finally {
      setPosting(false);
    }
  };

  const approve = async (entry: JournalEntry) => {
    const checker = window.prompt("Approve as user id (the checker — must differ from the maker):");
    if (!checker) return;
    const res = await fmsApi.approveJournal(entry.id, Number(checker));
    if (res.success) { setNotice(`Posted ${entry.entry_no}.`); refresh(); }
    else setError(res.message || "Could not approve.");
  };

  const reverse = async (entry: JournalEntry) => {
    if (!window.confirm(`Reverse ${entry.entry_no}? A reversing entry is added; nothing is deleted.`)) return;
    const res = await fmsApi.reverseJournal(entry.id);
    if (res.success) { setNotice(`Reversed ${entry.entry_no}.`); refresh(); }
    else setError(res.message || "Could not reverse.");
  };

  const reconcile = async () => {
    setError(null); setNotice(null); setReconciling(true);
    try {
      const res = await fmsApi.reconcile();
      if (res.success && res.data) {
        const d = res.data;
        setNotice(`Reconcile: ${d.deals} deal(s), ${d.invoices} invoice(s), ${d.payroll} payroll run(s) (re)posted${d.errors?.length ? ` · ${d.errors.length} error(s)` : ""}.`);
        refresh();
      } else setError(res.message || "Reconcile failed.");
    } finally { setReconciling(false); }
  };

  const entryTotal = (en: JournalEntry) => en.lines.filter((l) => l.side === "DR").reduce((s, l) => s + money0(l.amount), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Ledger</h1>
        <p className="text-muted-foreground text-sm">The immutable double-entry journal. Operational events post here; balances are summed from it — never maintained.</p>
      </div>

      {error && <div className="flex items-start gap-2 rounded-md bg-red-500/10 text-red-700 p-3 text-sm"><AlertCircle className="h-5 w-5 mt-0.5" /><span>{error}</span></div>}
      {notice && <div className="flex items-start gap-2 rounded-md bg-green-500/10 text-green-700 p-3 text-sm"><CheckCircle2 className="h-5 w-5 mt-0.5" /><span>{notice}</span></div>}

      {/* Trial balance */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2"><Scale className="h-5 w-5 text-primary" /><span className="font-semibold">Trial balance</span></div>
          <div><p className="text-xs text-muted-foreground">Total debits</p><p className="text-lg font-bold">{tb ? format(tb.debits, { decimals: 2 }) : "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">Total credits</p><p className="text-lg font-bold">{tb ? format(tb.credits, { decimals: 2 }) : "—"}</p></div>
          <div className="ml-auto flex items-center gap-3">
            {tb && (
              <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm ${tb.balanced ? "bg-green-500/15 text-green-700" : "bg-red-500/15 text-red-700"}`}>
                {tb.balanced ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                {tb.balanced ? "Balanced (Σ DR = Σ CR)" : "OUT OF BALANCE"}
              </span>
            )}
            <Button type="button" size="sm" variant="outline" onClick={reconcile} disabled={reconciling} className="flex items-center gap-1" title="Re-post any won deal / paid invoice / approved payroll whose ledger entry was dropped">
              {reconciling ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Reconcile
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Post a business event */}
      <Card>
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Zap className="h-5 w-5" /> Post a business event</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submitEvent} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="md:col-span-2">
              <Label htmlFor="evt-type">Event</Label>
              <select id="evt-type" className={sel} value={evt} onChange={(e) => setEvt(e.target.value)}>
                {EVENT_TYPES.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="evt-amt">{cfg.kind === "payroll" ? "Gross pay" : "Amount"}</Label>
              <Input id="evt-amt" type="number" min="0" step="0.01" value={amount} required onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 120000" />
            </div>
            {cfg.kind === "payroll" ? (
              <div>
                <Label htmlFor="evt-tax">Tax withheld</Label>
                <Input id="evt-tax" type="number" min="0" step="0.01" value={tax} onChange={(e) => setTax(e.target.value)} placeholder="e.g. 1200" />
              </div>
            ) : cfg.extra ? (
              <div>
                <Label htmlFor="evt-extra">{cfg.extra === "account_ref_id" ? "Client account id" : cfg.extra === "campaign_id" ? "Campaign id" : "Employee id"} (opt.)</Label>
                <Input id="evt-extra" type="number" value={extraVal} onChange={(e) => setExtraVal(e.target.value)} placeholder="optional" />
              </div>
            ) : <div />}
            {cfg.kind === "payroll" && (
              <label className="flex items-center gap-2 text-sm md:col-span-2">
                <input type="checkbox" checked={billable} onChange={(e) => setBillable(e.target.checked)} />
                Billable role (→ Cost of Revenue; otherwise Operating Expense)
              </label>
            )}
            <div>
              <Button type="submit" disabled={posting} className="w-full flex items-center gap-2">
                {posting && <Loader2 className="h-4 w-4 animate-spin" />} Post to ledger
              </Button>
            </div>
          </form>
          <p className="text-xs text-muted-foreground mt-3">Each event becomes one balanced journal entry. Posting is idempotent — the same event never posts twice.</p>
        </CardContent>
      </Card>

      {/* Journal */}
      <Card>
        <CardHeader><CardTitle className="text-lg">Journal</CardTitle></CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-10 flex justify-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : journal.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No journal entries yet. Post an event above to see the ledger fill in.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 w-6"></th>
                    <th className="px-4 py-3">Entry</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {journal.map((en) => {
                    const open = !!expanded[en.id];
                    return (
                      <Fragment key={en.id}>
                        <tr className="hover:bg-muted/30 cursor-pointer" onClick={() => setExpanded((s) => ({ ...s, [en.id]: !open }))}>
                          <td className="px-4 py-3 text-muted-foreground">{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
                          <td className="px-4 py-3 font-mono text-xs">{en.entry_no}</td>
                          <td className="px-4 py-3">{en.description}</td>
                          <td className="px-4 py-3 text-muted-foreground">{en.source}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${en.status === "POSTED" ? "bg-green-500/15 text-green-700" : en.status === "REVERSED" ? "bg-gray-400/20 text-gray-600" : "bg-amber-500/15 text-amber-700"}`}>{en.status}</span>
                          </td>
                          <td className="px-4 py-3 text-right font-medium">{format(entryTotal(en), { decimals: 2 })}</td>
                          <td className="px-4 py-3 text-right" onClick={(ev) => ev.stopPropagation()}>
                            {en.status === "DRAFT" && <Button size="sm" variant="outline" onClick={() => approve(en)}>Approve</Button>}
                            {en.status === "POSTED" && <Button size="sm" variant="outline" onClick={() => reverse(en)} className="flex items-center gap-1"><Undo2 className="h-3 w-3" /> Reverse</Button>}
                          </td>
                        </tr>
                        {open && (
                          <tr className="bg-muted/20">
                            <td></td>
                            <td colSpan={6} className="px-4 py-2">
                              <table className="w-full text-xs">
                                <tbody>
                                  {en.lines.map((l, i) => (
                                    <tr key={i}>
                                      <td className="py-1 pr-4 font-mono">{l.account_code}</td>
                                      <td className="py-1 pr-4">{l.account_name}</td>
                                      <td className="py-1 pr-4 text-right w-28">{l.side === "DR" ? format(l.amount, { decimals: 2 }) : ""}</td>
                                      <td className="py-1 text-right w-28">{l.side === "CR" ? format(l.amount, { decimals: 2 }) : ""}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Chart of accounts */}
      <Card>
        <CardHeader><CardTitle className="text-lg">Chart of accounts</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr><th className="px-4 py-3">Code</th><th className="px-4 py-3">Account</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Normal</th></tr>
              </thead>
              <tbody className="divide-y">
                {accounts.map((a) => (
                  <tr key={a.code} className="hover:bg-muted/30">
                    <td className="px-4 py-2 font-mono text-xs">{a.code}</td>
                    <td className="px-4 py-2">{a.name}</td>
                    <td className="px-4 py-2 text-muted-foreground">{a.account_type}</td>
                    <td className="px-4 py-2 text-muted-foreground">{a.normal_side}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
