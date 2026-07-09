import { Router } from 'express';
import {
  listClients, createClient, updateClient, deleteClient, clvAdhoc,
  listQueueScenarios, analyzeQueueScenario, analyzeQueueAdhoc, createQueueScenario, deleteQueueScenario,
} from '../controllers/clientController.js';

const router = Router();

// Support desk (M/M/c queuing) — declared before /:id-style client routes.
router.get('/queues', listQueueScenarios);
router.post('/queues', createQueueScenario);
router.post('/queues/analyze', analyzeQueueAdhoc);
router.get('/queues/:id', analyzeQueueScenario);
router.delete('/queues/:id', deleteQueueScenario);

// CLV calculator
router.post('/clv', clvAdhoc);

// Clients (CLV + portfolio)
router.get('/', listClients);
router.post('/', createClient);
router.put('/:id', updateClient);
router.delete('/:id', deleteClient);

export default router;
