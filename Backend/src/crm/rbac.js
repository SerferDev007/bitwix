// Dual-plane authorization — the CRM's defining model (paper Sections 4 & 5).
// INTERNAL plane: staff, scoped by ownership/territory/assignment (advisory).
// EXTERNAL plane: client portal users, bound to exactly ONE account_id that is
// a property of the identity itself and applied UNCONDITIONALLY (absolute).
// The two planes share code paths but never share rules.

export const INTERNAL_ROLES = [
  'SUPER_ADMIN', 'SALES_MANAGER', 'SALES_REP', 'MARKETING_MANAGER',
  'MARKETING_EXEC', 'ACCOUNT_MANAGER', 'SUPPORT_AGENT',
];
export const EXTERNAL_ROLES = ['CLIENT_ADMIN', 'CLIENT_USER', 'CLIENT_FINANCE'];

// Table 6 — internal permissions. Scoped cells (Owned/Territory/Assigned) mean
// "held but bounded by the scope filter"; here we record only whether held.
export const INTERNAL_MATRIX = {
  SUPER_ADMIN: new Set([
    'account.create', 'account.read.all', 'account.update',
    'portal.user.invite', 'portal.user.revoke', 'portal.request.approve',
    'lead.read', 'lead.convert', 'opportunity.manage', 'quote.create',
    'contract.manage', 'invoice.read', 'campaign.create', 'campaign.send',
    'segment.build', 'ticket.read', 'ticket.resolve', 'health.read',
    'forecast.read', 'audit.read', 'system.config',
    // NOTE: NOT discount.approve (SoD), NOT consent.override (granted to nobody)
  ]),
  SALES_MANAGER: new Set([
    'account.create', 'account.read.all', 'account.update',
    'portal.user.invite', 'portal.user.revoke', 'portal.request.approve',
    'lead.read', 'lead.convert', 'opportunity.manage', 'quote.create',
    'discount.approve', 'contract.manage', 'invoice.read',
    'ticket.read', 'health.read', 'forecast.read',
  ]),
  SALES_REP: new Set([
    'account.create', 'account.read.all', 'account.update',
    'portal.user.invite', 'portal.user.revoke', 'portal.request.approve',
    'lead.read', 'lead.convert', 'opportunity.manage', 'quote.create',
    'invoice.read', 'ticket.read', 'health.read', 'forecast.read',
  ]),
  MARKETING_MANAGER: new Set([
    'account.create', 'account.read.all', 'portal.user.invite',
    'portal.request.approve', 'lead.read', 'campaign.create', 'campaign.send',
    'segment.build',
  ]),
  MARKETING_EXEC: new Set([
    'account.create', 'account.read.all', 'portal.user.invite', 'lead.read',
    'campaign.create', 'campaign.send', 'segment.build',
  ]),
  ACCOUNT_MANAGER: new Set([
    'account.create', 'account.read.all', 'account.update',
    'portal.user.invite', 'portal.user.revoke', 'portal.request.approve',
    'opportunity.manage', 'quote.create', 'contract.manage', 'invoice.read',
    'ticket.read', 'health.read',
  ]),
  SUPPORT_AGENT: new Set([
    'account.read.all', 'ticket.read', 'ticket.resolve',
  ]),
};

// Table 7 — external permissions. Every entry is implicitly bounded by
// "...where account_id = my account_id" (enforced by the terminal scope below).
export const EXTERNAL_MATRIX = {
  CLIENT_ADMIN: new Set([
    'account.read.self', 'portal.user.request', 'ticket.create', 'ticket.read.self',
    'ticket.read.account', 'project.status.read', 'document.read.shared',
    'invoice.read', 'contract.read', 'consent.manage.self',
  ]),
  CLIENT_USER: new Set([
    'account.read.self', 'ticket.create', 'ticket.read.self',
    'project.status.read', 'document.read.shared', 'consent.manage.self',
  ]),
  CLIENT_FINANCE: new Set([
    'account.read.self', 'document.read.shared', 'invoice.read', 'consent.manage.self',
  ]),
};

export function internalCan(role, permission) {
  return INTERNAL_MATRIX[role]?.has(permission) ?? false;
}
export function externalCan(role, permission) {
  return EXTERNAL_MATRIX[role]?.has(permission) ?? false;
}

// Section 4.3, Layer 2 — the mandatory scope predicate. The EXTERNAL branch
// RETURNS a terminal tenant predicate; it is never merged with caller input,
// because a merge could be widened back out by a caller-supplied OR clause.
export function scopeFilter(actor) {
  if (actor.plane === 'EXTERNAL') {
    return { kind: 'tenant', accountId: actor.accountId }; // IMMUTABLE, absolute
  }
  switch (actor.role) {
    case 'SUPER_ADMIN':
    case 'MARKETING_MANAGER':
    case 'MARKETING_EXEC':
      return { kind: 'all' };
    case 'SALES_MANAGER':
      return { kind: 'territory', territories: actor.territories || [] };
    case 'SALES_REP':
      return { kind: 'owner', userId: actor.userId };
    case 'ACCOUNT_MANAGER':
      return { kind: 'assigned', userId: actor.userId };
    case 'SUPPORT_AGENT':
      return { kind: 'assigned_accounts', accounts: actor.assignedAccounts || [] };
    default:
      return { kind: 'none' }; // deny by default
  }
}

// Turn a scope descriptor into a MySQL predicate against an accounts-like table.
// For the external plane the predicate is ALWAYS `account_id = ?` bound to the
// session's account — the tenant boundary.
export function scopeToSql(scope, cols = {}) {
  const idCol = cols.idCol || 'id';
  const acctCol = cols.acctCol || 'account_id';
  const ownerCol = cols.ownerCol || 'owner_id';
  const amCol = cols.accountManagerCol || 'account_manager_id';
  const terrCol = cols.territoryCol || 'territory_id';
  switch (scope.kind) {
    case 'tenant':
      return { sql: `${acctCol} = ?`, params: [scope.accountId] };
    case 'all':
      return { sql: '1=1', params: [] };
    case 'owner':
      return { sql: `${ownerCol} = ?`, params: [scope.userId] };
    case 'assigned':
      return { sql: `${amCol} = ?`, params: [scope.userId] };
    case 'territory':
      if (!scope.territories.length) return { sql: '1=0', params: [] };
      return { sql: `${terrCol} IN (${scope.territories.map(() => '?').join(',')})`, params: [...scope.territories] };
    case 'assigned_accounts':
      if (!scope.accounts.length) return { sql: '1=0', params: [] };
      return { sql: `${idCol} IN (${scope.accounts.map(() => '?').join(',')})`, params: [...scope.accounts] };
    default:
      return { sql: '1=0', params: [] }; // none → no rows
  }
}

// Fields the portal must NEVER see (Section 7.4, Table 10 hard exclusion).
export const PORTAL_HIDDEN_FIELDS = ['health_score', 'owner_id', 'account_manager_id', 'lost_reason', 'internal_notes'];

export function stripInternalFields(record) {
  const out = { ...record };
  for (const f of PORTAL_HIDDEN_FIELDS) delete out[f];
  return out;
}
