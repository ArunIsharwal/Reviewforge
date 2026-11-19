import express from 'express';
import {
  getReviewCycles,
  getReviewCycleById,
  createReviewCycle,
  updateReviewCycle,
  deleteReviewCycle,
} from '../controllers/review-cycle.controller.js';
import { authenticate, requireRoles } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);

// Directory & detail view (accessible to all active roles)
router.get('/', getReviewCycles);
router.get('/:id', getReviewCycleById);

// Evaluation lifecycle management (HR Admin only)
router.post('/', requireRoles('hr_admin'), createReviewCycle);
router.patch('/:id', requireRoles('hr_admin'), updateReviewCycle);
router.delete('/:id', requireRoles('hr_admin'), deleteReviewCycle);

export default router;
