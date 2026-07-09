import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { createContactMessage, listContactMessages } from '../controllers/contactController.js';
import { listServices, listTeamMembers } from '../controllers/contentController.js';
import projectRoutes from './projects.js';
import employeeRoutes from './employees.js';
import financialRoutes from './financial.js';
import clientRoutes from './clients.js';

const router = Router();

// Throttle contact submissions to discourage spam / abuse.
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // max 10 submissions per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many messages sent. Please try again later.' },
});

router.post('/contact', contactLimiter, createContactMessage);
router.get('/contact', listContactMessages);

router.get('/services', listServices);
router.get('/team', listTeamMembers);

// Project Management module (CPM / PERT / EVM)
router.use('/projects', projectRoutes);

// Employee Management module (Assignment problem / Markov attrition)
router.use('/employees', employeeRoutes);

// Financial Management module (LP allocation / NPV / break-even)
router.use('/financial', financialRoutes);

// Client Management module (M/M/c queuing / CLV)
router.use('/clients', clientRoutes);

export default router;
