import { Router } from 'express';
import {
  listLpScenarios, solveLpScenario, solveLpAdhoc, createLpScenario, deleteLpScenario,
  listInvestments, createInvestment, deleteInvestment,
  listServiceLines, createServiceLine, deleteServiceLine, breakEvenAdhoc, loadedRateAdhoc,
} from '../controllers/financialController.js';

const router = Router();

// Capacity allocation (LP)
router.get('/lp', listLpScenarios);
router.post('/lp', createLpScenario);
router.post('/lp/solve', solveLpAdhoc);
router.get('/lp/:id', solveLpScenario);
router.delete('/lp/:id', deleteLpScenario);

// Investments (NPV)
router.get('/investments', listInvestments);
router.post('/investments', createInvestment);
router.delete('/investments/:id', deleteInvestment);

// Service lines (break-even) + calculators
router.get('/service-lines', listServiceLines);
router.post('/service-lines', createServiceLine);
router.delete('/service-lines/:id', deleteServiceLine);
router.post('/break-even', breakEvenAdhoc);
router.post('/loaded-rate', loadedRateAdhoc);

export default router;
