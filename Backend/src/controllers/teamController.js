import { pool } from '../config/db.js';
import { uploadObject, deleteByUrl, uploadsEnabled } from '../config/s3.js';

function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function splitSkills(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  return `${v}`.split(',').map((s) => s.trim()).filter(Boolean);
}

function serialize(row) {
  return { ...row, skills: parseJson(row.skills, []) };
}

// GET /api/team (public) — active team members for the website.
export async function listTeam(req, res, next) {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, role, description, image_url, skills, phone, email, sort_order FROM team_members WHERE is_active = TRUE ORDER BY sort_order ASC, id ASC'
    );
    res.json({ success: true, count: rows.length, data: rows.map(serialize) });
  } catch (err) {
    next(err);
  }
}

// GET /api/team/all (admin) — includes inactive.
export async function listAllTeam(req, res, next) {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM team_members ORDER BY sort_order ASC, id ASC'
    );
    res.json({ success: true, count: rows.length, uploadsEnabled, data: rows.map(serialize) });
  } catch (err) {
    next(err);
  }
}

export async function createTeamMember(req, res, next) {
  try {
    const { name, role, description, skills, phone, email, sort_order, is_active } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ success: false, errors: { name: 'Name is required.' } });
    if (!role || !role.trim()) return res.status(400).json({ success: false, errors: { role: 'Role is required.' } });

    const [[{ maxOrder }]] = await pool.query('SELECT COALESCE(MAX(sort_order),0) AS maxOrder FROM team_members');
    const [result] = await pool.query(
      `INSERT INTO team_members (name, role, description, image_url, skills, phone, email, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name.trim(),
        role.trim(),
        description?.trim() || null,
        null, // image uploaded separately
        JSON.stringify(splitSkills(skills)),
        phone?.trim() || null,
        email?.trim() || null,
        sort_order != null && sort_order !== '' ? Number(sort_order) : maxOrder + 1,
        is_active === false ? 0 : 1,
      ]
    );
    res.status(201).json({ success: true, data: { id: result.insertId } });
  } catch (err) {
    next(err);
  }
}

export async function updateTeamMember(req, res, next) {
  try {
    const [[member]] = await pool.query('SELECT id FROM team_members WHERE id = ?', [req.params.id]);
    if (!member) return res.status(404).json({ success: false, message: 'Team member not found.' });

    const map = {
      name: (v) => v?.trim(),
      role: (v) => v?.trim(),
      description: (v) => v?.trim() || null,
      skills: (v) => JSON.stringify(splitSkills(v)),
      phone: (v) => v?.trim() || null,
      email: (v) => v?.trim() || null,
      sort_order: (v) => (v === '' || v == null ? null : Number(v)),
      is_active: (v) => (v ? 1 : 0),
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
      await pool.query(`UPDATE team_members SET ${updates.join(', ')} WHERE id = ?`, values);
    }
    res.json({ success: true, message: 'Team member updated.' });
  } catch (err) {
    next(err);
  }
}

export async function deleteTeamMember(req, res, next) {
  try {
    const [[member]] = await pool.query('SELECT image_url FROM team_members WHERE id = ?', [req.params.id]);
    if (!member) return res.status(404).json({ success: false, message: 'Team member not found.' });
    await pool.query('DELETE FROM team_members WHERE id = ?', [req.params.id]);
    await deleteByUrl(member.image_url); // best-effort cleanup of the S3 photo
    res.json({ success: true, message: 'Team member deleted.' });
  } catch (err) {
    next(err);
  }
}

// POST /api/team/:id/photo (multipart, field "photo") — upload to S3, set image_url.
export async function uploadTeamPhoto(req, res, next) {
  try {
    if (!uploadsEnabled) {
      return res.status(503).json({ success: false, message: 'Photo uploads are not configured on the server (set MEDIA_BUCKET).' });
    }
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded (field name must be "photo").' });

    const [[member]] = await pool.query('SELECT id, image_url FROM team_members WHERE id = ?', [req.params.id]);
    if (!member) return res.status(404).json({ success: false, message: 'Team member not found.' });

    const ext = (req.file.originalname.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const key = `team/${member.id}-${Date.now()}.${ext}`;
    const url = await uploadObject(key, req.file.buffer, req.file.mimetype);

    await pool.query('UPDATE team_members SET image_url = ? WHERE id = ?', [url, member.id]);
    await deleteByUrl(member.image_url); // remove the previous photo

    res.json({ success: true, data: { image_url: url } });
  } catch (err) {
    if (err.userFacing) return res.status(422).json({ success: false, message: err.message });
    next(err);
  }
}

// DELETE /api/team/:id/photo — clear the photo (revert to initials avatar).
export async function deleteTeamPhoto(req, res, next) {
  try {
    const [[member]] = await pool.query('SELECT image_url FROM team_members WHERE id = ?', [req.params.id]);
    if (!member) return res.status(404).json({ success: false, message: 'Team member not found.' });
    await pool.query('UPDATE team_members SET image_url = NULL WHERE id = ?', [req.params.id]);
    await deleteByUrl(member.image_url);
    res.json({ success: true, message: 'Photo removed.' });
  } catch (err) {
    next(err);
  }
}
