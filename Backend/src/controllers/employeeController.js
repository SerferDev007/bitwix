import { pool } from '../config/db.js';
import { solveAssignment } from '../or/assignment.js';
import { projectMarkov, compareIntervention } from '../or/markov.js';

// mysql2 usually returns JSON columns already parsed; parse defensively.
function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Employee roster CRUD
// ---------------------------------------------------------------------------

export async function listEmployees(req, res, next) {
  try {
    const [rows] = await pool.query('SELECT * FROM employees ORDER BY created_at DESC, id DESC');
    const data = rows.map((r) => ({ ...r, skills: parseJson(r.skills, []) }));

    // Roster summary: counts by engagement state + fully-loaded utilization avg.
    const byState = { engaged: 0, at_risk: 0, departed: 0 };
    let utilSum = 0;
    let utilCount = 0;
    for (const e of data) {
      byState[e.engagement_state] = (byState[e.engagement_state] || 0) + 1;
      if (e.utilization != null) {
        utilSum += Number(e.utilization);
        utilCount++;
      }
    }
    res.json({
      success: true,
      count: data.length,
      summary: {
        byState,
        avgUtilization: utilCount ? Math.round((utilSum / utilCount) * 10) / 10 : null,
      },
      data,
    });
  } catch (err) {
    next(err);
  }
}

