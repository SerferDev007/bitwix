// Client for the EXTERNAL client portal plane. Its own token/session, distinct
// from the OR-admin token and the CRM staff token. No endpoint here ever sends
// an account_id — the account is a property of the session, resolved server-side.
const API_BASE = import.meta.env.VITE_API_URL || "/api";
const TOKEN_KEY = "bitwix_portal_token";

export const portalToken = {
  get: () => (typeof localStorage !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export interface PortalResult<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  count?: number;
  access_token?: string;
  user?: { id: number; email: string; role: string; plane: string };
  actor?: { role: string; plane: string };
  account?: { id: number; name: string; segment: string | null; status: string; portal_tier: string };
  permissions?: string[];
}

async function req<T>(path: string, options: RequestInit = {}): Promise<PortalResult<T>> {
  const token = portalToken.get();
  const res = await fetch(`${API_BASE}/portal${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });
  if (res.status === 401 && !path.startsWith("/auth/")) {
    portalToken.clear();
    if (typeof window !== "undefined" && window.location.pathname.startsWith("/portal") && !window.location.pathname.startsWith("/portal/login") && !window.location.pathname.startsWith("/portal/activate")) {
      window.location.assign("/portal/login");
    }
  }
  let body: PortalResult<T>;
  try { body = await res.json(); } catch { body = { success: false, message: "Unexpected server response." }; }
  return res.ok ? body : { ...body, success: false };
}

export interface PortalTicket { id: number; subject: string; priority: string; status: string; sla_due_at: string | null; resolved_at: string | null; created_at: string; }
export interface PortalInvoice { id: number; number: string; amount: string | number; currency: string; status: string; issued_at: string; due_date: string | null; paid_at: string | null; }
export interface PortalConsent { channel: string; action: string; occurred_at: string; }

export const portalApi = {
  async login(email: string, password: string) {
    const r = await req<never>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
    if (r.success && r.access_token) portalToken.set(r.access_token);
    return r;
  },
  activate: (token: string, new_password: string) => req("/auth/activate", { method: "POST", body: JSON.stringify({ token, new_password }) }),
  me: () => req("/me"),
  logout: () => { portalToken.clear(); },
  isAuthed: () => !!portalToken.get(),

  tickets: () => req<PortalTicket[]>("/tickets"),
  createTicket: (b: { subject: string; body?: string; priority?: string }) => req("/tickets", { method: "POST", body: JSON.stringify(b) }),
  invoices: () => req<PortalInvoice[]>("/invoices"),
  getConsent: () => req<PortalConsent[]>("/consent"),
  setConsent: (channel: string, action: string) => req("/consent", { method: "PUT", body: JSON.stringify({ channel, action }) }),
  requestUser: (b: { first_name: string; last_name: string; email: string; role: string }) => req("/users/request", { method: "POST", body: JSON.stringify(b) }),
};
