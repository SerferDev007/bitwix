import { useEffect, useState } from "react";
import { hrApi, type LeaveType, type LeaveBalance, type LeaveRequest } from "../lib/hrApi";
import { useHrAuth } from "./HrRequireAuth";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Loader2, AlertCircle, CheckCircle2, CalendarPlus, Check, X } from "lucide-react";

const selectClass = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
const fmtDate = (d: string) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");

const statusStyle: Record<string, string> = {
  PENDING: "bg-amber-500/15 text-amber-700",
  APPROVED: "bg-green-500/15 text-green-700",
  REJECTED: "bg-red-500/15 text-red-700",
};

export function HrLeavePage() {
  const { user, can } = useHrAuth();
  const canApprove = can("leave.approve.team");

  const [types, setTypes] = useState<LeaveType[]>([]);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [form, setForm] = useState({ leave_type_id: "", start_date: "", end_date: "", reason: "" });
  const [applying, setApplying] = useState(false);

  const loadDynamic = () => {
    Promise.all([hrApi.leaveBalance(), hrApi.leaveRequests()])
      .then(([bal, reqs]) => {
        if (bal.success && bal.data) setBalances(bal.data);
        if (reqs.success && reqs.data) setRequests(reqs.data);
      })
      .catch(() => setError("Unable to reach the server."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    hrApi.leaveTypes().then((res) => {
      if (res.success && res.data) {
        setTypes(res.data);
        if (res.data[0]) setForm((f) => ({ ...f, leave_type_id: String(res.data![0].id) }));
      }
    });
    loadDynamic();
  }, []);

  const apply = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setNotice(null);
    setApplying(true);
    try {
      const res = await hrApi.applyLeave({
        leave_type_id: Number(form.leave_type_id),
        start_date: form.start_date,
        end_date: form.end_date,
        reason: form.reason.trim() || undefined,
      });
      if (res.success && res.data) {
        setNotice(`Applied for ${res.data.days} day(s) — status ${res.data.status}.`);
        setForm({ ...form, start_date: "", end_date: "", reason: "" });
        loadDynamic();
      } else setError(res.message || "Could not apply for leave.");
    } catch {
      setError("Unable to reach the server.");
    } finally {
      setApplying(false);
    }
  };

  const decide = async (r: LeaveRequest, action: "approve" | "reject") => {
    setError(null); setNotice(null);
    const note = action === "reject" ? window.prompt("Reason for rejection (optional):") || undefined : undefined;
    const res = action === "approve" ? await hrApi.approveLeave(r.id) : await hrApi.rejectLeave(r.id, note);
    if (res.success) { setNotice(res.message || `Request ${action}d.`); loadDynamic(); }
    else setError(res.message || `Could not ${action} the request.`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Leave</h1>
        <p className="text-muted-foreground text-sm">Your balances and requests{canApprove ? ", plus approvals for your team" : ""}.</p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md bg-red-500/10 text-red-700 p-3 text-sm">
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" /><span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="flex items-start gap-2 rounded-md bg-green-500/10 text-green-700 p-3 text-sm">
          <CheckCircle2 className="h-5 w-5 flex-shrink-0 mt-0.5" /><span>{notice}</span>
        </div>
      )}

      {/* Balances */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {balances.map((b) => (
          <Card key={b.leave_type_id}>
            <CardContent className="p-4">
              <p className="text-xs uppercase text-muted-foreground">{b.name}</p>
              <p className="text-2xl font-bold">{b.available}</p>
              <p className="text-xs text-muted-foreground">of {b.entitled} · {b.used} used · {b.pending} pending</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Apply */}
      <Card>
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><CalendarPlus className="h-5 w-5" /> Apply for leave</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={apply} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div>
              <Label htmlFor="lv-type">Type</Label>
              <select id="lv-type" className={selectClass} value={form.leave_type_id} onChange={(e) => setForm({ ...form, leave_type_id: e.target.value })}>
                {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="lv-start">Start</Label>
              <Input id="lv-start" type="date" value={form.start_date} required onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="lv-end">End</Label>
              <Input id="lv-end" type="date" value={form.end_date} required onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
            </div>
            <div>
              <Button type="submit" disabled={applying} className="w-full flex items-center gap-2">
                {applying && <Loader2 className="h-4 w-4 animate-spin" />} Apply
              </Button>
            </div>
            <div className="md:col-span-4">
              <Label htmlFor="lv-reason">Reason (optional)</Label>
              <Input id="lv-reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Family function, medical, …" />
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Requests */}
      <Card>
        <CardHeader><CardTitle className="text-lg">Requests</CardTitle></CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-10 flex justify-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : requests.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No leave requests.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Employee</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Dates</th>
                    <th className="px-4 py-3">Days</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {requests.map((r) => {
                    const isOwn = r.employee_id === user.employeeId;
                    const canDecide = canApprove && r.status === "PENDING" && !isOwn;
                    return (
                      <tr key={r.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium">{r.employee_name || (isOwn ? "You" : `#${r.employee_id}`)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{r.leave_type || `#${r.leave_type_id}`}</td>
                        <td className="px-4 py-3 text-muted-foreground">{fmtDate(r.start_date)} → {fmtDate(r.end_date)}</td>
                        <td className="px-4 py-3">{r.days}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${statusStyle[r.status] || "bg-gray-400/20 text-gray-600"}`}>{r.status}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            {canDecide ? (
                              <>
                                <Button type="button" size="sm" variant="outline" onClick={() => decide(r, "approve")} className="flex items-center gap-1 text-green-700">
                                  <Check className="h-3 w-3" /> Approve
                                </Button>
                                <Button type="button" size="sm" variant="outline" onClick={() => decide(r, "reject")} className="flex items-center gap-1 text-red-600">
                                  <X className="h-3 w-3" /> Reject
                                </Button>
                              </>
                            ) : (
                              <span className="text-xs text-muted-foreground">{r.status !== "PENDING" ? "—" : ""}</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
