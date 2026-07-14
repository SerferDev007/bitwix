import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { crmApi, type Account, type Contact, type PortalUser, type Opportunity, type Invoice } from "../lib/crmApi";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { ArrowLeft, Loader2, Plus, UserPlus, Ban, Copy, KeyRound, BadgeCheck } from "lucide-react";

export function AccountDetailPage() {
  const { id } = useParams();
  const accountId = Number(id);
  const [account, setAccount] = useState<Account | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [portalUsers, setPortalUsers] = useState<PortalUser[]>([]);
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<{ token: string } | null>(null);

  const load = useCallback(async () => {
    const [a, c, p, o, inv] = await Promise.all([
      crmApi.account(accountId), crmApi.contacts(accountId), crmApi.portalUsers(accountId), crmApi.opportunities(accountId), crmApi.invoices(accountId),
    ]);
    if (!a.success) { setError(a.message || "Not found"); setLoading(false); return; }
    setAccount(a.data!); setContacts(c.data || []); setPortalUsers(p.data || []); setOpps(o.data || []); setInvoices(inv.data || []);
    setLoading(false);
  }, [accountId]);
  useEffect(() => { load().catch(() => { setError("Unable to reach the server."); setLoading(false); }); }, [load]);

  const [cForm, setCForm] = useState({ first_name: "", last_name: "", email: "", title: "" });
  const addContact = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await crmApi.createContact({ account_id: accountId, ...cForm });
    if (res.success) { setCForm({ first_name: "", last_name: "", email: "", title: "" }); load(); }
  };

  const [provContact, setProvContact] = useState("");
  const [provRole, setProvRole] = useState("CLIENT_USER");
  const provision = async () => {
    if (!provContact) return;
    const res = await crmApi.provisionPortal({ contact_id: Number(provContact), role: provRole });
    if (res.success && res.data) { setInvite({ token: res.data.activation.token }); load(); }
    else setError(res.message || "Provisioning failed.");
  };
  const revoke = async (puId: number) => { await crmApi.revokePortal(puId); load(); };
  const markPaid = async (invId: number) => {
    const res = await crmApi.payInvoice(invId);
    if (res.success) load(); else setError(res.message || "Could not record payment.");
  };

  if (loading) return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading…</div>;
  if (error || !account) return <div className="rounded-md bg-red-500/10 text-red-700 p-4">{error || "Not found"}</div>;

  const canProvision = account.portal_tier !== "NONE";

  return (
    <div className="space-y-6">
      <Link to="/crm/accounts" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Accounts</Link>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">{account.name}</h1>
          <p className="text-muted-foreground mt-1">{account.domain || "—"} · {account.segment || "unclassified"} · portal tier: <strong>{account.portal_tier}</strong></p>
        </div>
        <Badge className="capitalize">{account.status.toLowerCase()}</Badge>
      </div>

      {/* Contacts */}
      <Card>
        <CardHeader><CardTitle className="text-lg">Contacts</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {contacts.length === 0 && <p className="text-sm text-muted-foreground">No contacts yet.</p>}
          <div className="space-y-1">
            {contacts.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-sm border-b pb-1 last:border-0">
                <span>{c.first_name} {c.last_name} <span className="text-muted-foreground">· {c.email}{c.title ? ` · ${c.title}` : ""}</span></span>
              </div>
            ))}
          </div>
          <form onSubmit={addContact} className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end pt-2 border-t">
            <div><Label htmlFor="cf-first">First</Label><Input id="cf-first" required value={cForm.first_name} onChange={(e) => setCForm({ ...cForm, first_name: e.target.value })} /></div>
            <div><Label htmlFor="cf-last">Last</Label><Input id="cf-last" required value={cForm.last_name} onChange={(e) => setCForm({ ...cForm, last_name: e.target.value })} /></div>
            <div className="col-span-2"><Label htmlFor="cf-email">Email</Label><Input id="cf-email" type="email" required value={cForm.email} onChange={(e) => setCForm({ ...cForm, email: e.target.value })} /></div>
            <Button type="submit" className="flex items-center gap-1"><Plus className="h-4 w-4" /> Add</Button>
          </form>
        </CardContent>
      </Card>

      {/* Portal access */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Portal access</CardTitle>
          <p className="text-sm text-muted-foreground">Grant a client login to a contact. {canProvision ? "" : "Enable a portal tier on this account first."}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {portalUsers.map((pu) => (
            <div key={pu.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
              <span>{pu.first_name} {pu.last_name} <span className="text-muted-foreground">· {pu.email} · {pu.role}</span> <Badge variant="outline" className="ml-2">{pu.status}</Badge></span>
              {pu.status !== "REVOKED" && <Button variant="ghost" size="sm" onClick={() => revoke(pu.id)} className="flex items-center gap-1 text-red-500"><Ban className="h-4 w-4" /> Revoke</Button>}
            </div>
          ))}
          {canProvision && (
            <div className="flex flex-wrap items-end gap-2 pt-2 border-t">
              <div>
                <Label>Contact</Label>
                <Select value={provContact} onValueChange={setProvContact}>
                  <SelectTrigger className="w-56"><SelectValue placeholder="Choose contact" /></SelectTrigger>
                  <SelectContent>{contacts.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.first_name} {c.last_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Portal role</Label>
                <Select value={provRole} onValueChange={setProvRole}>
                  <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CLIENT_ADMIN">Client Admin</SelectItem>
                    <SelectItem value="CLIENT_USER">Client User</SelectItem>
                    <SelectItem value="CLIENT_FINANCE">Client Finance (Full tier)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={provision} disabled={!provContact} className="flex items-center gap-2"><UserPlus className="h-4 w-4" /> Grant access</Button>
            </div>
          )}
          {invite && (
            <div className="rounded-md bg-primary/5 border p-3 text-sm">
              <p className="font-medium flex items-center gap-1 mb-1"><KeyRound className="h-4 w-4" /> Activation link created</p>
              <p className="text-muted-foreground mb-2">Send this to the client — they set their own password. It expires in 72 hours.</p>
              <div className="flex items-center gap-2">
                <code className="bg-muted px-2 py-1 rounded text-xs break-all flex-1">/portal/activate?token={invite.token}</code>
                <Button variant="outline" size="sm" onClick={() => navigator.clipboard?.writeText(`/portal/activate?token=${invite.token}`)}><Copy className="h-4 w-4" /></Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Opportunities */}
      <Card>
        <CardHeader><CardTitle className="text-lg">Opportunities</CardTitle></CardHeader>
        <CardContent>
          {opps.length === 0 ? <p className="text-sm text-muted-foreground">No opportunities. Create one from the Pipeline.</p> : (
            <div className="space-y-1">
              {opps.map((o) => (
                <div key={o.id} className="flex items-center justify-between text-sm border-b pb-1 last:border-0">
                  <span>{o.name}</span>
                  <span className="flex items-center gap-3"><Badge variant="outline">{o.stage}</Badge> <span className="font-medium">${Number(o.amount).toLocaleString()}</span></span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invoices — recording a payment posts PAYMENT_RECEIVED to the ledger */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Invoices</CardTitle>
          <p className="text-sm text-muted-foreground">Recording a payment flips the invoice to PAID and posts <span className="font-mono">PAYMENT_RECEIVED</span> (Bank ↔ AR) to the finance ledger.</p>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? <p className="text-sm text-muted-foreground">No invoices.</p> : (
            <div className="space-y-1">
              {invoices.map((iv) => (
                <div key={iv.id} className="flex items-center justify-between text-sm border-b pb-1 last:border-0">
                  <span className="font-mono">{iv.number}</span>
                  <span className="flex items-center gap-3">
                    <span className="font-medium">{iv.currency === "USD" ? "$" : "₹"}{Number(iv.amount).toLocaleString()}</span>
                    <Badge variant="outline">{iv.status}</Badge>
                    {["DRAFT", "SENT", "OVERDUE"].includes(iv.status) ? (
                      <Button size="sm" variant="outline" onClick={() => markPaid(iv.id)} className="flex items-center gap-1"><BadgeCheck className="h-4 w-4" /> Mark paid</Button>
                    ) : iv.paid_at ? <span className="text-xs text-muted-foreground">paid {iv.paid_at}</span> : null}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
