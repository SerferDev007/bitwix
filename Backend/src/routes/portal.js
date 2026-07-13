// EXTERNAL (portal) plane router. Mounted at /api/portal. NO endpoint here
// accepts an account_id parameter — the account is a property of the session
// (Section 9.1). Separate router + middleware from the internal plane.
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { portalAuth } from '../middleware/crmAuth.js';
import {
  portalLogin, portalActivate, portalMe, portalLogout,
  createTicket, listMyTickets, getConsent, setConsent, requestPortalUser,
} from '../controllers/crm/portalController.js';

const router = Router();
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false, message: { success: false, message: 'Too many login attempts.' } });

router.post('/auth/login', loginLimiter, portalLogin);
router.post('/auth/activate', portalActivate);
router.get('/me', portalAuth('account.read.self'), portalMe);
router.post('/auth/logout', portalAuth('account.read.self'), portalLogout);

router.post('/tickets', portalAuth('ticket.create'), createTicket);
router.get('/tickets', portalAuth('ticket.read.self'), listMyTickets);

router.get('/consent', portalAuth('consent.manage.self'), getConsent);
router.put('/consent', portalAuth('consent.manage.self'), setConsent);

router.post('/users/request', portalAuth('portal.user.request'), requestPortalUser);

export default router;
