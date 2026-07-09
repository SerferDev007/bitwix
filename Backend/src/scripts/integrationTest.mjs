// HTTP-level integration test for the Project Management analytics endpoints,
// backed by an in-memory fake DB seeded with the paper's Feature Delivery
// project. Verifies the controller -> OR engine data flow without needing MySQL.

// --- In-memory data (mirrors the initDb seed) ---
const project = {
  id: 1,
  name: 'Feature Delivery',
  client_name: 'Enterprise Client',
  description: 'demo',
  bac: 200000,
  start_date: null,
  deadline_days: 27,
  status: 'active',
  created_at: '2026-01-01',
};
const activities = [
  { id: 1, project_id: 1, code: 'A', name: 'Requirements', optimistic: 2, most_likely: 4, pessimistic: 6, sort_order: 1 },
  { id: 2, project_id: 1, code: 'B', name: 'Design', optimistic: 4, most_likely: 6, pessimistic: 8, sort_order: 2 },
  { id: 3, project_id: 1, code: 'C', name: 'Backend development', optimistic: 5, most_likely: 8, pessimistic: 11, sort_order: 3 },
  { id: 4, project_id: 1, code: 'D', name: 'Frontend development', optimistic: 3, most_likely: 5, pessimistic: 7, sort_order: 4 },
  { id: 5, project_id: 1, code: 'E', name: 'Integration', optimistic: 2, most_likely: 4, pessimistic: 6, sort_order: 5 },
  { id: 6, project_id: 1, code: 'F', name: 'Testing & release', optimistic: 1, most_likely: 3, pessimistic: 5, sort_order: 6 },
];
// dependencies: activity_id -> predecessor_id
const deps = [
  { activity_id: 2, predecessor_id: 1 },
  { activity_id: 3, predecessor_id: 2 },
  { activity_id: 4, predecessor_id: 2 },
  { activity_id: 5, predecessor_id: 3 },
  { activity_id: 5, predecessor_id: 4 },
  { activity_id: 6, predecessor_id: 5 },
];
const snapshots = [
  { id: 1, project_id: 1, status_date: '2026-01-15', planned_value: 100000, earned_value: 80000, actual_cost: 95000, note: 'checkpoint' },
];

// --- Employee module fixtures (paper Examples 3.1 and 3.3) ---
const employees = [
  { id: 1, name: 'Ava', role: 'Backend', skills: '["Auth"]', monthly_salary: 90000, utilization: 82, engagement_state: 'engaged', created_at: '2026-01-01' },
  { id: 2, name: 'Cara', role: 'Data', skills: '["Reporting"]', monthly_salary: 80000, utilization: 71, engagement_state: 'at_risk', created_at: '2026-01-01' },
];
const assignmentScenario = {
  id: 1,
  name: 'Module allocation',
  agents: JSON.stringify(['Ava', 'Ben', 'Cara']),
  tasks: JSON.stringify(['Auth', 'Payments', 'Reporting']),
  cost_matrix: JSON.stringify([[9, 11, 14], [6, 15, 13], [12, 13, 8]]),
  mode: 'min',
};
const retentionScenario = {
  id: 1,
  name: 'Engagement attrition',
  states: JSON.stringify(['Engaged', 'At-Risk', 'Departed']),
  transition_matrix: JSON.stringify([[0.9, 0.08, 0.02], [0.3, 0.55, 0.15], [0, 0, 1]]),
  intervention_matrix: JSON.stringify([[0.9, 0.08, 0.02], [0.45, 0.45, 0.1], [0, 0, 1]]),
  initial_vector: JSON.stringify([100, 0, 0]),
  horizon: 6,
};

