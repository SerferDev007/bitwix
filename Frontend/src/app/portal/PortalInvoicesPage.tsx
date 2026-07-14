import { useEffect, useState } from "react";
import { portalApi, type PortalInvoice } from "./portalApi";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { FileText, Loader2 } from "lucide-react";

const stColor: Record<string, string> = { DRAFT: "bg-slate-400", SENT: "bg-blue-500", PAID: "bg-green-500", OVERDUE: "bg-red-500", VOID: "bg-slate-600" };
const money = (n: number | string, cur: string) => `${cur === "INR" ? "₹" : cur + " "}${Number(n).toLocaleString()}`;

export function PortalInvoicesPage() {
  const [invoices, setInvoices] = useState<PortalInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    portalApi.invoices()
      .then((res) => { if (res.success && res.data) setInvoices(res.data); else setError(res.message || "Failed to load invoices."); })
      .catch(() => setError("Unable to reach the server."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading…</div>;
  if (error) return <div className="rounded-md bg-red-500/10 text-red-700 p-3 text-sm">{error}</div>;

  const outstanding = invoices.filter((i) => ["SENT", "OVERDUE"].includes(i.status)).reduce((s, i) => s + Number(i.amount), 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2"><FileText className="h-6 w-6 text-primary" /> Invoices</h1>
      {invoices.length > 0 && (
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Outstanding</p><p className="text-2xl font-bold">{money(outstanding, invoices[0].currency)}</p></CardContent></Card>
      )}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Number</TableHead><TableHead>Issued</TableHead><TableHead>Due</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {invoices.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No invoices.</TableCell></TableRow>}
              {invoices.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-medium">{i.number}</TableCell>
                  <TableCell className="text-muted-foreground">{i.issued_at?.slice(0, 10)}</TableCell>
                  <TableCell className="text-muted-foreground">{i.due_date?.slice(0, 10) || "—"}</TableCell>
                  <TableCell className="text-right font-medium">{money(i.amount, i.currency)}</TableCell>
                  <TableCell><Badge className={`${stColor[i.status]} text-white`}>{i.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
