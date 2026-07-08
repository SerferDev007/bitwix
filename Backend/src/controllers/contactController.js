import { pool } from '../config/db.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/contact  — store a message from the website contact form.
export async function createContactMessage(req, res, next) {
  try {
    const { name, email, phone, subject, message } = req.body || {};

    // Basic validation — mirrors the "required" fields in the frontend form.
    const errors = {};
    if (!name || !name.trim()) errors.name = 'Name is required.';
    if (!email || !EMAIL_RE.test(email)) errors.email = 'A valid email is required.';
    if (!message || !message.trim()) errors.message = 'Message is required.';

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;

    const [result] = await pool.query(
      `INSERT INTO contact_messages (name, email, phone, subject, message, ip_address)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        name.trim().slice(0, 120),
        email.trim().slice(0, 180),
        phone?.trim().slice(0, 40) || null,
        subject?.trim().slice(0, 200) || null,
        message.trim(),
        ip,
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Thank you! Your message has been received. We'll get back to you soon.",
      id: result.insertId,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/contact  — list stored messages (simple admin/read endpoint).
export async function listContactMessages(req, res, next) {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const [rows] = await pool.query(
      'SELECT id, name, email, phone, subject, message, status, created_at FROM contact_messages ORDER BY created_at DESC LIMIT ?',
      [limit]
    );
    return res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    next(err);
  }
}
