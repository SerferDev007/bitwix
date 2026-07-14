// Client for the CRM internal (staff) plane. Uses its own token/session,
// distinct from the OR-admin token and the client portal — mirroring the
// backend's dual-plane separation.
const API_BASE = import.meta.env.VITE_API_URL || "/api";
const TOKEN_KEY = "bitwix_crm_token";

export const crmToken = {
  get: () => (typeof localStorage !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export interface CrmResult<T = unknown> {
  success: boolean;
  message?: string;
  errors?: Record<string, string>;
  data?: T;
  count?: number;
  access_token?: string;
  user?: { id: number; email: string; role: string; plane: string };
  actor?: { userId: number; role: string; name: string };
  permissions?: string[];
}

async function req<T>(path: string, options: RequestInit = {}): Promise<CrmResult<T>> {
  const token = crmToken.get();
  const res = await fetch(`${API_BASE}/crm${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });
  if (res.status === 401 && path !== "/auth/login") {
    crmToken.clear();
    if (typeof window !== "undefined" && window.location.pathname.startsWith("/crm") && !window.location.pathname.startsWith("/crm/login")) {
      window.location.assign("/crm/login");
    }
  }
  let body: CrmResult<T>;
  try { body = await res.json(); } catch { body = { success: false, message: "Unexpected server response." }; }
  return res.ok ? body : { ...body, success: false };
}

// --- Types ---
export interface Account {
  id: number; name: string; domain: string | null; industry?: string | null;
  segment: string | null; status: string; portal_tier: string;
  owner_id: number | null; account_manager_id: number | null; territory_id: number | null;
  health_score: number | null;
}
export interface Contact { id: number; first_name: string; last_name: string; email: string; title: string | null; is_primary: number | boolean; status: string; }
export interface PortalUser { id: number; email: string; role: string; status: string; first_name: string; last_name: string; }
export interface Opportunity { id: number; account_id: number; account_name?: string; name: string; stage: string; amount: string | number; probability: number; expected_close: string; lost_reason: string | null; }
export interface Ticket { id: number; account_id: number; account_name?: string; subject: string; priority: string; status: string; sla_due_at: string | null; resolved_at: string | null; created_at: string; }
export interface ForecastRow { period: string; pipeline_total: string | number; weighted_forecast: string | number; deal_count: number; }

export const crmApi = {
  async login(email: string, password: string) {
    const r = await req<never>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
    if (r.success && r.access_token) crmToken.set(r.access_token);
    return r;
  },
  me: () => req("/auth/me"),
  logout: () => { crmToken.clear(); },
  isAuthed: () => !!crmToken.get(),

  accounts: () => req<Account[]>("/accounts"),
  account: (id: number) => req<Account>(`/accounts/${id}`),
  createAccount: (b: Partial<Account>) => req<{ id: number }>("/accounts", { method: "POST", body: JSON.stringify(b) }),
  contacts: (accountId: number) => req<Contact[]>(`/accounts/${accountId}/contacts`),
  createContact: (b: { account_id: number; first_name: string; last_name: string; email: string; title?: string }) => req("/contacts", { method: "POST", body: JSON.stringify(b) }),
  portalUsers: (accountId: number) => req<PortalUser[]>(`/accounts/${accountId}/portal-users`),
  provisionPortal: (b: { contact_id: number; role: string }) => req<{ portalUserId: number; activation: { token: string; url: string } }>("/portal-users", { method: "POST", body: JSON.stringify(b) }),
  revokePortal: (id: number) => req(`/portal-users/${id}/revoke`, { method: "POST" }),

  opportunities: (accountId?: number) => req<Opportunity[]>(`/opportunities${accountId ? `?account_id=${accountId}` : ""}`),
  createOpportunity: (b: { account_id: number; name: string; amount: number; expected_close: string }) => req("/opportunities", { method: "POST", body: JSON.stringify(b) }),
  setStage: (id: number, stage: string, lost_reason?: string) => req(`/opportunities/${id}/stage`, { method: "PATCH", body: JSON.stringify({ stage, lost_reason }) }),
  forecast: () => req<ForecastRow[]>("/forecast"),

  tickets: () => req<Ticket[]>("/tickets"),
  resolveTicket: (id: number) => req(`/tickets/${id}/resolve`, { method: "POST" }),

  leads: () => req<Lead[]>("/leads") as Promise<CrmResult<Lead[]> & { mqlThreshold?: number }>,
  createLead: (b: { email: string; first_name?: string; company_name?: string; source?: string; signals?: Record<string, boolean> }) => req<{ id: number; score: number; status: string }>("/leads", { method: "POST", body: JSON.stringify(b) }),
  setLeadStatus: (id: number, status: string, reason?: string) => req(`/leads/${id}/status`, { method: "PATCH", body: JSON.stringify({ status, reason }) }),
  convertLead: (id: number, b: { amount?: number; expected_close?: string }) => req<{ accountId: number; opportunityId: number }>(`/leads/${id}/convert`, { method: "POST", body: JSON.stringify(b) }),

  quotes: (opportunityId: number) => req<Quote[]>(`/quotes?opportunity_id=${opportunityId}`),
  createQuote: (b: { opportunity_id: number; line_items: { name: string; qty: number; unit_price: number }[]; discount_pct: number }) => req<{ id: number; status: string; needsApproval: boolean }>("/quotes", { method: "POST", body: JSON.stringify(b) }),
  approveQuote: (id: number) => req(`/quotes/${id}/approve`, { method: "POST" }),
  sendQuote: (id: number) => req(`/quotes/${id}/send`, { method: "POST" }),
};

export interface Lead { id: number; email: string; first_name: string | null; company_name: string | null; source: string; score: number; status: string; owner_id: number | null; converted_account_id: number | null; created_at: string; }
export interface Quote { id: number; opportunity_id: number; account_id: number; version: number; line_items: unknown; subtotal: string | number; discount_pct: string | number; total: string | number; status: string; approved_by: number | null; sent_at: string | null; created_by: number; }
