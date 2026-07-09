// Thin client for the Bitwix backend API.
// The base URL comes from VITE_API_URL (see Frontend/.env); it defaults to the
// origin-relative "/api", which the Vite dev server proxies to the backend and
// which also works in production when the app is served behind the same origin.
const API_BASE = import.meta.env.VITE_API_URL || "/api";

export interface ContactPayload {
  name: string;
  email: string;
  phone?: string;
  subject?: string;
  message: string;
}

export interface ApiResult<T = unknown> {
  success: boolean;
  message?: string;
  errors?: Record<string, string>;
  data?: T;
  id?: number;
}

// --- Admin auth token (stored in localStorage) ---
const TOKEN_KEY = "bitwix_admin_token";
export const authToken = {
  get: () => (typeof localStorage !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

async function request<T>(path: string, options: RequestInit = {}): Promise<ApiResult<T>> {
  const token = authToken.get();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });

  // A 401 on anything but the login call means the session expired or is
  // missing — drop the token and bounce to the login screen.
  if (res.status === 401 && path !== "/auth/login") {
    authToken.clear();
    if (typeof window !== "undefined" && window.location.pathname.startsWith("/admin") &&
        !window.location.pathname.startsWith("/admin/login")) {
      window.location.assign("/admin/login");
    }
  }

  let body: ApiResult<T>;
  try {
    body = await res.json();
  } catch {
    body = { success: false, message: "Unexpected server response." };
  }

  if (!res.ok) {
    // Surface the server-provided message where available.
    return { ...body, success: false };
  }
  return body;
}

