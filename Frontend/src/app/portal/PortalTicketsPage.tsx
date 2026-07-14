import { useEffect, useState } from "react";
import { portalApi, type PortalTicket } from "./portalApi";
import { usePortal } from "./PortalRequireAuth";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Badge } from "../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Ticket, Plus, Loader2 } from "lucide-react";

const prColor: Record<string, string> = { LOW: "bg-slate-400", MEDIUM: "bg-blue-500", HIGH: "bg-amber-500", CRITICAL: "bg-red-500" };
const stColor: Record<string, string> = { OPEN: "bg-blue-500", IN_PROGRESS: "bg-amber-500", AWAITING_CLIENT: "bg-slate-500", RESOLVED: "bg-green-500", CLOSED: "bg-slate-600" };

export function PortalTicketsPage() {
  const { can } = usePortal();
  const [tickets, setTickets] = useState<PortalTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ subject: "", body: "", priority: "MEDIUM" });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const res = await portalApi.tickets();
    if (res.success && res.data) setTickets(res.data);
    else setError(res.message || "Failed to load tickets.");
    setLoading(false);
  };
  useEffect(() => { load().catch(() => { setError("Unable to reach the server."); setLoading(false); }); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const res = await portalApi.createTicket(form);
    setSaving(false);
    if (res.success) { setForm({ subject: "", body: "", priority: "MEDIUM" }); load(); }
    else setError(res.message || "Failed to raise ticket.");
  };

  if (loading) return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading…</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2"><Ticket className="h-6 w-6 text-primary" /> Support</h1>
      {error && <div className="rounded-md bg-red-500/10 text-red-700 p-3 text-sm">{error}</div>}

      {can("ticket.create") && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Raise a ticket</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-3">
              <div><Label htmlFor="t-subj">Subject *</Label><Input id="t-subj" required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></div>
              <div><Label htmlFor="t-body">Details</Label><Textarea id="t-body" rows={3} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></div>
              <div className="flex items-end gap-3">
                <div>
                  <Label>Priority</Label>
                  <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="LOW">Low</SelectItem><SelectItem value="MEDIUM">Medium</SelectItem><SelectItem value="HIGH">High</SelectItem><SelectItem value="CRITICAL">Critical</SelectItem></SelectContent>
                  </Select>
                </div>
                <Button type="submit" disabled={saving} className="flex items-center gap-2">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Submit</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-lg">Your tickets</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Subject</TableHead><TableHead>Priority</TableHead><TableHead>Status</TableHead><TableHead>Raised</TableHead></TableRow></TableHeader>
            <TableBody>
              {tickets.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No tickets yet.</TableCell></TableRow>}
              {tickets.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.subject}</TableCell>
                  <TableCell><Badge className={`${prColor[t.priority]} text-white`}>{t.priority}</Badge></TableCell>
                  <TableCell><Badge className={`${stColor[t.status]} text-white`}>{t.status.replace("_", " ")}</Badge></TableCell>
                  <TableCell className="text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
