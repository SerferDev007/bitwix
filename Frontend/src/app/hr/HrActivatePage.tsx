import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { hrApi } from "../lib/hrApi";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { IdCard, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

export function HrActivatePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [token, setToken] = useState(params.get("token") || "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setLoading(true);
    try {
      const res = await hrApi.activate(token.trim(), password);
      if (res.success) {
        setDone(true);
        setTimeout(() => navigate("/hr/login", { replace: true }), 1500);
      } else {
        setError(res.message || "Activation failed.");
      }
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
          <IdCard className="h-7 w-7 text-primary" />
          <div>
            <p className="font-bold leading-tight">Bitwix People</p>
            <p className="text-xs text-muted-foreground">Activate your account</p>
          </div>
        </div>
        <Card>
          <CardHeader><CardTitle className="text-xl">Set your password</CardTitle></CardHeader>
          <CardContent>
            {done ? (
              <div className="flex items-start gap-2 rounded-md bg-green-500/10 text-green-700 p-3 text-sm">
                <CheckCircle2 className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <span>Account activated. Redirecting to sign in…</span>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <div>
                  <Label htmlFor="hr-token">Activation token</Label>
                  <Input id="hr-token" value={token} required onChange={(e) => setToken(e.target.value)} placeholder="Paste the token from your invite" />
                </div>
                <div>
                  <Label htmlFor="hr-newpass">New password</Label>
                  <Input id="hr-newpass" type="password" value={password} required onChange={(e) => setPassword(e.target.value)} placeholder="At least 10 characters" />
                </div>
                <div>
                  <Label htmlFor="hr-confirm">Confirm password</Label>
                  <Input id="hr-confirm" type="password" value={confirm} required onChange={(e) => setConfirm(e.target.value)} placeholder="Re-enter password" />
                </div>
                {error && (
                  <div className="flex items-start gap-2 rounded-md bg-red-500/10 text-red-700 p-3 text-sm">
                    <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" /><span>{error}</span>
                  </div>
                )}
                <Button type="submit" disabled={loading} className="w-full flex items-center gap-2">
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />} Activate account
                </Button>
              </form>
            )}
            <p className="text-xs text-muted-foreground mt-4 text-center">
              Already activated? <Link to="/hr/login" className="text-primary hover:underline">Sign in</Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
