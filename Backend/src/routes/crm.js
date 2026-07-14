// INTERNAL plane router (staff). Mounted at /api/crm. Separate from the portal
// router so a new internal endpoint can never be accidentally exposed to
// portal users — it simply isn't mounted there (Section 9.1).
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { internalAuth } from '../middleware/crmAuth.js';
import {
  login, me, logout,
  createAccount, listAccounts, getAccount, createContact,
  listAccountContacts, listAccountPortalUsers, listOpportunities,
  provisionPortalUser, revokePortalUser, approvePortalRequest,
  createOpportunity, updateOpportunityStage, forecast,
  listAccountInvoices, recordInvoicePayment,
  listTicketsInternal, resolveTicket, readAudit,
} from '../controllers/crm/internalController.js';
import {
  createLead, listLeads, rescoreLead, updateLeadStatus, convertLead,
} from '../controllers/crm/leadController.js';
import {
  createQuote, listQuotes, approveQuote, sendQuote, reviseQuote,
} from '../controllers/crm/quoteController.js';

const router = Router();
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false, message: { success: false, message: 'Too many login attempts.' } });

router.post('/auth/login', loginLimiter, login);
router.get('/auth/me', internalAuth(null), me);
router.post('/auth/logout', internalAuth(null), logout);

router.post('/accounts', internalAuth('account.create'), createAccount);
router.get('/accounts', internalAuth('account.read.all'), listAccounts);
router.get('/accounts/:id', internalAuth('account.read.all'), getAccount);
router.get('/accounts/:id/contacts', internalAuth('account.read.all'), listAccountContacts);
router.get('/accounts/:id/portal-users', internalAuth('account.read.all'), listAccountPortalUsers);
router.get('/accounts/:id/invoices', internalAuth('invoice.read'), listAccountInvoices);
router.post('/contacts', internalAuth('account.create'), createContact);

// Finance records a received payment → posts PAYMENT_RECEIVED to the ledger.
router.post('/invoices/:id/pay', internalAuth('contract.manage'), recordInvoicePayment);

router.post('/portal-users', internalAuth('portal.user.invite'), provisionPortalUser);
router.post('/portal-users/:id/revoke', internalAuth('portal.user.revoke'), revokePortalUser);
router.post('/portal-requests/:id/approve', internalAuth('portal.request.approve'), approvePortalRequest);

// Leads
router.get('/leads', internalAuth('lead.read'), listLeads);
router.post('/leads', internalAuth('lead.read'), createLead);
router.post('/leads/:id/score', internalAuth('lead.read'), rescoreLead);
router.patch('/leads/:id/status', internalAuth('lead.read'), updateLeadStatus);
router.post('/leads/:id/convert', internalAuth('lead.convert'), convertLead);

// Opportunities
router.get('/opportunities', internalAuth('opportunity.manage'), listOpportunities);
router.post('/opportunities', internalAuth('opportunity.manage'), createOpportunity);
router.patch('/opportunities/:id/stage', internalAuth('opportunity.manage'), updateOpportunityStage);
router.get('/forecast', internalAuth('forecast.read'), forecast);

// Quotes — discount approval is Sales-Manager-only (separation of duties)
router.get('/quotes', internalAuth('quote.create'), listQuotes);
router.post('/quotes', internalAuth('quote.create'), createQuote);
router.post('/quotes/:id/approve', internalAuth('discount.approve'), approveQuote);
router.post('/quotes/:id/send', internalAuth('quote.create'), sendQuote);
router.post('/quotes/:id/revise', internalAuth('quote.create'), reviseQuote);

router.get('/tickets', internalAuth('ticket.read'), listTicketsInternal);
router.post('/tickets/:id/resolve', internalAuth('ticket.resolve'), resolveTicket);

router.get('/audit', internalAuth('audit.read'), readAudit);

export default router;
