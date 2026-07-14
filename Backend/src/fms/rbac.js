// The financial control framework (Section 2). Finance differs from the other
// modules: the worst failure here is not disclosure but unauthorized VALUE
// TRANSFER, and the person committing it is usually authorized. So RBAC is
// layered with a second class of control — maker–checker, an approval matrix,
// and segregation of duties. These are pure, testable predicates; the DB also
// enforces maker≠checker with a CHECK constraint.

export const FMS_ROLES = ['CFO', 'FINANCE_MANAGER', 'FINANCE_EXEC', 'BUDGET_OWNER', 'AUDITOR', 'EMPLOYEE'];

export const FMS_PERMISSIONS = [
  'coa.manage', 'journal.create', 'journal.approve', 'journal.reverse',
  'budget.define', 'budget.spend', 'invoice.issue', 'revenue.recognize',
  'payroll.post', 'payment.create', 'payment.approve', 'vendor.create',
  'expense.submit', 'expense.approve', 'period.close',
  'approval.configure', 'bank.reconcile', 'report.read', 'audit.read',
];

// Permission matrix (Table 2). Note the deliberate gaps: the CFO can APPROVE but
// cannot CREATE transactions; the Auditor can only READ, ever.
export const FMS_MATRIX = {
  // CFO approves but does not create; does NOT hold approval.configure — that
  // combined with payment.approve is a prohibited SoD pair (Table 4).
  CFO: new Set(['journal.approve', 'budget.define', 'payment.approve', 'period.close', 'report.read', 'audit.read']),
  FINANCE_MANAGER: new Set(['coa.manage', 'journal.approve', 'journal.reverse', 'revenue.recognize', 'payment.approve', 'period.close', 'bank.reconcile', 'report.read', 'audit.read']),
  // Finance Exec creates value transfers but does NOT reconcile the bank —
  // bank.reconcile + payment.create is a prohibited SoD pair (Table 4).
  FINANCE_EXEC: new Set(['journal.create', 'invoice.issue', 'payment.create', 'vendor.create', 'expense.approve', 'report.read']),
  BUDGET_OWNER: new Set(['budget.spend', 'expense.approve', 'report.read']),
  AUDITOR: new Set(['report.read', 'audit.read']),
  EMPLOYEE: new Set(['expense.submit']),
};

export function fmsCan(role, permission) {
  return FMS_MATRIX[role]?.has(permission) ?? false;
}

// Approval matrix (Table 3). Each threshold ADDS an approver so large
// transactions accumulate scrutiny. Thresholds are configuration; the
// requirement that they exist is not.
export const APPROVAL_TIERS = [
  { max: 1000, approvers: ['BUDGET_OWNER'] },
  { max: 10000, approvers: ['BUDGET_OWNER', 'FINANCE_MANAGER'] },
  { max: 50000, approvers: ['BUDGET_OWNER', 'FINANCE_MANAGER', 'CFO'] },
  { max: Infinity, approvers: ['BUDGET_OWNER', 'FINANCE_MANAGER', 'CFO', 'BOARD'] },
];

export function requiredApprovers(amount) {
  return (APPROVAL_TIERS.find((t) => amount <= t.max) || APPROVAL_TIERS[APPROVAL_TIERS.length - 1]).approvers;
}

// Maker–checker (Section 2.2, BR-05): the approver must exist and differ from
// the creator. No one may approve a transaction they created.
export function makerCheckerOk(createdBy, approvedBy) {
  return approvedBy != null && String(approvedBy) !== String(createdBy);
}

// Threshold-splitting detection (Section 2.3): if the aggregate of same-vendor,
// same-cost-center payments in a rolling window needs MORE approvers than any
// single one did, the split is flagged. A control that is trivially evaded is
// not a control.
export function splitPaymentFlag(amountsInWindow) {
  if (!amountsInWindow.length) return false;
  const total = amountsInWindow.reduce((s, a) => s + a, 0);
  const maxSingle = Math.max(...amountsInWindow);
  return requiredApprovers(total).length > requiredApprovers(maxSingle).length;
}

// Segregation of duties (Table 4): capability pairs that, held together, enable
// fraud neither enables alone. Enforced at role-assignment time.
export const SOD_CONFLICTS = [
  ['vendor.create', 'payment.approve'],   // pay a fictitious vendor you control
  ['payroll.post', 'coa.manage'],         // pay yourself an inflated amount
  ['journal.create', 'period.close'],     // conceal a misstatement by closing over it
  ['approval.configure', 'payment.approve'], // raise your own limit
  ['bank.reconcile', 'payment.create'],   // conceal an unauthorized payment
];

// Given the permission set a user would hold (e.g. the union of two roles),
// return every violated SoD pair (empty = clean).
export function sodViolations(permissions) {
  const set = new Set(permissions);
  return SOD_CONFLICTS.filter(([a, b]) => set.has(a) && set.has(b));
}

// The combined permission set of a set of roles.
export function permissionsForRoles(roles) {
  const out = new Set();
  for (const r of roles) for (const p of FMS_MATRIX[r] || []) out.add(p);
  return [...out];
}
