import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  getFeedbackList,
  getFeedbackById,
  submitFeedback,
  getFeedbackRequests,
  createFeedbackRequest,
  declineFeedbackRequest,
  getFeedbackSummary,
} from '../controllers/feedback.controller.js';

const router = express.Router();

// Specific sub-resource routes must precede /:id
router.get('/requests', authenticate, getFeedbackRequests);
router.post('/requests', authenticate, createFeedbackRequest);
router.patch('/requests/:id/decline', authenticate, declineFeedbackRequest);

router.get('/summary/:employeeId', authenticate, getFeedbackSummary);

// Base resource routes
router.get('/', authenticate, getFeedbackList);
router.post('/', authenticate, submitFeedback);
router.get('/:id', authenticate, getFeedbackById);

export default router;
