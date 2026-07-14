import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router";
import { portalApi } from "./portalApi";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { LayoutGrid, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

export function PortalActivatePage() {
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
      const res = await portalApi.activate(token, password);
      if (res.success) setDone(true);
      else setError(res.message || "Activation failed.");
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
          <LayoutGrid className="h-7 w-7 text-primary" />
          <p className="font-bold">Activate your account</p>
        </div>
        <Card>
          <CardHeader><CardTitle className="text-xl">Set your password</CardTitle></CardHeader>
          <CardContent>
            {done ? (
              <div className="text-center space-y-4">
                <CheckCircle2 className="h-10 w-10 text-green-600 mx-auto" />
                <p className="text-sm">Your account is active.</p>
                <Button onClick={() => navigate("/portal/login")} className="w-full">Go to sign in</Button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <div>
                  <Label htmlFor="a-token">Invitation token</Label>
                  <Input id="a-token" value={token} required onChange={(e) => setToken(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="a-pass">New password</Label>
                  <Input id="a-pass" type="password" value={password} required onChange={(e) => setPassword(e.target.value)} placeholder="At least 12 characters" />
                </div>
                <div>
                  <Label htmlFor="a-conf">Confirm password</Label>
                  <Input id="a-conf" type="password" value={confirm} required onChange={(e) => setConfirm(e.target.value)} />
                </div>
                {error && (
                  <div className="flex items-start gap-2 rounded-md bg-red-500/10 text-red-700 p-3 text-sm">
                    <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" /><span>{error}</span>
                  </div>
                )}
                <Button type="submit" disabled={loading} className="w-full flex items-center gap-2">
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />} Activate
                </Button>
              </form>
            )}
            <p className="text-xs text-muted-foreground mt-4 text-center">
              <Link to="/portal/login" className="text-primary underline">Back to sign in</Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
