import { pool } from '../config/db.js';
import { solveLP } from '../or/lp.js';
import { computeNPV, rankInvestments, computeBreakEven, loadedRate } from '../or/finance.js';

function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function isModelError(err) {
  return err.userFacing || /required|constraint|coefficient|rate|positive|unbounded|margin|number|supported/i.test(err.message || '');
}

// ---------------------------------------------------------------------------
// Linear programming (capacity / budget allocation)
// ---------------------------------------------------------------------------

export async function listLpScenarios(req, res, next) {
  try {
    const [rows] = await pool.query('SELECT id, name, sense, created_at FROM lp_scenarios ORDER BY created_at DESC, id DESC');
    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    next(err);
  }
}

export async function solveLpScenario(req, res, next) {
  try {
    const [[row]] = await pool.query('SELECT * FROM lp_scenarios WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ success: false, message: 'Scenario not found.' });
    const objective = parseJson(row.objective, {});
    const constraints = parseJson(row.constraints, []);
    const result = solveLP({ objective, constraints, sense: row.sense });
    res.json({ success: true, data: { id: row.id, name: row.name, objective, constraints, sense: row.sense, result } });
  } catch (err) {
    if (isModelError(err)) return res.status(422).json({ success: false, message: err.message });
    next(err);
  }
}

export async function solveLpAdhoc(req, res, next) {
  try {
    const { objective, constraints, sense } = req.body || {};
    const result = solveLP({ objective, constraints, sense: sense === 'min' ? 'min' : 'max' });
    res.json({ success: true, data: result });
  } catch (err) {
    if (isModelError(err)) return res.status(422).json({ success: false, message: err.message });
    next(err);
  }
}

export async function createLpScenario(req, res, next) {
  try {
    const { name, objective, constraints, sense } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ success: false, errors: { name: 'Name is required.' } });
    solveLP({ objective, constraints, sense: sense === 'min' ? 'min' : 'max' }); // validate
    const [r] = await pool.query(
      'INSERT INTO lp_scenarios (name, objective, constraints, sense) VALUES (?, ?, ?, ?)',
      [name.trim(), JSON.stringify(objective), JSON.stringify(constraints), sense === 'min' ? 'min' : 'max']
    );
    res.status(201).json({ success: true, data: { id: r.insertId } });
  } catch (err) {
    if (isModelError(err)) return res.status(422).json({ success: false, message: err.message });
    next(err);
  }
}

export async function deleteLpScenario(req, res, next) {
  try {
    const [r] = await pool.query('DELETE FROM lp_scenarios WHERE id = ?', [req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ success: false, message: 'Scenario not found.' });
    res.json({ success: true, message: 'Scenario deleted.' });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Investments (NPV ranking)
// ---------------------------------------------------------------------------

export async function listInvestments(req, res, next) {
  try {
    const [rows] = await pool.query('SELECT * FROM investments ORDER BY created_at DESC, id DESC');
    const candidates = rows.map((r) => ({
      id: r.id,
      name: r.name,
      initialInvestment: Number(r.initial_investment),
      cashFlows: parseJson(r.cash_flows, []).map(Number),
      rate: Number(r.discount_rate),
    }));
    const ranked = candidates.length ? rankInvestments(candidates) : [];
    res.json({ success: true, count: ranked.length, data: ranked });
  } catch (err) {
    if (isModelError(err)) return res.status(422).json({ success: false, message: err.message });
    next(err);
  }
}

export async function createInvestment(req, res, next) {
  try {
    const { name, initial_investment, cash_flows, discount_rate } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ success: false, errors: { name: 'Name is required.' } });
    const flows = Array.isArray(cash_flows) ? cash_flows.map(Number) : [];
    computeNPV(Number(initial_investment), flows, Number(discount_rate ?? 0.1)); // validate
    const [r] = await pool.query(
      'INSERT INTO investments (name, initial_investment, cash_flows, discount_rate) VALUES (?, ?, ?, ?)',
      [name.trim(), Number(initial_investment) || 0, JSON.stringify(flows), Number(discount_rate ?? 0.1)]
    );
    res.status(201).json({ success: true, data: { id: r.insertId } });
  } catch (err) {
    if (isModelError(err)) return res.status(422).json({ success: false, message: err.message });
    next(err);
  }
}

export async function deleteInvestment(req, res, next) {
  try {
    const [r] = await pool.query('DELETE FROM investments WHERE id = ?', [req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ success: false, message: 'Investment not found.' });
    res.json({ success: true, message: 'Investment deleted.' });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Service lines (break-even / CVP) + loaded rate calculator
// ---------------------------------------------------------------------------

export async function listServiceLines(req, res, next) {
  try {
    const [rows] = await pool.query('SELECT * FROM service_lines ORDER BY created_at DESC, id DESC');
    const data = rows.map((r) => ({
      id: r.id,
      name: r.name,
      ...computeBreakEven({
        fixedCost: r.fixed_cost,
        price: r.price,
        variableCost: r.variable_cost,
        periodsPerYear: r.periods_per_year,
      }),
    }));
    res.json({ success: true, count: data.length, data });
  } catch (err) {
    if (isModelError(err)) return res.status(422).json({ success: false, message: err.message });
    next(err);
  }
}

export async function createServiceLine(req, res, next) {
  try {
    const { name, fixed_cost, price, variable_cost, periods_per_year } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ success: false, errors: { name: 'Name is required.' } });
    computeBreakEven({ fixedCost: fixed_cost, price, variableCost: variable_cost, periodsPerYear: periods_per_year || 1 });
    const [r] = await pool.query(
      'INSERT INTO service_lines (name, fixed_cost, price, variable_cost, periods_per_year) VALUES (?, ?, ?, ?, ?)',
      [name.trim(), Number(fixed_cost), Number(price), Number(variable_cost), Number(periods_per_year) || 1]
    );
    res.status(201).json({ success: true, data: { id: r.insertId } });
  } catch (err) {
    if (isModelError(err)) return res.status(422).json({ success: false, message: err.message });
    next(err);
  }
}

export async function deleteServiceLine(req, res, next) {
  try {
    const [r] = await pool.query('DELETE FROM service_lines WHERE id = ?', [req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ success: false, message: 'Service line not found.' });
    res.json({ success: true, message: 'Service line deleted.' });
  } catch (err) {
    next(err);
  }
}

// Ad-hoc break-even and loaded-rate calculators (no persistence).
export async function breakEvenAdhoc(req, res, next) {
  try {
    const { fixedCost, price, variableCost, periodsPerYear } = req.body || {};
    res.json({ success: true, data: computeBreakEven({ fixedCost, price, variableCost, periodsPerYear: periodsPerYear || 1 }) });
  } catch (err) {
    if (isModelError(err)) return res.status(422).json({ success: false, message: err.message });
    next(err);
  }
}

export async function loadedRateAdhoc(req, res, next) {
  try {
    const { salary, benefits, overhead, annualBillableHours } = req.body || {};
    res.json({ success: true, data: { loadedRate: loadedRate({ salary, benefits, overhead, annualBillableHours }) } });
  } catch (err) {
    if (isModelError(err)) return res.status(422).json({ success: false, message: err.message });
    next(err);
  }
}
