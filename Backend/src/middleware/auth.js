// Minimal, dependency-free JWT (HS256) auth for the admin console.
// Uses Node's built-in crypto so there is nothing extra to install.
import crypto from 'crypto';

const SECRET = process.env.AUTH_SECRET || 'dev-insecure-secret-change-me';
const TOKEN_TTL_SECONDS = 60 * 60 * 8; // 8 hours

const b64url = (input) => Buffer.from(input).toString('base64url');

// Sign a payload into a compact HS256 JWT.
export function signToken(payload, ttlSeconds = TOKEN_TTL_SECONDS) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify({ ...payload, iat: now, exp: now + ttlSeconds }));
  const sig = crypto.createHmac('sha256', SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

// Verify signature + expiry. Returns the decoded payload or null.
export function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expected = crypto.createHmac('sha256', SECRET).update(`${header}.${body}`).digest('base64url');
  if (!safeEqual(sig, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// Express middleware: require a valid Bearer token.
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }
  req.admin = payload;
  next();
}

// Constant-time string comparison (avoids leaking match length via timing).
export function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
