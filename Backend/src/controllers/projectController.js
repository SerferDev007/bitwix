import { pool } from '../config/db.js';
import { computeCPM } from '../or/cpm.js';
import { computePERT, expectedDuration } from '../or/pert.js';
import { computeEVM } from '../or/evm.js';

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------

// Load all activities of a project together with their predecessor codes,
// shaped for the OR engine.
async function loadActivities(projectId) {
  const [rows] = await pool.query(
    `SELECT id, code, name, optimistic, most_likely, pessimistic, sort_order
       FROM project_activities
      WHERE project_id = ?
      ORDER BY sort_order ASC, id ASC`,
    [projectId]
  );
  if (rows.length === 0) return [];

  const [deps] = await pool.query(
    `SELECT d.activity_id, p.code AS predecessor_code
       FROM activity_dependencies d
       JOIN project_activities a ON a.id = d.activity_id
       JOIN project_activities p ON p.id = d.predecessor_id
      WHERE a.project_id = ?`,
    [projectId]
  );
  const predsByActivity = new Map();
  for (const d of deps) {
    if (!predsByActivity.has(d.activity_id)) predsByActivity.set(d.activity_id, []);
    predsByActivity.get(d.activity_id).push(d.predecessor_code);
  }

  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    o: Number(r.optimistic),
    m: Number(r.most_likely),
    p: Number(r.pessimistic),
    predecessors: predsByActivity.get(r.id) || [],
  }));
}

// Engine-ready CPM activities (deterministic duration = expected duration).
function toCpmInput(activities) {
  return activities.map((a) => ({
    code: a.code,
    name: a.name,
    duration: expectedDuration(a.o, a.m, a.p),
    predecessors: a.predecessors,
  }));
}

async function findProject(projectId) {
  const [rows] = await pool.query('SELECT * FROM projects WHERE id = ?', [projectId]);
  return rows[0] || null;
}

// ---------------------------------------------------------------------------
// Projects CRUD
// ---------------------------------------------------------------------------

export async function listProjects(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT p.*,
              (SELECT COUNT(*) FROM project_activities a WHERE a.project_id = p.id) AS activity_count
         FROM projects p
        ORDER BY p.created_at DESC`
    );
    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    next(err);
  }
}

export async function getProject(req, res, next) {
  try {
    const project = await findProject(req.params.id);
    if (!project) return res.status(404).json({ success: false, message: 'Project not found.' });

    const activities = await loadActivities(project.id);
    const [snapshots] = await pool.query(
      'SELECT * FROM evm_snapshots WHERE project_id = ? ORDER BY status_date DESC, id DESC',
      [project.id]
    );
    res.json({ success: true, data: { ...project, activities, snapshots } });
  } catch (err) {
    next(err);
  }
}

export async function createProject(req, res, next) {
  try {
    const { name, client_name, description, bac, start_date, deadline_days, status } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, errors: { name: 'Project name is required.' } });
    }
    const [result] = await pool.query(
      `INSERT INTO projects (name, client_name, description, bac, start_date, deadline_days, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        name.trim(),
        client_name?.trim() || null,
        description?.trim() || null,
        bac != null && bac !== '' ? Number(bac) : null,
        start_date || null,
        deadline_days != null && deadline_days !== '' ? Number(deadline_days) : null,
        status || 'planning',
      ]
    );
    const project = await findProject(result.insertId);
    res.status(201).json({ success: true, data: project });
  } catch (err) {
    next(err);
  }
}

export async function updateProject(req, res, next) {
  try {
    const project = await findProject(req.params.id);
    if (!project) return res.status(404).json({ success: false, message: 'Project not found.' });

    const fields = ['name', 'client_name', 'description', 'bac', 'start_date', 'deadline_days', 'status'];
    const updates = [];
    const values = [];
    for (const f of fields) {
      if (f in (req.body || {})) {
        updates.push(`${f} = ?`);
        const v = req.body[f];
        values.push(v === '' ? null : v);
      }
    }
    if (updates.length) {
      values.push(project.id);
      await pool.query(`UPDATE projects SET ${updates.join(', ')} WHERE id = ?`, values);
    }
    res.json({ success: true, data: await findProject(project.id) });
  } catch (err) {
    next(err);
  }
}

