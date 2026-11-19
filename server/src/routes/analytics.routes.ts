import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  getDashboardMetrics,
  getAnalyticsSummary,
  exportAnalytics,
} from '../controllers/analytics.controller.js';

const router = express.Router();

// All analytics endpoints require valid JWT authentication
router.use(authenticate);

// Role-scoped real-time dashboard metrics (HR Admin, Manager, Employee, Peer Reviewer)
router.get('/dashboard', getDashboardMetrics);

// Comprehensive talent analytics & competency rubrics
router.get('/summary', getAnalyticsSummary);

// Analytics export (CSV or JSON printable report)
router.get('/export', exportAnalytics);

export default router;