// --- Financial + Client module fixtures (paper Examples 4.x, 5.x) ---
const lpScenario = {
  id: 1,
  name: 'Capacity allocation',
  objective: JSON.stringify({ coeffs: [8, 12], labels: ['Client', 'Product'] }),
  constraints: JSON.stringify([
    { coeffs: [40, 60], op: '<=', rhs: 2400, label: 'Engineering-hours' },
    { coeffs: [2, 5], op: '<=', rhs: 180, label: 'Cash ($k)' },
  ]),
  sense: 'max',
};
const investments = [
  { id: 1, name: 'Product A', initial_investment: 200000, cash_flows: JSON.stringify([90000, 90000, 90000]), discount_rate: 0.12 },
  { id: 2, name: 'Product B', initial_investment: 200000, cash_flows: JSON.stringify([70000, 110000, 120000]), discount_rate: 0.12 },
];
const serviceLines = [
  { id: 1, name: 'Managed Support', fixed_cost: 240000, price: 2000, variable_cost: 800, periods_per_year: 12 },
];
const clients = [
  { id: 1, name: 'Northwind', annual_margin: 40000, retention_rate: 0.9, discount_rate: 0.1, strategic_score: 5, notes: null, created_at: '2026-01-01' },
  { id: 2, name: 'Tailspin', annual_margin: 5000, retention_rate: 0.7, discount_rate: 0.1, strategic_score: 1, notes: null, created_at: '2026-01-01' },
];
const queueScenario = { id: 1, name: 'Support desk', arrival_rate: 18, service_rate: 8, servers: 3, target_wait_prob: 0.25 };

// --- Minimal fake pool.query that pattern-matches the controller's SQL ---
globalThis.__FAKE_POOL__ = {
  async query(sql, params = []) {
    const s = sql.replace(/\s+/g, ' ').trim();

    if (/^SELECT \* FROM projects WHERE id = \?/.test(s)) {
      return [project.id === Number(params[0]) ? [project] : []];
    }
    if (/FROM projects p ORDER BY/.test(s)) {
      return [[{ ...project, activity_count: activities.length }]];
    }
    if (/FROM project_activities WHERE project_id = \? ORDER BY/.test(s)) {
      return [activities.filter((a) => a.project_id === Number(params[0]))];
    }
    if (/FROM activity_dependencies d/.test(s)) {
      const rows = deps.map((d) => ({
        activity_id: d.activity_id,
        predecessor_code: activities.find((a) => a.id === d.predecessor_id).code,
      }));
      return [rows];
    }
    if (/FROM evm_snapshots WHERE project_id = \?/.test(s)) {
      return [snapshots.filter((x) => x.project_id === Number(params[0]))];
    }

    // Employee module
    if (/FROM employees ORDER BY/.test(s)) return [employees];
    if (/FROM employees GROUP BY/.test(s)) {
      return [[{ engagement_state: 'engaged', c: 1 }, { engagement_state: 'at_risk', c: 1 }]];
    }
    if (/FROM assignment_scenarios WHERE id = \?/.test(s)) {
      return [Number(params[0]) === 1 ? [assignmentScenario] : []];
    }
    if (/FROM assignment_scenarios ORDER BY/.test(s)) return [[assignmentScenario]];
    if (/FROM retention_scenarios WHERE id = \?/.test(s)) {
      return [Number(params[0]) === 1 ? [retentionScenario] : []];
    }
    if (/FROM retention_scenarios ORDER BY/.test(s)) return [[retentionScenario]];

    // Financial module
    if (/FROM lp_scenarios WHERE id = \?/.test(s)) return [Number(params[0]) === 1 ? [lpScenario] : []];
    if (/FROM lp_scenarios ORDER BY/.test(s)) return [[lpScenario]];
    if (/FROM investments ORDER BY/.test(s)) return [investments];
    if (/FROM service_lines ORDER BY/.test(s)) return [serviceLines];

    // Client module
    if (/FROM clients ORDER BY/.test(s)) return [clients];
    if (/FROM queue_scenarios WHERE id = \?/.test(s)) return [Number(params[0]) === 1 ? [queueScenario] : []];
    if (/FROM queue_scenarios ORDER BY/.test(s)) return [[queueScenario]];

    return [[]];
  },
  async getConnection() {
    return { async query() { return [[]]; }, async beginTransaction() {}, async commit() {}, async rollback() {}, release() {} };
  },
};

const express = (await import('express')).default;
const { default: routes } = await import('../routes/index.js');

const app = express();
app.use(express.json());
app.use('/api', routes);
const server = app.listen(5098);
const base = 'http://localhost:5098/api';

