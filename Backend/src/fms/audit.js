// FMS audit — every privileged financial action is recorded (Section 10).
export async function writeFmsAudit(runner, actor, entry) {
  await runner.query(
    `INSERT INTO fms_audit_log (actor_id, actor_role, action, entity_type, entity_id, detail, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      actor?.id ?? null,
      actor?.role || 'SYSTEM',
      entry.action,
      entry.entityType,
      entry.entityId ?? null,
      entry.detail ? JSON.stringify(entry.detail) : null,
      entry.ip || null,
    ]
  );
}