export async function createEmployee(req, res, next) {
  try {
    const { name, role, skills, monthly_salary, utilization, engagement_state } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, errors: { name: 'Name is required.' } });
    }
    const state = ['engaged', 'at_risk', 'departed'].includes(engagement_state)
      ? engagement_state
      : 'engaged';
    const [result] = await pool.query(
      `INSERT INTO employees (name, role, skills, monthly_salary, utilization, engagement_state)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        name.trim(),
        role?.trim() || null,
        JSON.stringify(Array.isArray(skills) ? skills : splitSkills(skills)),
        numOrNull(monthly_salary),
        numOrNull(utilization),
        state,
      ]
    );
    res.status(201).json({ success: true, data: { id: result.insertId } });
  } catch (err) {
    next(err);
  }
}

export async function updateEmployee(req, res, next) {
  try {
    const [[emp]] = await pool.query('SELECT id FROM employees WHERE id = ?', [req.params.id]);
    if (!emp) return res.status(404).json({ success: false, message: 'Employee not found.' });

    const map = {
      name: (v) => v?.trim(),
      role: (v) => v?.trim() || null,
      skills: (v) => JSON.stringify(Array.isArray(v) ? v : splitSkills(v)),
      monthly_salary: numOrNull,
      utilization: numOrNull,
      engagement_state: (v) => (['engaged', 'at_risk', 'departed'].includes(v) ? v : 'engaged'),
    };
    const updates = [];
    const values = [];
    for (const [key, transform] of Object.entries(map)) {
      if (key in (req.body || {})) {
        updates.push(`${key} = ?`);
        values.push(transform(req.body[key]));
      }
    }
    if (updates.length) {
      values.push(req.params.id);
      await pool.query(`UPDATE employees SET ${updates.join(', ')} WHERE id = ?`, values);
    }
    res.json({ success: true, message: 'Employee updated.' });
  } catch (err) {
    next(err);
  }
}

export async function deleteEmployee(req, res, next) {
  try {
    const [result] = await pool.query('DELETE FROM employees WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0)
      return res.status(404).json({ success: false, message: 'Employee not found.' });
    res.json({ success: true, message: 'Employee deleted.' });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Assignment problem (skill-based task allocation)
// ---------------------------------------------------------------------------

export async function listAssignmentScenarios(req, res, next) {
  try {
    const [rows] = await pool.query('SELECT * FROM assignment_scenarios ORDER BY created_at DESC, id DESC');
    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    next(err);
  }
}

// Compute the optimal assignment for a saved scenario.
export async function solveAssignmentScenario(req, res, next) {
  try {
    const [[row]] = await pool.query('SELECT * FROM assignment_scenarios WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ success: false, message: 'Scenario not found.' });

    const result = solveAssignment({
      agents: parseJson(row.agents, []),
      tasks: parseJson(row.tasks, []),
      cost: parseJson(row.cost_matrix, []),
      mode: row.mode,
    });
    res.json({
      success: true,
      data: {
        id: row.id,
        name: row.name,
        agents: parseJson(row.agents, []),
        tasks: parseJson(row.tasks, []),
        cost: parseJson(row.cost_matrix, []),
        mode: row.mode,
        result,
      },
    });
  } catch (err) {
    if (isModelError(err)) return res.status(422).json({ success: false, message: err.message });
    next(err);
  }
}

export async function createAssignmentScenario(req, res, next) {
  try {
    const { name, agents, tasks, cost, mode } = req.body || {};
    if (!name || !name.trim())
      return res.status(400).json({ success: false, errors: { name: 'Name is required.' } });

    // Validate by attempting a solve (throws on malformed input).
    solveAssignment({ agents, tasks, cost, mode: mode === 'max' ? 'max' : 'min' });

    const [result] = await pool.query(
      'INSERT INTO assignment_scenarios (name, agents, tasks, cost_matrix, mode) VALUES (?, ?, ?, ?, ?)',
      [name.trim(), JSON.stringify(agents), JSON.stringify(tasks), JSON.stringify(cost), mode === 'max' ? 'max' : 'min']
    );
    res.status(201).json({ success: true, data: { id: result.insertId } });
  } catch (err) {
    if (isModelError(err)) return res.status(422).json({ success: false, message: err.message });
    next(err);
  }
}

export async function deleteAssignmentScenario(req, res, next) {
  try {
    const [result] = await pool.query('DELETE FROM assignment_scenarios WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0)
      return res.status(404).json({ success: false, message: 'Scenario not found.' });
    res.json({ success: true, message: 'Scenario deleted.' });
  } catch (err) {
    next(err);
  }
}

// Ad-hoc solve without persisting (for the interactive UI).
export async function solveAssignmentAdhoc(req, res, next) {
  try {
    const { agents, tasks, cost, mode } = req.body || {};
    const result = solveAssignment({ agents, tasks, cost, mode: mode === 'max' ? 'max' : 'min' });
    res.json({ success: true, data: result });
  } catch (err) {
    if (isModelError(err)) return res.status(422).json({ success: false, message: err.message });
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Retention (Markov attrition)
// ---------------------------------------------------------------------------

export async function listRetentionScenarios(req, res, next) {
  try {
    const [rows] = await pool.query('SELECT * FROM retention_scenarios ORDER BY created_at DESC, id DESC');
    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    next(err);
  }
}

// Project a saved retention scenario forward; if it has an intervention matrix,
// also return the baseline-vs-intervention comparison.
export async function runRetentionScenario(req, res, next) {
  try {
    const [[row]] = await pool.query('SELECT * FROM retention_scenarios WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ success: false, message: 'Scenario not found.' });

    const states = parseJson(row.states, []);
    const transition = parseJson(row.transition_matrix, []);
    const intervention = parseJson(row.intervention_matrix, null);
    const horizon = req.query.horizon ? Number(req.query.horizon) : row.horizon;

    // Initial vector: use the scenario's stored vector, or derive live from the
    // employee roster counts when ?fromRoster=1 is passed.
    let initial = parseJson(row.initial_vector, []);
    if (req.query.fromRoster === '1') {
      initial = await rosterVector(states);
    }

    const projection = projectMarkov({ states, transition, initial, horizon });
    let comparison = null;
    if (intervention) {
      comparison = compareIntervention({ states, transition, intervention, initial, horizon });
    }
    res.json({
      success: true,
      data: { id: row.id, name: row.name, states, horizon, initial, projection, comparison },
    });
  } catch (err) {
    if (isModelError(err)) return res.status(422).json({ success: false, message: err.message });
    next(err);
  }
}

export async function createRetentionScenario(req, res, next) {
  try {
    const { name, states, transition_matrix, intervention_matrix, initial_vector, horizon } = req.body || {};
    if (!name || !name.trim())
      return res.status(400).json({ success: false, errors: { name: 'Name is required.' } });

    // Validate by projecting once.
    projectMarkov({
      states,
      transition: transition_matrix,
      initial: initial_vector,
      horizon: horizon || 6,
    });

    const [result] = await pool.query(
      `INSERT INTO retention_scenarios (name, states, transition_matrix, intervention_matrix, initial_vector, horizon)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        name.trim(),
        JSON.stringify(states),
        JSON.stringify(transition_matrix),
        intervention_matrix ? JSON.stringify(intervention_matrix) : null,
        JSON.stringify(initial_vector),
        Number(horizon) || 6,
      ]
    );
    res.status(201).json({ success: true, data: { id: result.insertId } });
  } catch (err) {
    if (isModelError(err)) return res.status(422).json({ success: false, message: err.message });
    next(err);
  }
}

export async function deleteRetentionScenario(req, res, next) {
  try {
    const [result] = await pool.query('DELETE FROM retention_scenarios WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0)
      return res.status(404).json({ success: false, message: 'Scenario not found.' });
    res.json({ success: true, message: 'Scenario deleted.' });
  } catch (err) {
    next(err);
  }
}

// Build an initial state vector from live roster counts, matched to state names.
async function rosterVector(states) {
  const [rows] = await pool.query(
    'SELECT engagement_state, COUNT(*) AS c FROM employees GROUP BY engagement_state'
  );
  const counts = Object.fromEntries(rows.map((r) => [r.engagement_state, Number(r.c)]));
  // Map state labels to roster buckets by a loose name match.
  return states.map((s) => {
    const key = /depart/i.test(s) ? 'departed' : /risk/i.test(s) ? 'at_risk' : 'engaged';
    return counts[key] || 0;
  });
}

function splitSkills(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  return `${v}`.split(',').map((s) => s.trim()).filter(Boolean);
}

function numOrNull(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function isModelError(err) {
  return (
    err.userFacing ||
    /required|matrix|state|sum to 1|probab|agent|task|non-numeric|match the number/i.test(err.message || '')
  );
}
