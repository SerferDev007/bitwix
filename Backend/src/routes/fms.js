import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  listAccounts, getTrialBalance, getProfitAndLoss, listJournal,
  postEvent, createJournal, approveJournal, reverseJournal, unitEconomics, reconcile,
} from '../controllers/fms/fmsController.js';

const router = Router();

// Finance is guarded end to end. (A dedicated financial-role auth plane —
// CFO/Finance Manager/Auditor with the maker–checker matrix wired to real users —
// is the documented next step; for now the admin token gates the module.)
router.use(requireAuth);

// Reads
router.get('/accounts', listAccounts);
router.get('/trial-balance', getTrialBalance);
router.get('/pl', getProfitAndLoss);
router.get('/journal', listJournal);

// Posting layer (the integration contract) + manual journals (maker–checker)
router.post('/events', postEvent);
router.post('/journal', createJournal);
router.post('/journal/:id/approve', approveJournal);
router.post('/journal/:id/reverse', reverseJournal);

// Reconciliation — re-drive any operational fact whose ledger post was dropped
router.post('/reconcile', reconcile);

// Unit economics
router.post('/analytics/unit-economics', unitEconomics);

export default router;
