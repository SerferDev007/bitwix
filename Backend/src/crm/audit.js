// CRM audit — records privileged and cross-account actions, including the
// plane and the account context (Section 10).
export async function writeCrmAudit(runner, req, entry) {
  const actor = req.actor || {};
  await runner.query(
    `INSERT INTO crm_audit_log (actor_plane, actor_id, actor_role, account_id, action, entity_type, entity_id, detail, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      actor.plane || 'SYSTEM',
      actor.userId ?? actor.portalUserId ?? null,
      actor.role || 'SYSTEM',
      entry.accountId ?? actor.accountId ?? null,
      entry.action,
      entry.entityType,
      entry.entityId ?? null,
      entry.detail ? JSON.stringify(entry.detail) : null,
      req.headers?.['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null,
    ]
  );
}
