// HR / RBAC validation — the authorization matrix, scope filter, field rules,
// password hashing, and token revocation. Pure logic, no DB required. This is
// the "generated from the matrix" negative-authorization surface (Section 11).
import { ROLES, PERMISSIONS, roleHasPermission, scopeFilter, scopeToSql, filterFields, ROLE_MATRIX } from './rbac.js';
import { hashPassword, verifyPassword, enforcePasswordPolicy } from './password.js';
import { signAccessToken, verifyAccessToken } from './token.js';
import { payrollLineFor, isBillableRole } from './payroll.js';

let failures = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? '✅' : '❌'} ${name}${!cond && extra ? ' — ' + extra : ''}`);
  if (!cond) failures++;
};

// --- Matrix: the paper's explicit callouts (Section 4.2) ---
check('SUPER_ADMIN cannot run payroll (SoD)', !roleHasPermission('SUPER_ADMIN', 'payroll.run'));
check('SUPER_ADMIN cannot approve payroll (SoD)', !roleHasPermission('SUPER_ADMIN', 'payroll.approve'));
check('SUPER_ADMIN has system.config', roleHasPermission('SUPER_ADMIN', 'system.config'));
check('HR_ADMIN can run payroll', roleHasPermission('HR_ADMIN', 'payroll.run'));
check('HR_ADMIN can read all grievances', roleHasPermission('HR_ADMIN', 'grievance.read.all'));
check('HR_ADMIN lacks system.config', !roleHasPermission('HR_ADMIN', 'system.config'));
check('MANAGER cannot read any payroll', !roleHasPermission('MANAGER', 'payroll.read.all'));
check('MANAGER can approve team leave', roleHasPermission('MANAGER', 'leave.approve.team'));
check('MANAGER can appraise team', roleHasPermission('MANAGER', 'appraisal.submit.team'));
check('MANAGER cannot read all employees', !roleHasPermission('MANAGER', 'employee.read.all'));
check('HR_EXEC can create employees', roleHasPermission('HR_EXEC', 'employee.create'));
check('HR_EXEC cannot approve leave', !roleHasPermission('HR_EXEC', 'leave.approve.team'));
check('HR_EXEC cannot read audit', !roleHasPermission('HR_EXEC', 'audit.read'));
check('EMPLOYEE can apply for leave', roleHasPermission('EMPLOYEE', 'leave.apply'));
check('EMPLOYEE cannot create employees', !roleHasPermission('EMPLOYEE', 'employee.create'));
check('EMPLOYEE cannot read all employees', !roleHasPermission('EMPLOYEE', 'employee.read.all'));

// Exhaustive: every (role × permission) resolves to a boolean without error.
let cells = 0;
for (const role of ROLES) for (const perm of PERMISSIONS) { roleHasPermission(role, perm); cells++; }
check(`Matrix fully defined (${cells} cells, ${ROLES.length}×${PERMISSIONS.length})`, cells === ROLES.length * PERMISSIONS.length);

// --- Scope filter (Section 4.3) — fails closed ---
check('MANAGER scope = team', scopeFilter({ role: 'MANAGER', employeeId: 7 }).kind === 'team');
check('EMPLOYEE scope = self', scopeFilter({ role: 'EMPLOYEE', employeeId: 7 }).kind === 'self');
check('HR_ADMIN scope = all', scopeFilter({ role: 'HR_ADMIN', employeeId: 7 }).kind === 'all');
check('Unknown role scope = none (deny by default)', scopeFilter({ role: 'GHOST', employeeId: 7 }).kind === 'none');
check('none scope → SQL 1=0 (no rows)', scopeToSql({ kind: 'none' }).sql === '1=0');
check('self scope → id = ? predicate', scopeToSql({ kind: 'self', selfId: 7 }).sql.includes('= ?'));

// --- Field-level filtering (Section 8.3) — deleted, not nulled ---
const salaryRec = { id: 42, manager_id: 99, monthly_salary: 5000 };
const mgrView = filterFields(salaryRec, { role: 'MANAGER', employeeId: 10 });
check('MANAGER receives NO salary key (not null)', !('monthly_salary' in mgrView));
const selfView = filterFields({ id: 42, monthly_salary: 5000 }, { role: 'EMPLOYEE', employeeId: 42 });
check('EMPLOYEE sees own salary', selfView.monthly_salary === 5000);
const hrView = filterFields(salaryRec, { role: 'HR_ADMIN', employeeId: 1 });
check('HR_ADMIN sees salary', hrView.monthly_salary === 5000);

// --- Password hashing (scrypt) ---
const h = hashPassword('correct horse battery staple');
check('password verify roundtrip', verifyPassword('correct horse battery staple', h));
check('wrong password rejected', !verifyPassword('wrong password here', h));
check('absent hash → false (no crash)', verifyPassword('anything', null) === false);
let policyThrew = false;
try { enforcePasswordPolicy('short'); } catch { policyThrew = true; }
check('policy rejects < 12 chars', policyThrew);
check('policy accepts 12+ chars', enforcePasswordPolicy('twelvechars!') === true);

// --- Token + revocation (Section 5.4) ---
const tok = signAccessToken({ accountId: 5, employeeId: 12, role: 'MANAGER', tokenVersion: 3 });
const claims = verifyAccessToken(tok);
check('token verify roundtrip', claims && claims.sub === 5 && claims.rol === 'MANAGER' && claims.ver === 3);
check('tampered token rejected', verifyAccessToken(tok.slice(0, -3) + 'xxx') === null);
check('garbage token rejected', verifyAccessToken('not.a.token') === null);

// --- Payroll computation (cents; feeds the FMS ledger, Section 6.3) ---
const devLine = payrollLineFor({ id: 1, name: 'Dev', role: 'Software Engineer', monthly_salary: 100000 }, 0.15);
check('billable role → Cost of Revenue (ENG)', isBillableRole('Software Engineer') && devLine.cost_center === 'ENG' && devLine.is_billable_role === true);
check('payroll gross = ₹100,000 → 10,000,000 cents', devLine.grossCents === 10000000);
check('payroll tax @15% = 1,500,000 cents', devLine.taxCents === 1500000);
check('payroll net + tax = gross (exact)', devLine.netCents + devLine.taxCents === devLine.grossCents);
const hrLine = payrollLineFor({ id: 2, name: 'HR', role: 'HR Executive', monthly_salary: 60000 }, 0.15);
check('non-billable role → Operating Expense (G&A)', !isBillableRole('HR Executive') && hrLine.cost_center === 'G&A');

console.log(failures === 0 ? '\n🎯 All HR/RBAC checks passed.' : `\n❌ ${failures} HR check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
