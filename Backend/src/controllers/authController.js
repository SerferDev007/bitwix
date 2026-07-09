import { signToken, safeEqual } from '../middleware/auth.js';

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'bitwix123';

// POST /api/auth/login — verify credentials, issue a token.
export function login(req, res) {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password are required.' });
  }
  // Constant-time comparison for both fields.
  const ok = safeEqual(username, ADMIN_USERNAME) && safeEqual(password, ADMIN_PASSWORD);
  if (!ok) {
    return res.status(401).json({ success: false, message: 'Invalid username or password.' });
  }
  const token = signToken({ sub: username, role: 'admin' });
  res.json({ success: true, token, user: { username, role: 'admin' } });
}

// GET /api/auth/me — return the current admin (requires a valid token).
export function me(req, res) {
  res.json({ success: true, user: { username: req.admin.sub, role: req.admin.role } });
}
