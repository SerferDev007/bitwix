import { useState } from "react";
import { portalApi } from "./portalApi";
import { usePortal } from "./PortalRequireAuth";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { UserPlus, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

export function PortalUsersPage() {
  const { account } = usePortal();
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", role: "CLIENT_USER" });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    const res = await portalApi.requestUser(form);
    setSaving(false);
    if (res.success) {
      setMsg({ type: "ok", text: res.message || "Request submitted for approval." });
      setForm({ first_name: "", last_name: "", email: "", role: "CLIENT_USER" });
    } else {
      setMsg({ type: "err", text: res.message || "Request failed." });
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2"><UserPlus className="h-6 w-6 text-primary" /> Portal users</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Request access for a colleague</CardTitle>
          <p className="text-sm text-muted-foreground">
            Their request is reviewed and approved by the Bitwix team before the invitation is sent. You can only add people to <strong>{account?.name}</strong>.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label htmlFor="u-first">First name *</Label><Input id="u-first" required value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></div>
              <div><Label htmlFor="u-last">Last name *</Label><Input id="u-last" required value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></div>
            </div>
            <div><Label htmlFor="u-email">Work email *</Label><Input id="u-email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div>
              <Label>Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CLIENT_USER">Client User</SelectItem>
                  <SelectItem value="CLIENT_FINANCE">Client Finance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {msg && (
              <div className={`flex items-start gap-2 rounded-md p-3 text-sm ${msg.type === "ok" ? "bg-green-500/10 text-green-700" : "bg-red-500/10 text-red-700"}`}>
                {msg.type === "ok" ? <CheckCircle2 className="h-5 w-5 flex-shrink-0 mt-0.5" /> : <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />}
                <span>{msg.text}</span>
              </div>
            )}
            <Button type="submit" disabled={saving} className="flex items-center gap-2">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Submit request</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
