import { pool } from '../../config/db.js';
import { verifyPassword, hashPassword, enforcePasswordPolicy, sha256 } from '../../hr/password.js';
import { signAccessToken } from '../../hr/token.js';
import { roleHasPermission, ROLE_MATRIX } from '../../hr/rbac.js';
import { writeAudit, auditCtx } from '../../hr/audit.js';

const MAX_FAILED = 5;
const LOCK_MINUTES = 30;

// POST /api/hr/auth/login  { email, password, totp? }
export async function login(req, res, next) {
  try {
    const { email, password } = req.body || {};
    const [[account]] = await pool.query(
      `SELECT a.*, r.name AS role_name, e.hr_status
         FROM hr_accounts a
         JOIN roles r ON r.id = a.role_id
         JOIN employees e ON e.id = a.employee_id
        WHERE a.email = ?`,
      [email || '']
    );

    // Constant-work verify even when the account is absent (no enumeration).
    const ok = verifyPassword(password || '', account?.password_hash || null);

    if (!account || !ok) {
      if (account) await pool.query('UPDATE hr_accounts SET failed_attempts = failed_attempts + 1 WHERE id = ?', [account.id]);
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Lockout (auto-clears after LOCK_MINUTES).
    if (account.locked_until && new Date(account.locked_until) > new Date()) {
      return res.status(423).json({ success: false, message: 'Account locked. Try again later.' });
    }
    if (account.failed_attempts >= MAX_FAILED) {
      await pool.query('UPDATE hr_accounts SET locked_until = DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE id = ?', [LOCK_MINUTES, account.id]);
      return res.status(423).json({ success: false, message: 'Account locked. Try again later.' });
    }

    // BR-02: both the account AND the employment must be active.
    if (account.status !== 'ACTIVE') return res.status(403).json({ success: false, message: 'Account not active' });
    if (account.hr_status !== 'active') return res.status(403).json({ success: false, message: 'Employment not active' });

    await pool.query('UPDATE hr_accounts SET failed_attempts = 0, locked_until = NULL, last_login_at = NOW() WHERE id = ?', [account.id]);

    const token = signAccessToken({
      accountId: account.id,
      employeeId: account.employee_id,
      role: account.role_name,
      tokenVersion: account.token_version,
    });
    res.json({
      success: true,
      access_token: token,
      user: { id: account.id, email: account.email, role: account.role_name, employeeId: account.employee_id },
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/hr/auth/activate  { token, new_password }
export async function activate(req, res, next) {
  const conn = await pool.getConnection();
  try {
    const { token, new_password } = req.body || {};
    if (!token) { conn.release(); return res.status(400).json({ success: false, message: 'Missing activation token' }); }

    const [[inv]] = await conn.query(
      `SELECT * FROM hr_invitations
        WHERE token_hash = ? AND purpose = 'ACTIVATION' AND used_at IS NULL AND expires_at > NOW()`,
      [sha256(token)]
    );
    if (!inv) { conn.release(); return res.status(400).json({ success: false, message: 'Invalid or expired activation link' }); }

    try {
      enforcePasswordPolicy(new_password);
    } catch (e) {
      conn.release();
      return res.status(422).json({ success: false, message: e.message });
    }

    await conn.beginTransaction();
    await conn.query(
      `UPDATE hr_accounts SET password_hash = ?, status = 'ACTIVE', must_change_password = FALSE WHERE id = ?`,
      [hashPassword(new_password), inv.account_id]
    );
    await conn.query('UPDATE hr_invitations SET used_at = NOW() WHERE id = ?', [inv.id]);
    await writeAudit(conn, { actorId: inv.account_id, actorRole: 'EMPLOYEE', action: 'ACCOUNT_ACTIVATED', entityType: 'hr_account', entityId: inv.account_id });
    await conn.commit();
    conn.release();
    res.json({ success: true, message: 'Account activated. You can now log in.' });
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    next(err);
  }
}

// POST /api/hr/auth/logout — bump token_version to invalidate all sessions.
export async function logout(req, res, next) {
  try {
    await pool.query('UPDATE hr_accounts SET token_version = token_version + 1 WHERE id = ?', [req.actor.accountId]);
    await writeAudit(pool, { ...auditCtx(req), action: 'LOGOUT', entityType: 'hr_account', entityId: req.actor.accountId });
    res.json({ success: true, message: 'Logged out.' });
  } catch (err) {
    next(err);
  }
}

// GET /api/hr/auth/me — identity + effective permissions for the UI.
export async function me(req, res) {
  res.json({
    success: true,
    user: req.actor,
    permissions: [...(ROLE_MATRIX[req.actor.role] || [])],
    can: (p) => roleHasPermission(req.actor.role, p),
  });
}