export function submitContact(payload: ContactPayload) {
  return request("/contact", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ---------------------------------------------------------------------------
// Public site content (served from the DB; components fall back to static data)
// ---------------------------------------------------------------------------

export interface ServiceItem {
  id: number;
  title: string;
  description: string;
  icon: string | null;
  features: string[];
}

export interface TeamMemberItem {
  id: number;
  name: string;
  role: string;
  description: string | null;
  image_url: string | null;
  skills: string[];
  phone: string | null;
  email: string | null;
}

export const contentApi = {
  services: () => request<ServiceItem[]>("/services"),
  team: () => request<TeamMemberItem[]>("/team"),
};

// ---------------------------------------------------------------------------
// Admin authentication
// ---------------------------------------------------------------------------

export interface AuthUser {
  username: string;
  role: string;
}

export const authApi = {
  async login(username: string, password: string) {
    const res = await request<never>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    const token = (res as { token?: string }).token;
    if (res.success && token) authToken.set(token);
    return res as ApiResult & { token?: string; user?: AuthUser };
  },
  me: () => request<never>("/auth/me") as Promise<ApiResult & { user?: AuthUser }>,
  logout: () => authToken.clear(),
  isAuthenticated: () => !!authToken.get(),
};

// ---------------------------------------------------------------------------
// Project Management (CPM / PERT / EVM)
// ---------------------------------------------------------------------------

export interface Project {
  id: number;
  name: string;
  client_name: string | null;
  description: string | null;
  bac: string | number | null;
  start_date: string | null;
  deadline_days: number | null;
  status: "planning" | "active" | "on_hold" | "completed" | "cancelled";
  activity_count?: number;
  created_at?: string;
}

export interface Activity {
  id: number;
  code: string;
  name: string;
  o: number;
  m: number;
  p: number;
  predecessors: string[];
}

export interface ScheduleActivity {
  code: string;
  name: string;
  duration: number;
  es: number;
  ef: number;
  ls: number;
  lf: number;
  float: number;
  isCritical: boolean;
}

export interface Schedule {
  projectDuration: number;
  activities: ScheduleActivity[];
  criticalPath: string[];
  paths: { codes: string[]; length: number }[];
}

export interface PertResult {
  expectedProjectDuration: number;
  projectVariance: number;
  projectStdDev: number;
  criticalPath: string[];
  activities: {
    code: string;
    name: string;
    o: number;
    m: number;
    p: number;
    te: number;
    variance: number;
    isCritical: boolean;
  }[];
  target?: { targetDuration: number; z: number; probability: number };
}

export interface EvmComputed {
  id: number;
  status_date: string;
  note: string | null;
  inputs: { bac: number; pv: number; ev: number; ac: number };
  costVariance: number;
  scheduleVariance: number;
  cpi: number | null;
  spi: number | null;
  estimateAtCompletion: number | null;
  estimateToComplete: number | null;
  varianceAtCompletion: number | null;
  toCompletePerformanceIndex: number | null;
  percentComplete: number | null;
  status: { cost: string; schedule: string };
}

export const projectsApi = {
  list: () => request<Project[]>("/projects"),
  get: (id: number) => request<Project & { activities: Activity[]; snapshots: unknown[] }>(`/projects/${id}`),
  create: (body: Partial<Project>) =>
    request<Project>("/projects", { method: "POST", body: JSON.stringify(body) }),
  update: (id: number, body: Partial<Project>) =>
    request<Project>(`/projects/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  remove: (id: number) => request(`/projects/${id}`, { method: "DELETE" }),

  addActivity: (
    id: number,
    body: { code: string; name: string; optimistic: number; most_likely: number; pessimistic: number; predecessors: string[] }
  ) => request(`/projects/${id}/activities`, { method: "POST", body: JSON.stringify(body) }),
  updateActivity: (
    id: number,
    activityId: number,
    body: Record<string, unknown>
  ) => request(`/projects/${id}/activities/${activityId}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteActivity: (id: number, activityId: number) =>
    request(`/projects/${id}/activities/${activityId}`, { method: "DELETE" }),

  schedule: (id: number) => request<Schedule>(`/projects/${id}/schedule`),
  pert: (id: number, target?: number) =>
    request<PertResult>(`/projects/${id}/pert${target != null ? `?target=${target}` : ""}`),

  evm: (id: number) => request<{ bac: number | null; snapshots: EvmComputed[]; message?: string }>(`/projects/${id}/evm`),
  addEvm: (
    id: number,
    body: { status_date?: string; planned_value: number; earned_value: number; actual_cost: number; note?: string }
  ) => request(`/projects/${id}/evm`, { method: "POST", body: JSON.stringify(body) }),
  deleteEvm: (id: number, snapshotId: number) =>
    request(`/projects/${id}/evm/${snapshotId}`, { method: "DELETE" }),
};

// ---------------------------------------------------------------------------
// Employee Management (Assignment problem / Markov attrition)
// ---------------------------------------------------------------------------

export interface Employee {
  id: number;
  name: string;
  role: string | null;
  skills: string[];
  monthly_salary: string | number | null;
  utilization: string | number | null;
  engagement_state: "engaged" | "at_risk" | "departed";
}

export interface RosterSummary {
  byState: { engaged: number; at_risk: number; departed: number };
  avgUtilization: number | null;
}

export interface AssignmentResult {
  mode: "min" | "max";
  assignments: { agent: string; task: string | null; cost: number | null }[];
  totalCost: number;
  greedyTotalCost: number;
  savingsVsGreedy: number;
}

export interface AssignmentScenario {
  id: number;
  name: string;
  agents: string[];
  tasks: string[];
  cost: number[][];
  mode: "min" | "max";
  result: AssignmentResult;
}

export interface MarkovSnapshot {
  period: number;
  counts: number[];
  byState: Record<string, number>;
  total: number;
}

export interface MarkovProjection {
  states: string[];
  horizon: number;
  departedIndex: number;
  timeline: MarkovSnapshot[];
  summary: { startTotalActive: number; cumulativeDepartures: number | null; finalState: number[] };
}

export interface RetentionRun {
  id: number;
  name: string;
  states: string[];
  horizon: number;
  initial: number[];
  projection: MarkovProjection;
  comparison: null | {
    baseline: MarkovProjection;
    intervention: MarkovProjection;
    departuresAvoided: number | null;
    departedState: string | null;
  };
}

function j(v: unknown) {
  // Parse JSON columns that may arrive as strings from the API.
  if (typeof v === "string") {
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  }
  return v;
}

export const employeesApi = {
  list: () => request<Employee[]>("/employees").then((r) => ({ ...r, summary: (r as unknown as { summary?: RosterSummary }).summary })),
  create: (body: Partial<Employee> & { skills?: string[] | string }) =>
    request("/employees", { method: "POST", body: JSON.stringify(body) }),
  update: (id: number, body: Record<string, unknown>) =>
    request(`/employees/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  remove: (id: number) => request(`/employees/${id}`, { method: "DELETE" }),

  assignments: () =>
    request<{ id: number; name: string; mode: string }[]>("/employees/assignments"),
  assignment: (id: number) => request<AssignmentScenario>(`/employees/assignments/${id}`),
  solveAdhoc: (body: { agents: string[]; tasks: string[]; cost: number[][]; mode?: "min" | "max" }) =>
    request<AssignmentResult>("/employees/assignments/solve", { method: "POST", body: JSON.stringify(body) }),
  createAssignment: (body: { name: string; agents: string[]; tasks: string[]; cost: number[][]; mode?: "min" | "max" }) =>
    request("/employees/assignments", { method: "POST", body: JSON.stringify(body) }),
  deleteAssignment: (id: number) => request(`/employees/assignments/${id}`, { method: "DELETE" }),

  retentions: () => request<{ id: number; name: string }[]>("/employees/retention"),
  retention: (id: number, opts?: { horizon?: number; fromRoster?: boolean }) => {
    const p = new URLSearchParams();
    if (opts?.horizon) p.set("horizon", String(opts.horizon));
    if (opts?.fromRoster) p.set("fromRoster", "1");
    const qs = p.toString();
    return request<RetentionRun>(`/employees/retention/${id}${qs ? `?${qs}` : ""}`);
  },
};

// re-exported helper for components that receive raw JSON-column values
export const parseJsonColumn = j;

// ---------------------------------------------------------------------------
// Financial Management (LP allocation / NPV / break-even)
// ---------------------------------------------------------------------------

export interface LpResult {
  sense: "max" | "min";
  objectiveValue: number;
  solution: { label: string; value: number }[];
  constraints: { label: string; used: number; rhs: number; slack: number; binding: boolean; shadowPrice: number }[];
  note: string;
}

export interface InvestmentRanked {
  id: number;
  name: string;
  initialInvestment: number;
  rate: number;
  perPeriod: { period: number; cashFlow: number; presentValue: number }[];
  pvOfInflows: number;
  npv: number;
  profitabilityIndex: number | null;
  rank: number;
}

export interface BreakEven {
  id?: number;
  name?: string;
  fixedCost: number;
  price: number;
  variableCost: number;
  contributionMargin: number;
  periodsPerYear: number;
  breakEvenUnits: number;
  breakEvenUnitsCeil: number;
}

export const financialApi = {
  lpList: () => request<{ id: number; name: string; sense: string }[]>("/financial/lp"),
  lp: (id: number) => request<{ id: number; name: string; objective: { coeffs: number[]; labels?: string[] }; constraints: { coeffs: number[]; op: string; rhs: number; label?: string }[]; sense: "max" | "min"; result: LpResult }>(`/financial/lp/${id}`),
  lpSolve: (body: { objective: { coeffs: number[]; labels?: string[] }; constraints: { coeffs: number[]; op: string; rhs: number; label?: string }[]; sense?: "max" | "min" }) =>
    request<LpResult>("/financial/lp/solve", { method: "POST", body: JSON.stringify(body) }),

  investments: () => request<InvestmentRanked[]>("/financial/investments"),
  addInvestment: (body: { name: string; initial_investment: number; cash_flows: number[]; discount_rate: number }) =>
    request("/financial/investments", { method: "POST", body: JSON.stringify(body) }),
  deleteInvestment: (id: number) => request(`/financial/investments/${id}`, { method: "DELETE" }),

  serviceLines: () => request<BreakEven[]>("/financial/service-lines"),
  addServiceLine: (body: { name: string; fixed_cost: number; price: number; variable_cost: number; periods_per_year: number }) =>
    request("/financial/service-lines", { method: "POST", body: JSON.stringify(body) }),
  deleteServiceLine: (id: number) => request(`/financial/service-lines/${id}`, { method: "DELETE" }),
  breakEven: (body: { fixedCost: number; price: number; variableCost: number; periodsPerYear?: number }) =>
    request<BreakEven>("/financial/break-even", { method: "POST", body: JSON.stringify(body) }),
};

// ---------------------------------------------------------------------------
// Client Management (M/M/c queuing / CLV)
// ---------------------------------------------------------------------------

export interface ClientRow {
  id: number;
  name: string;
  annualMargin: number;
  retentionRate: number;
  discountRate: number;
  strategicScore: number;
  notes: string | null;
  clv: number;
  rank: number;
  tier: "strategic" | "managed" | "efficient";
}

export interface Portfolio {
  clients: ClientRow[];
  totalClv: number;
  clvByTier: { strategic: number; managed: number; efficient: number };
}

export interface QueueMetrics {
  arrivalRate: number;
  serviceRate: number;
  servers: number;
  offeredLoad: number;
  utilization: number;
  stable: boolean;
  probabilityWait?: number;
  avgWaitInQueue?: number;
  avgTimeInSystem?: number;
  avgNumberInQueue?: number;
  avgNumberInSystem?: number;
  minServersForStability?: number;
  message?: string;
}

export interface QueueAnalysis {
  id: number;
  name: string;
  arrivalRate: number;
  serviceRate: number;
  currentServers: number;
  targetWaitProbability: number | null;
  current: QueueMetrics;
  recommendedServers: number | null;
  options: QueueMetrics[];
}

export const clientsApi = {
  list: () => request<Portfolio>("/clients"),
  create: (body: Partial<ClientRow> & { annual_margin?: number; retention_rate?: number; discount_rate?: number; strategic_score?: number }) =>
    request("/clients", { method: "POST", body: JSON.stringify(body) }),
  remove: (id: number) => request(`/clients/${id}`, { method: "DELETE" }),
  clv: (body: { annualMargin: number; retentionRate: number; discountRate: number }) =>
    request<{ clv: number; lifetimeMultiplier: number }>("/clients/clv", { method: "POST", body: JSON.stringify(body) }),

  queues: () => request<{ id: number; name: string }[]>("/clients/queues"),
  queue: (id: number) => request<QueueAnalysis>(`/clients/queues/${id}`),
  analyzeQueue: (body: { arrivalRate: number; serviceRate: number; servers: number; maxProbabilityWait?: number }) =>
    request<{ single: QueueMetrics; recommendedServers: number | null; options: QueueMetrics[] }>("/clients/queues/analyze", { method: "POST", body: JSON.stringify(body) }),
};
