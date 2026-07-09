import { Router } from 'express';
import {
  listEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  listAssignmentScenarios,
  solveAssignmentScenario,
  createAssignmentScenario,
  deleteAssignmentScenario,
  solveAssignmentAdhoc,
  listRetentionScenarios,
  runRetentionScenario,
  createRetentionScenario,
  deleteRetentionScenario,
} from '../controllers/employeeController.js';

const router = Router();

// Roster
router.get('/', listEmployees);
router.post('/', createEmployee);
router.put('/:id', updateEmployee);
router.delete('/:id', deleteEmployee);

// Assignment problem (task allocation)
router.get('/assignments', listAssignmentScenarios);
router.post('/assignments', createAssignmentScenario);
router.post('/assignments/solve', solveAssignmentAdhoc); // ad-hoc, non-persisted
router.get('/assignments/:id', solveAssignmentScenario);
router.delete('/assignments/:id', deleteAssignmentScenario);

// Retention (Markov attrition)
router.get('/retention', listRetentionScenarios);
router.post('/retention', createRetentionScenario);
router.get('/retention/:id', runRetentionScenario);
router.delete('/retention/:id', deleteRetentionScenario);

export default router;
