// Two separate middleware chains — one per plane (Section 9.2). A staff token
// must never work on the portal, and vice versa; the `plane` claim is checked
// first. The portal middleware re-reads account_id from the DB (never the
// claim) and binds it as the immutable tenant scope.
import { pool } from '../config/db.js';
import { verifyToken } from '../crm/token.js';
import { internalCan, externalCan, scopeFilter } from '../crm/rbac.js';

function bearer(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

// INTERNAL plane.
export function internalAuth(requiredPermission) {
  return async (req, res, next) => {
    try {
      const claims = verifyToken(bearer(req));
      if (!claims) return res.status(401).json({ success: false, message: 'Invalid or expired token' });
      if (claims.plane !== 'INTERNAL') return res.status(403).json({ success: false, message: 'Forbidden' }); // portal token on internal plane

      const [[user]] = await pool.query('SELECT * FROM crm_users WHERE id = ?', [claims.sub]);
      if (!user || user.status !== 'ACTIVE') return res.status(403).json({ success: false, message: 'Account not active' });
      if (user.token_version !== claims.ver) return res.status(401).json({ success: false, message: 'Token revoked' });
      if (requiredPermission && !internalCan(user.role, requiredPermission)) return res.status(403).json({ success: false, message: 'Forbidden' });

      const territories = parseJson(user.territories, []);
      let assignedAccounts = [];
      if (user.role === 'SUPPORT_AGENT') {
        const [rows] = await pool.query('SELECT DISTINCT account_id FROM tickets WHERE assignee_id = ?', [user.id]);
        assignedAccounts = rows.map((r) => r.account_id);
      }
      req.actor = { plane: 'INTERNAL', userId: user.id, role: user.role, name: user.name, territories, assignedAccounts };
      req.scope = scopeFilter(req.actor);
      next();
    } catch (err) { next(err); }
  };
}

// EXTERNAL (portal) plane.
export function portalAuth(requiredPermission) {
  return async (req, res, next) => {
    try {
      const claims = verifyToken(bearer(req));
      if (!claims) return res.status(401).json({ success: false, message: 'Invalid or expired token' });
      if (claims.plane !== 'EXTERNAL') return res.status(403).json({ success: false, message: 'Forbidden' }); // staff token on portal plane

      const [[pu]] = await pool.query('SELECT * FROM crm_portal_users WHERE id = ?', [claims.sub]);
      if (!pu || pu.status !== 'ACTIVE') return res.status(403).json({ success: false, message: 'Access revoked' });
      if (pu.token_version !== claims.ver) return res.status(401).json({ success: false, message: 'Token revoked' });
      // The acc claim is a convenience; authority comes from the DB row.
      if (claims.acc !== pu.account_id) return res.status(401).json({ success: false, message: 'Token account mismatch' });

      const [[acct]] = await pool.query('SELECT status FROM accounts WHERE id = ?', [pu.account_id]);
      if (!acct || !['ACTIVE', 'PROSPECT'].includes(acct.status)) return res.status(403).json({ success: false, message: 'Account inactive' });

      if (requiredPermission && !externalCan(pu.role, requiredPermission)) return res.status(403).json({ success: false, message: 'Forbidden' });

      // Tenant scope bound from the session identity — absolute, immutable.
      req.actor = { plane: 'EXTERNAL', portalUserId: pu.id, accountId: pu.account_id, contactId: pu.contact_id, role: pu.role };
      req.scope = scopeFilter(req.actor);
      next();
    } catch (err) { next(err); }
  };
}

function parseJson(v, fb) {
  if (v == null) return fb;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return fb; }
}
