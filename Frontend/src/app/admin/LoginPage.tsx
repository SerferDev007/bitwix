import { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router";
import { authApi } from "../lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { LayoutDashboard, Loader2, AlertCircle, ArrowLeft } from "lucide-react";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Where to go after logging in (set by the route guard), default the console.
  const from = (location.state as { from?: string } | null)?.from || "/admin/projects";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await authApi.login(username, password);
      if (res.success) navigate(from, { replace: true });
      else setError(res.message || "Invalid username or password.");
    } catch {
      setError("Unable to reach the server. Is the backend running?");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-6">
          <LayoutDashboard className="h-7 w-7 text-primary" />
          <div>
            <p className="font-bold leading-tight">Bitwix OR</p>
            <p className="text-xs text-muted-foreground">Operations Console</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Sign in</CardTitle>
            <p className="text-sm text-muted-foreground">Enter your admin credentials to access the console.</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label htmlFor="login-user">Username</Label>
                <Input id="login-user" value={username} required autoFocus
                  onChange={(e) => setUsername(e.target.value)} placeholder="admin" />
              </div>
              <div>
                <Label htmlFor="login-pass">Password</Label>
                <Input id="login-pass" type="password" value={password} required
                  onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-md bg-red-500/10 text-red-700 p-3 text-sm">
                  <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <Button type="submit" disabled={loading} className="w-full flex items-center gap-2">
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Sign in
              </Button>
            </form>
          </CardContent>
        </Card>

        <Link to="/" className="mt-4 flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to website
        </Link>
      </div>
    </div>
  );
}
