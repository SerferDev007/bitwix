import { useEffect, useState } from "react";
import { portalApi, type PortalConsent } from "./portalApi";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Bell, Loader2, Check, X } from "lucide-react";

const CHANNELS = ["EMAIL", "SMS", "PHONE"];

export function PortalConsentPage() {
  const [consent, setConsent] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const res = await portalApi.getConsent();
    if (res.success) {
      const map: Record<string, string> = {};
      (res.data as PortalConsent[] | undefined)?.forEach((c) => { map[c.channel] = c.action; });
      setConsent(map);
    } else setError(res.message || "Failed to load preferences.");
    setLoading(false);
  };
  useEffect(() => { load().catch(() => { setError("Unable to reach the server."); setLoading(false); }); }, []);

  const toggle = async (channel: string, next: "GRANTED" | "WITHDRAWN") => {
    setBusy(channel);
    const res = await portalApi.setConsent(channel, next);
    setBusy(null);
    if (res.success) setConsent((c) => ({ ...c, [channel]: next }));
    else setError(res.message || "Failed to update.");
  };

  if (loading) return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading…</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2"><Bell className="h-6 w-6 text-primary" /> Communication preferences</h1>
      {error && <div className="rounded-md bg-red-500/10 text-red-700 p-3 text-sm">{error}</div>}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Marketing consent</CardTitle>
          <p className="text-sm text-muted-foreground">Choose how we may contact you. Withdrawing takes effect on the next send.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {CHANNELS.map((ch) => {
            const granted = consent[ch] === "GRANTED";
            return (
              <div key={ch} className="flex items-center justify-between border-b pb-3 last:border-0">
                <div>
                  <p className="font-medium">{ch.charAt(0) + ch.slice(1).toLowerCase()}</p>
                  <p className="text-sm text-muted-foreground">{granted ? "You are subscribed." : "You are not subscribed."}</p>
                </div>
                {granted ? (
                  <Button variant="outline" size="sm" disabled={busy === ch} onClick={() => toggle(ch, "WITHDRAWN")} className="flex items-center gap-1">
                    {busy === ch ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />} Unsubscribe
                  </Button>
                ) : (
                  <Button size="sm" disabled={busy === ch} onClick={() => toggle(ch, "GRANTED")} className="flex items-center gap-1">
                    {busy === ch ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Subscribe
                  </Button>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
