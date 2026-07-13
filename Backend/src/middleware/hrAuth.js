// HR authorization middleware — the single point where the three layers of
// Section 4.1 are enforced. Used as authorize('leave.approve.team').
import { pool } from '../config/db.js';
import { verifyAccessToken } from '../hr/token.js';
import { roleHasPermission, scopeFilter } from '../hr/rbac.js';

export function authorize(requiredPermission) {
  return async (req, res, next) => {
    try {
      // Verify signature + expiry.
      const header = req.headers.authorization || '';
      const token = header.startsWith('Bearer ') ? header.slice(7) : null;
      const claims = verifyAccessToken(token);
      if (!claims) return res.status(401).json({ success: false, message: 'Invalid or expired token' });

      // Re-load the account from the DB — never trust the claim for authority.
      const [[account]] = await pool.query(
        'SELECT a.*, r.name AS role_name FROM hr_accounts a JOIN roles r ON r.id = a.role_id WHERE a.id = ?',
        [claims.sub]
      );
      if (!account || account.status !== 'ACTIVE') {
        return res.status(403).json({ success: false, message: 'Account not active' });
      }

      // Revocation check (token_version) — instant on role change / logout / exit.
      if (account.token_version !== claims.ver) {
        return res.status(401).json({ success: false, message: 'Token revoked' });
      }

      // Employment status gate (BR-02).
      const [[emp]] = await pool.query('SELECT id, hr_status, manager_id FROM employees WHERE id = ?', [account.employee_id]);
      if (!emp || emp.hr_status !== 'active') {
        return res.status(403).json({ success: false, message: 'Employment not active' });
      }

      // Vertical check: does the role hold the permission?
      if (requiredPermission && !roleHasPermission(account.role_name, requiredPermission)) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }

      // Attach identity + horizontal scope for the data layer.
      req.actor = {
        accountId: account.id,
        employeeId: account.employee_id,
        role: account.role_name,
      };
      req.scope = scopeFilter(req.actor);
      next();
    } catch (err) {
      next(err);
    }
  };
}

// For endpoints that only require a valid session (no specific permission).
export const authenticated = () => authorize(null);
