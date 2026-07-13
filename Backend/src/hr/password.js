// Password hashing with scrypt — a memory-hard KDF built into Node (no external
// dependency). The paper specifies Argon2id/bcrypt; scrypt is the same class of
// memory-hard function and is available without adding packages. Format:
//   scrypt$N$<saltHex>$<hashHex>
import crypto from 'crypto';

const N = 16384; // CPU/memory cost
const KEYLEN = 64;

export function hashPassword(plain) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(plain, salt, KEYLEN, { N });
  return `scrypt$${N}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(plain, stored) {
  if (!stored || typeof stored !== 'string') {
    // Constant-work path so timing doesn't reveal a missing hash (Section 5.3).
    crypto.scryptSync(plain, 'dummysalt', KEYLEN, { N });
    return false;
  }
  const [scheme, nStr, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt') return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(plain, salt, expected.length, { N: Number(nStr) });
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

// Section 5.2 — length-dominant policy. Minimum 12 chars. (A production system
// should also check the plaintext against a breached-password list via the
// Have I Been Pwned k-anonymity API; omitted here to keep the module offline.)
export function enforcePasswordPolicy(plain) {
  if (typeof plain !== 'string' || plain.length < 12) {
    throw Object.assign(new Error('Password must be at least 12 characters.'), { userFacing: true });
  }
  if (/^(.)\1+$/.test(plain)) {
    throw Object.assign(new Error('Password is too weak.'), { userFacing: true });
  }
  return true;
}

// Single-use invitation / reset tokens: random raw token, only its hash stored.
export function generateToken() {
  const raw = crypto.randomBytes(32).toString('base64url');
  return { raw, hash: sha256(raw) };
}

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
