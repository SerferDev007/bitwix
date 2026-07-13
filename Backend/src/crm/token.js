// Dual-plane access tokens (Section 5.4). Internal and external tokens are
// structurally different: the external token carries the account binding (`acc`)
// and plane='EXTERNAL'; the internal token carries NO account claim at all.
// A staff token must never be usable on the portal plane and vice versa — the
// `plane` claim is checked by each plane's middleware.
import crypto from 'crypto';

const SECRET = process.env.CRM_AUTH_SECRET || process.env.AUTH_SECRET || 'dev-insecure-crm-secret-change-me';
const TTL = 15 * 60;
const b64url = (i) => Buffer.from(i).toString('base64url');

function sign(payloadObj, ttl = TTL) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ ...payloadObj, iat: now, exp: now + ttl }));
  const sig = crypto.createHmac('sha256', SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

export function signInternalToken({ userId, role, tokenVersion }) {
  return sign({ sub: userId, plane: 'INTERNAL', rol: role, ver: tokenVersion });
}

export function signExternalToken({ portalUserId, accountId, role, tokenVersion }) {
  return sign({ sub: portalUserId, plane: 'EXTERNAL', acc: accountId, rol: role, ver: tokenVersion });
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  const expected = crypto.createHmac('sha256', SECRET).update(`${header}.${payload}`).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (claims.exp && claims.exp < Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch {
    return null;
  }
}
