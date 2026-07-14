import { useEffect, useState } from "react";
import { hrApi, type AuditEntry } from "../lib/hrApi";
import { Card, CardContent } from "../components/ui/card";
import { Loader2, AlertCircle } from "lucide-react";

const fmt = (d: string) => (d ? new Date(d).toLocaleString("en-IN") : "—");

export function HrAuditPage() {
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    hrApi.audit(200)
      .then((res) => {
        if (res.success && res.data) setRows(res.data);
        else setError(res.message || "Could not load the audit log.");
      })
      .catch(() => setError("Unable to reach the server."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Audit log</h1>
        <p className="text-muted-foreground text-sm">Every privileged action — provisioning, role changes, leave decisions, logins — with actor and IP.</p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md bg-red-500/10 text-red-700 p-3 text-sm">
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" /><span>{error}</span>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-10 flex justify-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : rows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No audit entries yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">When</th>
                    <th className="px-4 py-3">Actor</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">Entity</th>
                    <th className="px-4 py-3">IP</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmt(r.created_at)}</td>
                      <td className="px-4 py-3">#{r.actor_id}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.actor_role}</td>
                      <td className="px-4 py-3 font-medium">{r.action}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.entity_type} #{r.entity_id}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.ip_address || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
