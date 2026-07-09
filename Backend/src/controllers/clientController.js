import { pool } from '../config/db.js';
import { analyzeQueue, recommendServers } from '../or/queue.js';
import { computeCLV, segmentPortfolio } from '../or/clv.js';

function isModelError(err) {
  return err.userFacing || /positive|integer|rate|margin|number|retention|discount|divergent/i.test(err.message || '');
}

// ---------------------------------------------------------------------------
// Clients (CLV + portfolio segmentation)
// ---------------------------------------------------------------------------

export async function listClients(req, res, next) {
  try {
    const [rows] = await pool.query('SELECT * FROM clients ORDER BY created_at DESC, id DESC');
    if (!rows.length) {
      return res.json({ success: true, count: 0, data: { clients: [], totalClv: 0, clvByTier: { strategic: 0, managed: 0, efficient: 0 } } });
    }
    const portfolio = segmentPortfolio(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        annualMargin: Number(r.annual_margin),
        retentionRate: Number(r.retention_rate),
        discountRate: Number(r.discount_rate),
        strategicScore: r.strategic_score,
        notes: r.notes,
      }))
    );
    res.json({ success: true, count: portfolio.clients.length, data: portfolio });
  } catch (err) {
    if (isModelError(err)) return res.status(422).json({ success: false, message: err.message });
    next(err);
  }
}

export async function createClient(req, res, next) {
  try {
    const { name, annual_margin, retention_rate, discount_rate, strategic_score, notes } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ success: false, errors: { name: 'Name is required.' } });
    // Validate CLV inputs.
    computeCLV({
      annualMargin: Number(annual_margin) || 0,
      retentionRate: Number(retention_rate ?? 0.85),
      discountRate: Number(discount_rate ?? 0.1),
    });
    const [r] = await pool.query(
      `INSERT INTO clients (name, annual_margin, retention_rate, discount_rate, strategic_score, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        name.trim(),
        Number(annual_margin) || 0,
        Number(retention_rate ?? 0.85),
        Number(discount_rate ?? 0.1),
        Math.min(5, Math.max(1, Number(strategic_score) || 3)),
        notes?.trim() || null,
      ]
    );
    res.status(201).json({ success: true, data: { id: r.insertId } });
  } catch (err) {
    if (isModelError(err)) return res.status(422).json({ success: false, message: err.message });
    next(err);
  }
}

export async function updateClient(req, res, next) {
  try {
    const [[c]] = await pool.query('SELECT id FROM clients WHERE id = ?', [req.params.id]);
    if (!c) return res.status(404).json({ success: false, message: 'Client not found.' });
    const cols = { name: 'name', annual_margin: 'annual_margin', retention_rate: 'retention_rate', discount_rate: 'discount_rate', strategic_score: 'strategic_score', notes: 'notes' };
    const updates = [];
    const values = [];
    for (const [key, col] of Object.entries(cols)) {
      if (key in (req.body || {})) {
        updates.push(`${col} = ?`);
        values.push(req.body[key]);
      }
    }
    if (updates.length) {
      values.push(req.params.id);
      await pool.query(`UPDATE clients SET ${updates.join(', ')} WHERE id = ?`, values);
    }
    res.json({ success: true, message: 'Client updated.' });
  } catch (err) {
    next(err);
  }
}

export async function deleteClient(req, res, next) {
  try {
    const [r] = await pool.query('DELETE FROM clients WHERE id = ?', [req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ success: false, message: 'Client not found.' });
    res.json({ success: true, message: 'Client deleted.' });
  } catch (err) {
    next(err);
  }
}

// Ad-hoc CLV calculator (retention leverage table).
export async function clvAdhoc(req, res, next) {
  try {
    const { annualMargin, retentionRate, discountRate } = req.body || {};
    res.json({ success: true, data: computeCLV({ annualMargin, retentionRate, discountRate }) });
  } catch (err) {
    if (isModelError(err)) return res.status(422).json({ success: false, message: err.message });
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Support desk (M/M/c queuing)
// ---------------------------------------------------------------------------

export async function listQueueScenarios(req, res, next) {
  try {
    const [rows] = await pool.query('SELECT * FROM queue_scenarios ORDER BY created_at DESC, id DESC');
    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    next(err);
  }
}

// Analyze a saved queue scenario across a range of staffing levels and give a
// recommendation against its SLA target.
export async function analyzeQueueScenario(req, res, next) {
  try {
    const [[row]] = await pool.query('SELECT * FROM queue_scenarios WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ success: false, message: 'Scenario not found.' });

    const lambda = Number(row.arrival_rate);
    const mu = Number(row.service_rate);
    const target = row.target_wait_prob != null ? Number(row.target_wait_prob) : null;

    const rec = recommendServers({ arrivalRate: lambda, serviceRate: mu, maxProbabilityWait: target ?? undefined });
    const current = analyzeQueue({ arrivalRate: lambda, serviceRate: mu, servers: Number(row.servers) });

    res.json({
      success: true,
      data: {
        id: row.id,
        name: row.name,
        arrivalRate: lambda,
        serviceRate: mu,
        currentServers: Number(row.servers),
        targetWaitProbability: target,
        current,
        recommendedServers: rec.recommended,
        options: rec.options,
      },
    });
  } catch (err) {
    if (isModelError(err)) return res.status(422).json({ success: false, message: err.message });
    next(err);
  }
}

export async function analyzeQueueAdhoc(req, res, next) {
  try {
    const { arrivalRate, serviceRate, servers, maxProbabilityWait } = req.body || {};
    const single = analyzeQueue({ arrivalRate, serviceRate, servers: Number(servers) });
    const rec = recommendServers({ arrivalRate, serviceRate, maxProbabilityWait });
    res.json({ success: true, data: { single, recommendedServers: rec.recommended, options: rec.options } });
  } catch (err) {
    if (isModelError(err)) return res.status(422).json({ success: false, message: err.message });
    next(err);
  }
}

export async function createQueueScenario(req, res, next) {
  try {
    const { name, arrival_rate, service_rate, servers, target_wait_prob } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ success: false, errors: { name: 'Name is required.' } });
    analyzeQueue({ arrivalRate: arrival_rate, serviceRate: service_rate, servers: Number(servers) || 1 }); // validate
    const [r] = await pool.query(
      'INSERT INTO queue_scenarios (name, arrival_rate, service_rate, servers, target_wait_prob) VALUES (?, ?, ?, ?, ?)',
      [name.trim(), Number(arrival_rate), Number(service_rate), Number(servers) || 1, target_wait_prob != null && target_wait_prob !== '' ? Number(target_wait_prob) : null]
    );
    res.status(201).json({ success: true, data: { id: r.insertId } });
  } catch (err) {
    if (isModelError(err)) return res.status(422).json({ success: false, message: err.message });
    next(err);
  }
}

export async function deleteQueueScenario(req, res, next) {
  try {
    const [r] = await pool.query('DELETE FROM queue_scenarios WHERE id = ?', [req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ success: false, message: 'Scenario not found.' });
    res.json({ success: true, message: 'Scenario deleted.' });
  } catch (err) {
    next(err);
  }
}
