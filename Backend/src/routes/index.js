import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { createContactMessage, listContactMessages } from '../controllers/contactController.js';
import { listServices } from '../controllers/contentController.js';
import projectRoutes from './projects.js';
import employeeRoutes from './employees.js';
import financialRoutes from './financial.js';
import clientRoutes from './clients.js';
import teamRoutes from './team.js';
import authRoutes from './auth.js';
import hrRoutes from './hr.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Throttle contact submissions to discourage spam / abuse.
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // max 10 submissions per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many messages sent. Please try again later.' },
});

// --- Authentication ---
router.use('/auth', authRoutes);

// --- App settings (public): default currency etc. ---
router.get('/settings', (req, res) => {
  res.json({
    success: true,
    data: {
      defaultCurrency: process.env.DEFAULT_CURRENCY || 'INR',
      supportedCurrencies: ['INR', 'USD'],
    },
  });
});

// --- Public site endpoints (no auth) ---
router.post('/contact', contactLimiter, createContactMessage); // visitors submit
router.get('/services', listServices);

// Team: public GET, protected CRUD + photo upload (auth enforced inside).
router.use('/team', teamRoutes);

// --- Protected admin endpoints (require a valid token) ---
router.get('/contact', requireAuth, listContactMessages); // admin reads messages

// Project Management module (CPM / PERT / EVM)
router.use('/projects', requireAuth, projectRoutes);

// Employee Management module (Assignment problem / Markov attrition)
router.use('/employees', requireAuth, employeeRoutes);

// Financial Management module (LP allocation / NPV / break-even)
router.use('/financial', requireAuth, financialRoutes);

// Client Management module (M/M/c queuing / CLV)
router.use('/clients', requireAuth, clientRoutes);

// Employee Management System (RBAC / HR) — auth enforced per-route inside.
router.use('/hr', hrRoutes);

export default router;
