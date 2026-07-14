import { useState } from "react";
import { useNavigate } from "react-router";
import { crmApi } from "../lib/crmApi";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Building2, Loader2, AlertCircle } from "lucide-react";

export function CrmLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await crmApi.login(email, password);
      if (res.success) navigate("/crm/accounts", { replace: true });
      else setError(res.message || "Invalid credentials.");
    } catch {
      setError("Unable to reach the server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-6">
          <Building2 className="h-7 w-7 text-primary" />
          <div>
            <p className="font-bold leading-tight">Bitwix CRM</p>
            <p className="text-xs text-muted-foreground">Staff console</p>
          </div>
        </div>
        <Card>
          <CardHeader><CardTitle className="text-xl">Sign in</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label htmlFor="crm-email">Email</Label>
                <Input id="crm-email" type="email" value={email} required autoFocus onChange={(e) => setEmail(e.target.value)} placeholder="crmadmin@bitwix.co.in" />
              </div>
              <div>
                <Label htmlFor="crm-pass">Password</Label>
                <Input id="crm-pass" type="password" value={password} required onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
              </div>
              {error && (
                <div className="flex items-start gap-2 rounded-md bg-red-500/10 text-red-700 p-3 text-sm">
                  <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" /><span>{error}</span>
                </div>
              )}
              <Button type="submit" disabled={loading} className="w-full flex items-center gap-2">
                {loading && <Loader2 className="h-4 w-4 animate-spin" />} Sign in
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
