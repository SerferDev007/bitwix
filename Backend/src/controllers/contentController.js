import { pool } from '../config/db.js';

// mysql2 returns JSON columns already parsed on most versions, but if the
// driver hands back a string we parse it defensively.
function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

// GET /api/services
export async function listServices(req, res, next) {
  try {
    const [rows] = await pool.query(
      'SELECT id, title, description, icon, features, sort_order FROM services WHERE is_active = TRUE ORDER BY sort_order ASC, id ASC'
    );
    const data = rows.map((r) => ({ ...r, features: parseJson(r.features, []) }));
    return res.json({ success: true, count: data.length, data });
  } catch (err) {
    next(err);
  }
}

// GET /api/team
export async function listTeamMembers(req, res, next) {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, role, description, image_url, skills, phone, email, sort_order FROM team_members WHERE is_active = TRUE ORDER BY sort_order ASC, id ASC'
    );
    const data = rows.map((r) => ({ ...r, skills: parseJson(r.skills, []) }));
    return res.json({ success: true, count: data.length, data });
  } catch (err) {
    next(err);
  }
}
