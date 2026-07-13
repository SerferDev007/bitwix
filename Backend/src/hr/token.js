// Short-lived HR access tokens (Section 5.4). HS256 JWT carrying identity +
// role + token_version — NOT the permission list (permissions are re-read from
// the DB on every request so a revoked role takes effect immediately). The
// `ver` claim is matched against the account's token_version for instant
// revocation on role change / logout / termination.
import crypto from 'crypto';

const SECRET = process.env.HR_AUTH_SECRET || process.env.AUTH_SECRET || 'dev-insecure-hr-secret-change-me';
const ACCESS_TTL = 15 * 60; // 15 minutes

const b64url = (input) => Buffer.from(input).toString('base64url');

export function signAccessToken({ accountId, employeeId, role, tokenVersion }, ttl = ACCESS_TTL) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    sub: accountId,
    eid: employeeId,
    rol: role,
    ver: tokenVersion,
    iat: now,
    exp: now + ttl,
  }));
  const sig = crypto.createHmac('sha256', SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

export function verifyAccessToken(token) {
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
