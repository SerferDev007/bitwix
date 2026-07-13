import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authorize, authenticated } from '../middleware/hrAuth.js';
import { login, activate, logout, me } from '../controllers/hr/authController.js';
import {
  provisionEmployee, listEmployees, getEmployee, assignRole,
  deactivateEmployee, adminResetPassword, readAudit,
} from '../controllers/hr/accountController.js';
import {
  listLeaveTypes, getBalance, applyLeave, listRequests, approveLeave, rejectLeave,
} from '../controllers/hr/leaveController.js';

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

// --- Audit ---
router.get('/audit', authorize('audit.read'), readAudit);

export default router;
