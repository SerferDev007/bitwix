import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authorize, authenticated } from '../middleware/hrAuth.js';
import { login, activate, logout, me } from '../controllers/hr/authController.js';
import {
  provisionEmployee, listEmployees, getEmployee, assignRole,
  deactivateEmployee, adminResetPassword, readAudit, updateEmployee, getEmployeePayslips,
  getHrSettings, updateHrSettings,
} from '../controllers/hr/accountController.js';
import {
  listLeaveTypes, getBalance, applyLeave, listRequests, approveLeave, rejectLeave,
} from '../controllers/hr/leaveController.js';
import {
  createPayrollRun, listPayrollRuns, getPayrollRun, approvePayrollRun,
} from '../controllers/hr/payrollController.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts. Please try again later.' },
});

// --- Auth (public token flows) ---
router.post('/auth/login', loginLimiter, login);
router.post('/auth/activate', activate);
router.post('/auth/logout', authenticated(), logout);
router.get('/auth/me', authenticated(), me);

// --- Employee provisioning & records (RBAC-enforced) ---
router.post('/employees', authorize('employee.create'), provisionEmployee);
router.get('/employees', authorize('employee.read.self'), listEmployees);   // scope narrows the rows
router.get('/employees/:id', authorize('employee.read.self'), getEmployee); // scope → 403 if outside
router.put('/employees/:id', authorize('employee.update.all'), updateEmployee);
router.get('/employees/:id/payslips', authorize('payslip.read.self'), getEmployeePayslips);
router.post('/employees/:id/deactivate', authorize('employee.deactivate'), deactivateEmployee);
router.put('/accounts/:id/role', authorize('user.role.assign'), assignRole);
router.post('/accounts/:id/reset-password', authorize('user.password.reset'), adminResetPassword);

// --- Leave ---
router.get('/leave/types', authorize('leave.apply'), listLeaveTypes);
router.get('/leave/balance', authorize('leave.apply'), getBalance);
router.post('/leave/requests', authorize('leave.apply'), applyLeave);
router.get('/leave/requests', authorize('leave.apply'), listRequests); // scope decides visibility
router.post('/leave/requests/:id/approve', authorize('leave.approve.team'), approveLeave);
router.post('/leave/requests/:id/reject', authorize('leave.approve.team'), rejectLeave);

// --- Payroll (posts PAYROLL_APPROVED to the FMS ledger on approval) ---
router.post('/payroll/runs', authorize('payroll.run'), createPayrollRun);
router.get('/payroll/runs', authorize('payroll.read.all'), listPayrollRuns);
router.get('/payroll/runs/:id', authorize('payroll.read.all'), getPayrollRun);
router.post('/payroll/runs/:id/approve', authorize('payroll.approve'), approvePayrollRun);

// --- Company document settings (offer-letter terms, signatory) ---
router.get('/settings', authenticated(), getHrSettings);
router.put('/settings', authorize('user.role.assign'), updateHrSettings);

// --- Audit ---
router.get('/audit', authorize('audit.read'), readAudit);

export default router;