export async function deleteProject(req, res, next) {
  try {
    const [result] = await pool.query('DELETE FROM projects WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0)
      return res.status(404).json({ success: false, message: 'Project not found.' });
    res.json({ success: true, message: 'Project deleted.' });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------------

export async function addActivity(req, res, next) {
  const conn = await pool.getConnection();
  try {
    const project = await findProject(req.params.id);
    if (!project) {
      conn.release();
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }

    const { code, name, optimistic, most_likely, pessimistic, predecessors } = req.body || {};
    const errors = validateActivity({ code, name, optimistic, most_likely, pessimistic });
    if (Object.keys(errors).length) {
      conn.release();
      return res.status(400).json({ success: false, errors });
    }

    await conn.beginTransaction();

    const [[{ maxOrder }]] = await conn.query(
      'SELECT COALESCE(MAX(sort_order), 0) AS maxOrder FROM project_activities WHERE project_id = ?',
      [project.id]
    );
    const [result] = await conn.query(
      `INSERT INTO project_activities (project_id, code, name, optimistic, most_likely, pessimistic, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [project.id, code.trim(), name.trim(), Number(optimistic), Number(most_likely), Number(pessimistic), maxOrder + 1]
    );

    await linkPredecessors(conn, project.id, result.insertId, predecessors || []);

    await conn.commit();
    conn.release();
    res.status(201).json({ success: true, data: { id: result.insertId } });
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'An activity with that code already exists.' });
    }
    next(err);
  }
}

export async function updateActivity(req, res, next) {
  const conn = await pool.getConnection();
  try {
    const { id: projectId, activityId } = req.params;
    const [[activity]] = await conn.query(
      'SELECT * FROM project_activities WHERE id = ? AND project_id = ?',
      [activityId, projectId]
    );
    if (!activity) {
      conn.release();
      return res.status(404).json({ success: false, message: 'Activity not found.' });
    }

    await conn.beginTransaction();

    const map = {
      code: 'code',
      name: 'name',
      optimistic: 'optimistic',
      most_likely: 'most_likely',
      pessimistic: 'pessimistic',
    };
    const updates = [];
    const values = [];
    for (const [key, col] of Object.entries(map)) {
      if (key in (req.body || {})) {
        updates.push(`${col} = ?`);
        values.push(req.body[key]);
      }
    }
    if (updates.length) {
      values.push(activityId);
      await conn.query(`UPDATE project_activities SET ${updates.join(', ')} WHERE id = ?`, values);
    }

    if ('predecessors' in (req.body || {})) {
      await conn.query('DELETE FROM activity_dependencies WHERE activity_id = ?', [activityId]);
      await linkPredecessors(conn, Number(projectId), Number(activityId), req.body.predecessors || []);
    }

    await conn.commit();
    conn.release();
    res.json({ success: true, message: 'Activity updated.' });
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'An activity with that code already exists.' });
    }
    next(err);
  }
}

export async function deleteActivity(req, res, next) {
  try {
    const [result] = await pool.query(
      'DELETE FROM project_activities WHERE id = ? AND project_id = ?',
      [req.params.activityId, req.params.id]
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ success: false, message: 'Activity not found.' });
    res.json({ success: true, message: 'Activity deleted.' });
  } catch (err) {
    next(err);
  }
}

function validateActivity({ code, name, optimistic, most_likely, pessimistic }) {
  const errors = {};
  if (!code || !`${code}`.trim()) errors.code = 'Code is required.';
  if (!name || !`${name}`.trim()) errors.name = 'Name is required.';
  const o = Number(optimistic);
  const m = Number(most_likely);
  const p = Number(pessimistic);
  if (![o, m, p].every(Number.isFinite)) {
    errors.estimates = 'Optimistic, most likely, and pessimistic must be numbers.';
  } else if (!(o <= m && m <= p)) {
    errors.estimates = 'Require optimistic ≤ most likely ≤ pessimistic.';
  } else if (o < 0) {
    errors.estimates = 'Durations cannot be negative.';
  }
  return errors;
}

// Resolve predecessor codes -> ids within the same project and insert edges.
async function linkPredecessors(conn, projectId, activityId, predecessorCodes) {
  const codes = [...new Set(predecessorCodes.map((c) => `${c}`.trim()).filter(Boolean))];
  if (!codes.length) return;

  const [rows] = await conn.query(
    'SELECT id, code FROM project_activities WHERE project_id = ? AND code IN (?)',
    [projectId, codes]
  );
  const idByCode = new Map(rows.map((r) => [r.code, r.id]));
  for (const code of codes) {
    const predId = idByCode.get(code);
    if (!predId) throw Object.assign(new Error(`Unknown predecessor code: ${code}`), { userFacing: true });
    if (predId === activityId) throw Object.assign(new Error('An activity cannot depend on itself.'), { userFacing: true });
    await conn.query(
      'INSERT IGNORE INTO activity_dependencies (activity_id, predecessor_id) VALUES (?, ?)',
      [activityId, predId]
    );
  }
}

// ---------------------------------------------------------------------------
// OR analytics endpoints
// ---------------------------------------------------------------------------

// GET /api/projects/:id/schedule  -> CPM (critical path, floats, schedule table)
export async function getSchedule(req, res, next) {
  try {
    const project = await findProject(req.params.id);
    if (!project) return res.status(404).json({ success: false, message: 'Project not found.' });

    const activities = await loadActivities(project.id);
    if (!activities.length) {
      return res.json({ success: true, data: { projectDuration: 0, activities: [], criticalPath: [], paths: [] } });
    }
    const cpm = computeCPM(toCpmInput(activities));
    res.json({ success: true, data: cpm });
  } catch (err) {
    if (isModelError(err)) return res.status(422).json({ success: false, message: err.message });
    next(err);
  }
}

// GET /api/projects/:id/pert?target=27  -> PERT expected duration, variance, P(<=target)
export async function getPert(req, res, next) {
  try {
    const project = await findProject(req.params.id);
    if (!project) return res.status(404).json({ success: false, message: 'Project not found.' });

    const activities = await loadActivities(project.id);
    if (!activities.length) {
      return res.json({ success: true, data: { expectedProjectDuration: 0, activities: [] } });
    }
    // Default target to the project's committed deadline if not supplied.
    const target =
      req.query.target != null && req.query.target !== ''
        ? Number(req.query.target)
        : project.deadline_days ?? null;

    const pert = computePERT(activities, target);
    res.json({ success: true, data: pert });
  } catch (err) {
    if (isModelError(err)) return res.status(422).json({ success: false, message: err.message });
    next(err);
  }
}

// ---------------------------------------------------------------------------
// EVM snapshots
// ---------------------------------------------------------------------------

// GET /api/projects/:id/evm  -> all snapshots with computed indices
export async function getEvm(req, res, next) {
  try {
    const project = await findProject(req.params.id);
    if (!project) return res.status(404).json({ success: false, message: 'Project not found.' });
    if (project.bac == null) {
      return res.json({ success: true, data: { bac: null, snapshots: [], message: 'Set a project budget (BAC) to compute EVM.' } });
    }

    const [snapshots] = await pool.query(
      'SELECT * FROM evm_snapshots WHERE project_id = ? ORDER BY status_date ASC, id ASC',
      [project.id]
    );
    const computed = snapshots.map((s) => ({
      id: s.id,
      status_date: s.status_date,
      note: s.note,
      ...computeEVM({
        bac: project.bac,
        pv: s.planned_value,
        ev: s.earned_value,
        ac: s.actual_cost,
      }),
    }));
    res.json({ success: true, data: { bac: Number(project.bac), snapshots: computed } });
  } catch (err) {
    if (isModelError(err)) return res.status(422).json({ success: false, message: err.message });
    next(err);
  }
}

// POST /api/projects/:id/evm  -> add a status snapshot
export async function addEvmSnapshot(req, res, next) {
  try {
    const project = await findProject(req.params.id);
    if (!project) return res.status(404).json({ success: false, message: 'Project not found.' });

    const { status_date, planned_value, earned_value, actual_cost, note } = req.body || {};
    const pv = Number(planned_value);
    const ev = Number(earned_value);
    const ac = Number(actual_cost);
    if (![pv, ev, ac].every((n) => Number.isFinite(n) && n >= 0)) {
      return res.status(400).json({
        success: false,
        errors: { values: 'Planned value, earned value, and actual cost must be non-negative numbers.' },
      });
    }

    const [result] = await pool.query(
      `INSERT INTO evm_snapshots (project_id, status_date, planned_value, earned_value, actual_cost, note)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [project.id, status_date || new Date().toISOString().slice(0, 10), pv, ev, ac, note?.trim() || null]
    );

    // Return the computed indices immediately (if a budget exists).
    const computed =
      project.bac != null ? computeEVM({ bac: project.bac, pv, ev, ac }) : null;
    res.status(201).json({ success: true, data: { id: result.insertId, computed } });
  } catch (err) {
    next(err);
  }
}

export async function deleteEvmSnapshot(req, res, next) {
  try {
    const [result] = await pool.query(
      'DELETE FROM evm_snapshots WHERE id = ? AND project_id = ?',
      [req.params.snapshotId, req.params.id]
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ success: false, message: 'Snapshot not found.' });
    res.json({ success: true, message: 'Snapshot deleted.' });
  } catch (err) {
    next(err);
  }
}

// Model-layer errors (bad network, cycles, unknown predecessors) map to 422.
function isModelError(err) {
  return (
    err.userFacing ||
    /cycle|predecessor|duration|acyclic|estimates|optimistic/i.test(err.message || '')
  );
}
