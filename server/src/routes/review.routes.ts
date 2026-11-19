import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  getReviews,
  getReviewById,
  saveReview,
  updateReview,
  submitReviewForApproval,
  requestReviewChanges,
  approveReview,
  publishReview,
  updateReviewSection,
  exportReview,
} from '../controllers/review.controller.js';

const router = express.Router();

router.use(authenticate);

// Collection & Document Endpoints
router.get('/', getReviews);
router.get('/:id', getReviewById);
router.get('/:id/export', exportReview);
router.post('/', saveReview);
router.patch('/:id', updateReview);

// Granular Section Editing (preserving evidence links)
router.patch('/:id/sections/:sectionKey', updateReviewSection);
router.put('/:id/sections/:sectionKey', updateReviewSection);

// Workflow Action Endpoints (Supporting both POST and PATCH)
router.post('/:id/submit', submitReviewForApproval);
router.patch('/:id/submit', submitReviewForApproval);

router.post('/:id/request-changes', requestReviewChanges);
router.patch('/:id/request-changes', requestReviewChanges);

router.post('/:id/approve', approveReview);
router.patch('/:id/approve', approveReview);

router.post('/:id/publish', publishReview);
router.patch('/:id/publish', publishReview);
router.post('/:id/release', publishReview);
router.patch('/:id/release', publishReview);

export default router;