let failures = 0;
const approx = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? '✅' : '❌'} ${name}${!cond && extra ? ' — ' + extra : ''}`);
  if (!cond) failures++;
};

try {
  let r;
  let j;

  // --- Auth: protected routes require a token now ---
  const rawFetch = globalThis.fetch;
  // Unauthenticated access to a protected route must be rejected.
  r = await rawFetch(`${base}/projects`);
  check('GET /projects without token -> 401', r.status === 401, `got ${r.status}`);

  // Wrong credentials rejected.
  r = await rawFetch(`${base}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'wrong' }),
  });
  check('POST /auth/login wrong password -> 401', r.status === 401, `got ${r.status}`);

  // Correct credentials return a token.
  r = await rawFetch(`${base}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'bitwix123' }),
  });
  j = await r.json();
  const token = j.token;
  check('POST /auth/login correct -> token issued', r.ok && typeof token === 'string' && token.split('.').length === 3);

  // From here on, transparently attach the token to same-server requests.
  globalThis.fetch = (url, opts = {}) => {
    if (typeof url === 'string' && url.startsWith(base)) {
      opts = { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${token}` } };
    }
    return rawFetch(url, opts);
  };

  // /me confirms the token identity.
  r = await fetch(`${base}/auth/me`);
  j = await r.json();
  check('GET /auth/me -> admin identity', r.ok && j.user?.username === 'admin', JSON.stringify(j.user));

  r = await fetch(`${base}/projects`);
  j = await r.json();
  check('GET /projects lists the seeded project', r.ok && j.data?.[0]?.name === 'Feature Delivery');

  r = await fetch(`${base}/projects/1/schedule`);
  j = await r.json();
  check('GET /schedule -> 25-day project duration', j.data?.projectDuration === 25, `got ${j.data?.projectDuration}`);
  check('GET /schedule -> critical path A,B,C,E,F', j.data?.criticalPath?.join(',') === 'A,B,C,E,F', j.data?.criticalPath?.join(','));
  const d = j.data?.activities?.find((a) => a.code === 'D');
  check('GET /schedule -> D has 3 days float, not critical', d?.float === 3 && d?.isCritical === false);

  r = await fetch(`${base}/projects/1/pert?target=27`);
  j = await r.json();
  check('GET /pert -> expected duration 25', approx(j.data?.expectedProjectDuration, 25), `got ${j.data?.expectedProjectDuration}`);
  check('GET /pert -> P(<=27) ~ 0.88', approx(j.data?.target?.probability, 0.88, 0.01), `got ${j.data?.target?.probability}`);

  r = await fetch(`${base}/projects/1/pert`); // no target -> uses deadline_days=27
  j = await r.json();
  check('GET /pert (default target=deadline) -> P ~ 0.88', approx(j.data?.target?.probability, 0.88, 0.01), `got ${j.data?.target?.probability}`);

  r = await fetch(`${base}/projects/1/evm`);
  j = await r.json();
  const snap = j.data?.snapshots?.[0];
  check('GET /evm -> CPI 0.84', approx(snap?.cpi, 0.84, 0.005), `got ${snap?.cpi}`);
  check('GET /evm -> EAC 237500', approx(snap?.estimateAtCompletion, 237500, 1), `got ${snap?.estimateAtCompletion}`);
  check('GET /evm -> flagged over budget & behind schedule', snap?.status?.cost === 'over_budget' && snap?.status?.schedule === 'behind_schedule');

  r = await fetch(`${base}/projects/999/schedule`);
  check('GET /schedule for missing project -> 404', r.status === 404);

  // --- Employee module ---
  r = await fetch(`${base}/employees`);
  j = await r.json();
  check('GET /employees -> roster + state summary', r.ok && j.summary?.byState?.at_risk === 1, JSON.stringify(j.summary));

  r = await fetch(`${base}/employees/assignments/1`);
  j = await r.json();
  check('GET /employees/assignments/1 -> optimal total 25', j.data?.result?.totalCost === 25, `got ${j.data?.result?.totalCost}`);
  const picks = Object.fromEntries((j.data?.result?.assignments || []).map((a) => [a.agent, a.task]));
  check('Assignment: Ben->Auth, Ava->Payments, Cara->Reporting',
    picks.Ben === 'Auth' && picks.Ava === 'Payments' && picks.Cara === 'Reporting', JSON.stringify(picks));

  r = await fetch(`${base}/employees/assignments/solve`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agents: ['P', 'Q'], tasks: ['T1', 'T2'], cost: [[1, 9], [9, 1]] }),
  });
  j = await r.json();
  check('POST /assignments/solve -> ad-hoc optimal total 2', j.data?.totalCost === 2, `got ${j.data?.totalCost}`);

  r = await fetch(`${base}/employees/retention/1`);
  j = await r.json();
  check('GET /employees/retention/1 -> month1 [90,8,2]',
    JSON.stringify(j.data?.projection?.timeline?.[1]?.counts) === '[90,8,2]',
    JSON.stringify(j.data?.projection?.timeline?.[1]?.counts));
  check('GET /retention -> intervention avoids departures',
    j.data?.comparison?.departuresAvoided > 0, `got ${j.data?.comparison?.departuresAvoided}`);

  r = await fetch(`${base}/employees/retention/1?fromRoster=1`);
  j = await r.json();
  check('GET /retention?fromRoster=1 -> initial from roster [1,1,0]',
    JSON.stringify(j.data?.initial) === '[1,1,0]', JSON.stringify(j.data?.initial));

  // --- Financial module ---
  r = await fetch(`${base}/financial/lp/1`);
  j = await r.json();
  check('GET /financial/lp/1 -> objective 480', approx(j.data?.result?.objectiveValue, 480, 0.01), `got ${j.data?.result?.objectiveValue}`);
  check('GET /financial/lp/1 -> hours constraint binding', j.data?.result?.constraints?.find((c) => c.label === 'Engineering-hours')?.binding === true);

  r = await fetch(`${base}/financial/investments`);
  j = await r.json();
  check('GET /financial/investments -> B ranked #1', j.data?.[0]?.name === 'Product B', j.data?.[0]?.name);
  check('GET /financial/investments -> A npv ~16164', approx(j.data?.find((x) => x.name === 'Product A')?.npv, 16164, 5));

  r = await fetch(`${base}/financial/service-lines`);
  j = await r.json();
  check('GET /financial/service-lines -> break-even 17', j.data?.[0]?.breakEvenUnitsCeil === 17, `got ${j.data?.[0]?.breakEvenUnitsCeil}`);

  r = await fetch(`${base}/financial/lp/solve`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ objective: { coeffs: [3, 2] }, constraints: [{ coeffs: [1, 1], op: '<=', rhs: 4 }, { coeffs: [1, 0], op: '<=', rhs: 2 }], sense: 'max' }),
  });
  j = await r.json();
  check('POST /financial/lp/solve -> ad-hoc objective 10', approx(j.data?.objectiveValue, 10, 0.01), `got ${j.data?.objectiveValue}`);

  // --- Client module ---
  r = await fetch(`${base}/clients`);
  j = await r.json();
  check('GET /clients -> Northwind CLV 180000', approx(j.data?.clients?.find((c) => c.name === 'Northwind')?.clv, 180000, 1));
  check('GET /clients -> top client is strategic tier', j.data?.clients?.[0]?.tier === 'strategic', j.data?.clients?.[0]?.tier);

  r = await fetch(`${base}/clients/queues/1`);
  j = await r.json();
  check('GET /clients/queues/1 -> c=3 P(wait) ~0.57', approx(j.data?.current?.probabilityWait, 0.57, 0.01), `got ${j.data?.current?.probabilityWait}`);
  check('GET /clients/queues/1 -> recommends 4 servers', j.data?.recommendedServers === 4, `got ${j.data?.recommendedServers}`);

  r = await fetch(`${base}/clients/clv`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ annualMargin: 40000, retentionRate: 0.85, discountRate: 0.1 }),
  });
  j = await r.json();
  check('POST /clients/clv -> 136000', approx(j.data?.clv, 136000, 1), `got ${j.data?.clv}`);
} catch (e) {
  console.error('Integration test threw:', e);
  failures++;
} finally {
  server.close();
  console.log(failures === 0 ? '\n🎯 All integration checks passed.' : `\n❌ ${failures} failed.`);
  process.exit(failures === 0 ? 0 : 1);
}
