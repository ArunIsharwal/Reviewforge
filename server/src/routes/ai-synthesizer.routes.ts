import express from 'express';
import { authenticate, requireRoles } from '../middleware/auth.js';
import {
  synthesizeReview,
  getQualityCheck,
  getSynthesisLogs,
} from '../controllers/ai-synthesizer.controller.js';

const router = express.Router();

// AI Synthesizer endpoints are restricted to hr_admin and manager
router.use(authenticate);
router.use(requireRoles('hr_admin', 'manager'));

router.post('/synthesize', synthesizeReview);
router.get('/quality-check/:employeeId', getQualityCheck);
router.get('/logs/:employeeId', getSynthesisLogs);

export default router;
