// Role-Based Access Control — the authoritative permission model.
// Implements the paper's Table 4 (permission matrix), Section 4.3 (data
// scoping), and Section 8.3 (field-level rules). This module is the single
// source of truth from which the seed data AND the test suite are generated.

export const ROLES = ['SUPER_ADMIN', 'HR_ADMIN', 'HR_EXEC', 'MANAGER', 'EMPLOYEE'];

// Rank is informational (higher = more system authority); authority is decided
// by explicit permissions + scope, never by rank alone.
export const ROLE_RANK = { SUPER_ADMIN: 100, HR_ADMIN: 80, HR_EXEC: 60, MANAGER: 40, EMPLOYEE: 20 };

// Every permission code used in the system (resource.action).
export const PERMISSIONS = [
  'employee.create', 'employee.read.all', 'employee.read.team', 'employee.read.self',
  'employee.update.all', 'employee.update.self', 'employee.deactivate',
  'user.role.assign', 'user.password.reset',
  'attendance.mark.self', 'attendance.read.team', 'attendance.regularize',
  'leave.apply', 'leave.approve.team', 'leave.config',
  'payroll.structure.define', 'payroll.run', 'payroll.approve', 'payroll.read.all',
  'payslip.read.self',
  'appraisal.cycle.create', 'appraisal.submit.team', 'appraisal.read.self',
  'document.upload.any', 'document.read.self',
  'grievance.file', 'grievance.read.all',
  'report.generate.org', 'report.generate.team',
  'audit.read', 'system.config',
];

// The permission matrix (Table 4). A permission is granted to a role iff it
// appears in that role's set. "Partial/Limited/Approve/Self-only" cells from
// the paper are modelled as: base permission granted + nuance enforced by the
// scope filter / field rules / dedicated self-service endpoints.
export const ROLE_MATRIX = {
  SUPER_ADMIN: new Set([
    'employee.read.all', 'employee.read.team', 'employee.read.self',
    'employee.create', 'employee.update.all', 'employee.update.self', 'employee.deactivate',
    'user.role.assign', 'user.password.reset',
    'attendance.mark.self', 'attendance.read.team', 'attendance.regularize',
    'leave.apply', 'leave.approve.team', 'leave.config',
    'payroll.structure.define', 'payroll.read.all', // NOTE: no payroll.run / payroll.approve (separation of duties)
    'payslip.read.self',
    'appraisal.cycle.create', 'appraisal.read.self',
    'document.upload.any', 'document.read.self',
    'grievance.file',
    'report.generate.org', 'report.generate.team',
    'audit.read', 'system.config',
  ]),
  HR_ADMIN: new Set([
    'employee.create', 'employee.read.all', 'employee.read.team', 'employee.read.self',
    'employee.update.all', 'employee.update.self', 'employee.deactivate',
    'user.role.assign', 'user.password.reset',
    'attendance.mark.self', 'attendance.read.team', 'attendance.regularize',
    'leave.apply', 'leave.approve.team', 'leave.config',
    'payroll.structure.define', 'payroll.run', 'payroll.approve', 'payroll.read.all',
    'payslip.read.self',
    'appraisal.cycle.create', 'appraisal.read.self',
    'document.upload.any', 'document.read.self',
    'grievance.file', 'grievance.read.all',
    'report.generate.org', 'report.generate.team',
    'audit.read',
  ]),
  HR_EXEC: new Set([
    'employee.create', 'employee.read.all', 'employee.read.team', 'employee.read.self',
    'employee.update.all', 'employee.update.self', // "Partial" — field rules restrict which columns
    'attendance.mark.self', 'attendance.read.team', 'attendance.regularize',
    'leave.apply',
    'payslip.read.self',
    'appraisal.cycle.create', 'appraisal.read.self',
    'document.upload.any', 'document.read.self',
    'grievance.file',
    'report.generate.org', 'report.generate.team',
  ]),
  MANAGER: new Set([
    'employee.read.team', 'employee.read.self', 'employee.update.self',
    'attendance.mark.self', 'attendance.read.team', 'attendance.regularize',
    'leave.apply', 'leave.approve.team',
    'payslip.read.self',
    'appraisal.submit.team', 'appraisal.read.self',
    'document.read.self',
    'grievance.file',
    'report.generate.team',
  ]),
  EMPLOYEE: new Set([
    'employee.read.self', 'employee.update.self', // "Limited" — field rules restrict which columns
    'attendance.mark.self',
    'leave.apply',
    'payslip.read.self',
    'appraisal.read.self',
    'document.read.self',
    'grievance.file',
  ]),
};

export function roleHasPermission(role, permission) {
  return ROLE_MATRIX[role]?.has(permission) ?? false;
}

// Section 4.3 — the scope predicate appended to every employee-data query.
// Returns a descriptor the repository layer turns into a SQL WHERE clause.
// Fails CLOSED: an unknown role scopes to nothing (id = -1).
export function scopeFilter(actor) {
  switch (actor.role) {
    case 'SUPER_ADMIN':
    case 'HR_ADMIN':
    case 'HR_EXEC':
      return { kind: 'all' }; // org-wide
    case 'MANAGER':
      return { kind: 'team', managerId: actor.employeeId, selfId: actor.employeeId };
    case 'EMPLOYEE':
      return { kind: 'self', selfId: actor.employeeId };
    default:
      return { kind: 'none' }; // deny by default
  }
}

// Turn a scope descriptor into a MySQL predicate + params against an employees
// alias. `col` is the employee id column, `mgrCol` the manager_id column.
export function scopeToSql(scope, { idCol = 'id', mgrCol = 'manager_id' } = {}) {
  switch (scope.kind) {
    case 'all':
      return { sql: '1=1', params: [] };
    case 'team':
      return { sql: `(${mgrCol} = ? OR ${idCol} = ?)`, params: [scope.managerId, scope.selfId] };
    case 'self':
      return { sql: `${idCol} = ?`, params: [scope.selfId] };
    default:
      return { sql: '1=0', params: [] }; // none → no rows
  }
}

// Section 8.3 — field-level visibility. A field is included only if the actor
// satisfies one of the allowed tokens. Fields are DELETED (not nulled) so the
// response reveals nothing about data the caller cannot reach.
export const FIELD_RULES = {
  salary: ['SUPER_ADMIN', 'HR_ADMIN', 'SELF'],
  monthly_salary: ['SUPER_ADMIN', 'HR_ADMIN', 'SELF'],
  bank_details: ['HR_ADMIN', 'SELF'],
  date_of_birth: ['HR_ADMIN', 'HR_EXEC', 'SELF'],
  personal_email: ['HR_ADMIN', 'HR_EXEC', 'SELF'],
  phone: ['HR_ADMIN', 'HR_EXEC', 'SELF'],
};

function canSeeField(actor, record, allowed) {
  if (allowed.includes(actor.role)) return true;
  if (allowed.includes('SELF') && record.id === actor.employeeId) return true;
  if (allowed.includes('MANAGER_OF') && actor.role === 'MANAGER' && record.manager_id === actor.employeeId) return true;
  return false;
}

export function filterFields(record, actor) {
  const out = { ...record };
  for (const [field, allowed] of Object.entries(FIELD_RULES)) {
    if (field in out && !canSeeField(actor, out, allowed)) delete out[field];
  }
  return out;
}
