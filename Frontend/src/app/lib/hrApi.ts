// Client for the Employee Management System (HR / EMS) plane. Uses its own
// token/session, distinct from the OR-admin, CRM and portal tokens — mirroring
// the backend's separate /api/hr route tree and RBAC model.
const API_BASE = import.meta.env.VITE_API_URL || "/api";
const TOKEN_KEY = "bitwix_hr_token";

export const hrToken = {
  get: () => (typeof localStorage !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export interface HrUser {
  id?: number;
  accountId?: number;
  email?: string;
  role: string;
  employeeId?: number;
}

export interface HrResult<T = unknown> {
  success: boolean;
  message?: string;
  errors?: Record<string, string>;
  data?: T;
  count?: number;
  access_token?: string;
  user?: HrUser;
  permissions?: string[];
  year?: number;
}

async function req<T>(path: string, options: RequestInit = {}): Promise<HrResult<T>> {
  const token = hrToken.get();
  const res = await fetch(`${API_BASE}/hr${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });
  if (res.status === 401 && path !== "/auth/login") {
    hrToken.clear();
    if (
      typeof window !== "undefined" &&
      window.location.pathname.startsWith("/hr") &&
      !window.location.pathname.startsWith("/hr/login") &&
      !window.location.pathname.startsWith("/hr/activate")
    ) {
      window.location.assign("/hr/login");
    }
  }
  let body: HrResult<T>;
  try { body = await res.json(); } catch { body = { success: false, message: "Unexpected server response." }; }
  return res.ok ? body : { ...body, success: false };
}

// --- Types ---
export interface Employee {
  id: number;
  name: string;
  role: string; // designation
  work_email: string;
  employee_code: string | null;
  manager_id: number | null;
  hr_status: string;
  monthly_salary: string | number | null; // field-filtered by the backend
  engagement_state: string;
  account_id: number | null;
  account_status: string | null;
  account_role: string | null; // RBAC role of the login account
}
export interface LeaveType { id: number; name: string; annual_quota: number; allow_negative: number | boolean; }
export interface LeaveBalance {
  leave_type_id: number; name: string; annual_quota: number;
  entitled: number; used: number; pending: number; available: number;
}
export interface LeaveRequest {
  id: number; employee_id: number; employee_name?: string;
  leave_type?: string; leave_type_id: number;
  start_date: string; end_date: string; days: number;
  reason: string | null; status: string;
  approver_id: number | null; decided_at: string | null; decision_note: string | null; created_at: string;
}
export interface AuditEntry {
  id: number; actor_id: number; actor_role: string; action: string;
  entity_type: string; entity_id: number; ip_address: string | null; created_at: string;
}
export interface Activation { token: string; expiresInHours?: number; url: string; }
export interface PayrollRun {
  id: number; label: string; status: string; gross_total: string | number;
  created_by: number; approved_by: number | null; je_ref: string | null; created_at: string; employees?: number;
}
export interface PayrollLine {
  employee_id: number; employee_name: string; cost_center: string;
  gross: string | number; tax: string | number; net: string | number; is_billable: number | boolean;
}

// Mirrors ROLES in Backend/src/hr/rbac.js.
export const HR_ROLES = ["SUPER_ADMIN", "HR_ADMIN", "HR_EXEC", "MANAGER", "EMPLOYEE"];

export const hrApi = {
  async login(email: string, password: string) {
    const r = await req<never>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
    if (r.success && r.access_token) hrToken.set(r.access_token);
    return r;
  },
  activate: (token: string, new_password: string) =>
    req("/auth/activate", { method: "POST", body: JSON.stringify({ token, new_password }) }),
  me: () => req("/auth/me"),
  logout: async () => { try { await req("/auth/logout", { method: "POST" }); } catch { /* ignore */ } hrToken.clear(); },
  isAuthed: () => !!hrToken.get(),

  employees: () => req<Employee[]>("/employees"),
  employee: (id: number) => req<Employee>(`/employees/${id}`),
  provisionEmployee: (b: {
    name: string; work_email: string; role?: string;
    manager_id?: number | null; employee_code?: string; designation?: string;
  }) => req<{ employeeId: number; accountId: number; activation: Activation }>("/employees", { method: "POST", body: JSON.stringify(b) }),
  deactivateEmployee: (id: number) => req(`/employees/${id}/deactivate`, { method: "POST" }),
  assignRole: (accountId: number, role: string) => req(`/accounts/${accountId}/role`, { method: "PUT", body: JSON.stringify({ role }) }),
  resetPassword: (accountId: number) => req<{ token: string }>(`/accounts/${accountId}/reset-password`, { method: "POST" }),

  leaveTypes: () => req<LeaveType[]>("/leave/types"),
  leaveBalance: () => req<LeaveBalance[]>("/leave/balance"),
  applyLeave: (b: { leave_type_id: number; start_date: string; end_date: string; reason?: string }) =>
    req<{ id: number; days: number; status: string }>("/leave/requests", { method: "POST", body: JSON.stringify(b) }),
  leaveRequests: () => req<LeaveRequest[]>("/leave/requests"),
  approveLeave: (id: number, note?: string) => req(`/leave/requests/${id}/approve`, { method: "POST", body: JSON.stringify({ note }) }),
  rejectLeave: (id: number, note?: string) => req(`/leave/requests/${id}/reject`, { method: "POST", body: JSON.stringify({ note }) }),

  audit: (limit = 100) => req<AuditEntry[]>(`/audit?limit=${limit}`),

  payrollRuns: () => req<PayrollRun[]>("/payroll/runs"),
  payrollRun: (id: number) => req<PayrollRun & { lines: PayrollLine[] }>(`/payroll/runs/${id}`),
  createPayrollRun: (label?: string) => req<{ id: number; status: string; employees: number; gross_total: string }>("/payroll/runs", { method: "POST", body: JSON.stringify({ label }) }),
  approvePayrollRun: (id: number) => req(`/payroll/runs/${id}/approve`, { method: "POST" }),
};
