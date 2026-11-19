import express from 'express';
import {
  getOrganization,
  updateOrganizationSettings,
} from '../controllers/organization.controller.js';
import { authenticate, requireRoles } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);

// Profile and settings retrieval (all active roles)
router.get('/', getOrganization);

// Governance and policy configuration (HR Admin only)
router.patch('/settings', requireRoles('hr_admin'), updateOrganizationSettings);

export default router;
