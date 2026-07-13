// INTERNAL plane router (staff). Mounted at /api/crm. Separate from the portal
// router so a new internal endpoint can never be accidentally exposed to
// portal users — it simply isn't mounted there (Section 9.1).
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { internalAuth } from '../middleware/crmAuth.js';
import {
  login, me, logout,
  createAccount, listAccounts, createContact,
  provisionPortalUser, revokePortalUser, approvePortalRequest,
  createOpportunity, updateOpportunityStage, forecast,
  listTicketsInternal, resolveTicket, readAudit,
} from '../controllers/crm/internalController.js';

const router = Router();
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false, message: { success: false, message: 'Too many login attempts.' } });

router.post('/auth/login', loginLimiter, login);
router.get('/auth/me', internalAuth(null), me);
router.post('/auth/logout', internalAuth(null), logout);

router.post('/accounts', internalAuth('account.create'), createAccount);
router.get('/accounts', internalAuth('account.read.all'), listAccounts);
router.post('/contacts', internalAuth('account.create'), createContact);

router.post('/portal-users', internalAuth('portal.user.invite'), provisionPortalUser);
router.post('/portal-users/:id/revoke', internalAuth('portal.user.revoke'), revokePortalUser);
router.post('/portal-requests/:id/approve', internalAuth('portal.request.approve'), approvePortalRequest);

router.post('/opportunities', internalAuth('opportunity.manage'), createOpportunity);
router.patch('/opportunities/:id/stage', internalAuth('opportunity.manage'), updateOpportunityStage);
router.get('/forecast', internalAuth('forecast.read'), forecast);

router.get('/tickets', internalAuth('ticket.read'), listTicketsInternal);
router.post('/tickets/:id/resolve', internalAuth('ticket.resolve'), resolveTicket);

router.get('/audit', internalAuth('audit.read'), readAudit);

export default router;
