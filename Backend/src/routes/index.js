import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { createContactMessage, listContactMessages } from '../controllers/contactController.js';
import { listServices, listTeamMembers } from '../controllers/contentController.js';

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

export default router;
