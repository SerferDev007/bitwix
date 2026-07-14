import { useEffect, useState } from "react";
import { crmApi, type Ticket } from "../lib/crmApi";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Ticket as TicketIcon, Loader2, CheckCircle2 } from "lucide-react";

const prColor: Record<string, string> = { LOW: "bg-slate-400", MEDIUM: "bg-blue-500", HIGH: "bg-amber-500", CRITICAL: "bg-red-500" };
const stColor: Record<string, string> = { OPEN: "bg-blue-500", IN_PROGRESS: "bg-amber-500", AWAITING_CLIENT: "bg-slate-500", RESOLVED: "bg-green-500", CLOSED: "bg-slate-600" };

export function TicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const res = await crmApi.tickets();
    if (res.success && res.data) setTickets(res.data);
    else setError(res.message || "Failed to load tickets.");
    setLoading(false);
  };
  useEffect(() => { load().catch(() => { setError("Unable to reach the server."); setLoading(false); }); }, []);

  const resolve = async (id: number) => { await crmApi.resolveTicket(id); load(); };

  if (loading) return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading…</div>;
  if (error) return <div className="rounded-md bg-red-500/10 text-red-700 p-4">{error}</div>;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-3"><TicketIcon className="h-8 w-8 text-primary" /> Tickets</h1>
        <p className="text-muted-foreground mt-1">Support tickets across accounts in your scope.</p>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Subject</TableHead><TableHead>Account</TableHead><TableHead>Priority</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {tickets.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No tickets.</TableCell></TableRow>}
              {tickets.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>{t.id}</TableCell>
                  <TableCell className="font-medium">{t.subject}</TableCell>
                  <TableCell className="text-muted-foreground">{t.account_name}</TableCell>
                  <TableCell><Badge className={`${prColor[t.priority]} text-white`}>{t.priority}</Badge></TableCell>
                  <TableCell><Badge className={`${stColor[t.status]} text-white`}>{t.status.replace("_", " ")}</Badge></TableCell>
                  <TableCell className="text-right">
                    {!["RESOLVED", "CLOSED"].includes(t.status) && <Button size="sm" variant="outline" onClick={() => resolve(t.id)} className="flex items-center gap-1"><CheckCircle2 className="h-4 w-4" /> Resolve</Button>}
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
