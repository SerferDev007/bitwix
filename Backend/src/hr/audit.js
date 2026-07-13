// Append-only audit logging (Section 9.2). Writes actor, role-at-the-time,
// action, entity, and before/after state. Pass a transaction connection to
// commit the audit row in the SAME transaction as the change it records.
export async function writeAudit(runner, entry) {
  const {
    actorId = null, actorRole = 'SYSTEM', action, entityType, entityId = null,
    before = null, after = null, ip = null, userAgent = null,
  } = entry;
  await runner.query(
    `INSERT INTO hr_audit_log
       (actor_id, actor_role, action, entity_type, entity_id, before_state, after_state, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      actorId, actorRole, action, entityType, entityId,
      before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null,
      ip, userAgent,
    ]
  );
}

// Convenience: derive audit context from an authenticated request.
export function auditCtx(req) {
  return {
    actorId: req.actor?.accountId ?? null,
    actorRole: req.actor?.role ?? 'SYSTEM',
    ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null,
    userAgent: req.headers['user-agent'] || null,
  };
}
