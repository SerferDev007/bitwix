// Client for the Financial Management System (ledger). FMS is admin-gated on the
// backend, so it reuses the admin token from ./api — no separate session.
import { authToken } from "./api";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

export interface FmsResult<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  count?: number;
}

async function req<T>(path: string, options: RequestInit = {}): Promise<FmsResult<T>> {
  const token = authToken.get();
  const res = await fetch(`${API_BASE}/fms${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });
  let body: FmsResult<T>;
  try { body = await res.json(); } catch { body = { success: false, message: "Unexpected server response." }; }
  return res.ok ? body : { ...body, success: false };
}

export interface GlAccount { code: string; name: string; account_type: string; normal_side: string; }
export interface AccountBalance { code: string; name: string; type: string; debits: number; credits: number; balance: number; }
export interface JournalLine { account_code: string; account_name: string; side: "DR" | "CR"; amount: string | number; }
export interface JournalEntry {
  id: number; entry_no: string; entry_date: string; description: string;
  source: string; status: string; posted_at: string | null; lines: JournalLine[];
}
export interface TrialBalance { debits: number; credits: number; balanced: boolean; }
export interface Pnl {
  revenue: number; costOfRevenue: number; grossProfit: number; grossMargin: number | null;
  operatingExpense: number; netProfit: number; accounts: AccountBalance[];
}

// Amounts cross the API in integer MINOR UNITS (cents) — the UI collects dollars
// and multiplies by 100 here so the ledger never sees a float.
export const toCents = (dollars: number) => Math.round(dollars * 100);

export const fmsApi = {
  accounts: () => req<GlAccount[]>("/accounts"),
  trialBalance: () => req<TrialBalance>("/trial-balance"),
  pl: () => req<Pnl>("/pl"),
  journal: (limit = 50) => req<JournalEntry[]>(`/journal?limit=${limit}`),
  postEvent: (b: { type: string; event: unknown; eventId?: string }) =>
    req<{ jeId?: number; entryNo?: string; alreadyPosted?: boolean }>("/events", { method: "POST", body: JSON.stringify(b) }),
  createJournal: (b: { description?: string; created_by: number; lines: { account_code: string; side: "DR" | "CR"; amount: number; cost_center_code?: string }[] }) =>
    req<{ jeId: number; entryNo: string; status: string }>("/journal", { method: "POST", body: JSON.stringify(b) }),
  approveJournal: (id: number, approved_by: number) =>
    req(`/journal/${id}/approve`, { method: "POST", body: JSON.stringify({ approved_by }) }),
  reverseJournal: (id: number) => req(`/journal/${id}/reverse`, { method: "POST" }),
  unitEconomics: (b: Record<string, unknown>) => req<Record<string, unknown>>("/analytics/unit-economics", { method: "POST", body: JSON.stringify(b) }),
  reconcile: () => req<{ deals: number; invoices: number; payroll: number; errors: string[] }>("/reconcile", { method: "POST" }),
};
