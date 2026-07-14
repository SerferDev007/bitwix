import { useEffect, useState } from "react";
import { fmsApi, type Pnl } from "../lib/fmsApi";
import { useCurrency } from "../lib/currency";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Loader2, AlertCircle, Calculator, TrendingUp } from "lucide-react";

const pct = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n * 1000) / 10}%`);

// Prefilled with the paper's worked example (Table 13) so the numbers are live.
const DEFAULTS = {
  salary: 100000, benefits: 25000, overhead: 25000, availableHours: 2000, utilization: 0.8,
  spend: 600000, customers: 40, arpaMonthly: 2000, grossMarginPct: 0.75, monthlyChurn: 0.015,
  cashBalance: 2400000, netMonthlyBurn: 200000,
};

export function FmsReportsPage() {
  const { format } = useCurrency();
  const [pl, setPl] = useState<Pnl | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [f, setF] = useState(DEFAULTS);
  const [ue, setUe] = useState<Record<string, unknown> | null>(null);
  const [computing, setComputing] = useState(false);
  const set = (k: keyof typeof DEFAULTS) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: Number(e.target.value) });

  useEffect(() => {
    fmsApi.pl()
      .then((r) => { if (r.success && r.data) setPl(r.data); else setError(r.message || "Could not load the P&L."); })
      .catch(() => setError("Unable to reach the server."))
      .finally(() => setLoading(false));
    compute(DEFAULTS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const compute = async (vals = f) => {
    setComputing(true);
    const res = await fmsApi.unitEconomics({
      loadedCost: { salary: vals.salary, benefits: vals.benefits, overhead: vals.overhead, availableHours: vals.availableHours, utilization: vals.utilization },
      cac: { spend: vals.spend, customers: vals.customers },
      ltv: { arpaMonthly: vals.arpaMonthly, grossMarginPct: vals.grossMarginPct, monthlyChurn: vals.monthlyChurn },
      runway: { cashBalance: vals.cashBalance, netMonthlyBurn: vals.netMonthlyBurn },
    });
    if (res.success && res.data) setUe(res.data);
    setComputing(false);
  };

  // Derive the two ratios client-side from the returned CAC/LTV.
  const cac = ue?.cac as number | undefined;
  const ltv = ue?.ltv as number | undefined;
  const loaded = ue?.loadedCost as { costPerHour: number | null } | undefined;
  const runwayMonths = ue?.runway as number | undefined;
  const ratio = cac && ltv ? Math.round((ltv / cac) * 10) / 10 : null;
  const payback = cac ? Math.round((cac / (f.arpaMonthly * f.grossMarginPct)) * 10) / 10 : null;

  const Stat = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
    <div className="rounded-lg border p-4">
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Financial reports</h1>
        <p className="text-muted-foreground text-sm">The P&L is summed straight from the ledger — no maintained totals. Unit economics derive the ratios that say whether the business works.</p>
      </div>

      {error && <div className="flex items-start gap-2 rounded-md bg-red-500/10 text-red-700 p-3 text-sm"><AlertCircle className="h-5 w-5 mt-0.5" /><span>{error}</span></div>}

      {/* P&L */}
      <Card>
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><TrendingUp className="h-5 w-5" /> Profit &amp; loss (from the ledger)</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="p-6 flex justify-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : !pl ? (
            <p className="text-sm text-muted-foreground">No ledger data yet — post some events on the Ledger page.</p>
          ) : (
            <div className="space-y-1 max-w-md text-sm">
              <Row label="Revenue" value={format(pl.revenue, { decimals: 2 })} />
              <Row label="Cost of revenue" value={`(${format(pl.costOfRevenue, { decimals: 2 })})`} />
              <Row label="Gross profit" value={format(pl.grossProfit, { decimals: 2 })} bold border />
              <Row label="Gross margin" value={pct(pl.grossMargin)} muted />
              <Row label="Operating expense" value={`(${format(pl.operatingExpense, { decimals: 2 })})`} />
              <Row label="Net profit" value={format(pl.netProfit, { decimals: 2 })} bold border />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Unit economics */}
      <Card>
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Calculator className="h-5 w-5" /> Unit economics</CardTitle></CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {loaded && <Stat label="Loaded cost / billable hr" value={loaded.costPerHour != null ? format(loaded.costPerHour, { decimals: 2 }) : "—"} hint={`util ${pct(f.utilization)}`} />}
            {cac != null && <Stat label="CAC" value={format(cac)} hint={`${f.customers} customers`} />}
            {ltv != null && <Stat label="LTV" value={format(ltv)} hint={`churn ${pct(f.monthlyChurn)}`} />}
            <Stat label="LTV : CAC" value={ratio != null ? `${ratio} : 1` : "—"} hint="≥ 3 : 1 is healthy" />
            <Stat label="CAC payback" value={payback != null ? `${payback} mo` : "—"} hint="≤ 12–18 mo" />
            {runwayMonths != null && <Stat label="Runway" value={Number.isFinite(runwayMonths) ? `${runwayMonths} mo` : "∞"} hint="cash ÷ net burn" />}
          </div>

          <form onSubmit={(e) => { e.preventDefault(); compute(); }} className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Field label="Salary" v={f.salary} on={set("salary")} />
            <Field label="Benefits" v={f.benefits} on={set("benefits")} />
            <Field label="Overhead" v={f.overhead} on={set("overhead")} />
            <Field label="Available hrs" v={f.availableHours} on={set("availableHours")} />
            <Field label="Utilization (0-1)" v={f.utilization} on={set("utilization")} step="0.01" />
            <Field label="Mktg + Sales spend" v={f.spend} on={set("spend")} />
            <Field label="New customers" v={f.customers} on={set("customers")} />
            <Field label="ARPA / month" v={f.arpaMonthly} on={set("arpaMonthly")} />
            <Field label="Gross margin (0-1)" v={f.grossMarginPct} on={set("grossMarginPct")} step="0.01" />
            <Field label="Monthly churn (0-1)" v={f.monthlyChurn} on={set("monthlyChurn")} step="0.001" />
            <Field label="Cash balance" v={f.cashBalance} on={set("cashBalance")} />
            <Field label="Net monthly burn" v={f.netMonthlyBurn} on={set("netMonthlyBurn")} />
            <div className="col-span-2 md:col-span-4">
              <Button type="submit" disabled={computing} className="flex items-center gap-2">
                {computing && <Loader2 className="h-4 w-4 animate-spin" />} Recompute
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value, bold, muted, border }: { label: string; value: string; bold?: boolean; muted?: boolean; border?: boolean }) {
  return (
    <div className={`flex justify-between py-1 ${border ? "border-t pt-2 mt-1" : ""} ${muted ? "text-muted-foreground" : ""}`}>
      <span className={bold ? "font-semibold" : ""}>{label}</span>
      <span className={bold ? "font-bold" : ""}>{value}</span>
    </div>
  );
}

function Field({ label, v, on, step }: { label: string; v: number; on: (e: React.ChangeEvent<HTMLInputElement>) => void; step?: string }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input type="number" step={step || "1"} value={v} onChange={on} />
    </div>
  );
}
