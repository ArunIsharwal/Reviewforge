import express from 'express';
import {
  getDepartments,
  getDepartmentById,
  createDepartment,
  updateDepartment,
  deleteDepartment,
} from '../controllers/department.controller.js';
import { authenticate, requireRoles } from '../middleware/auth.js';

const router = express.Router();

// All department endpoints require authentication
router.use(authenticate);

// List and single department retrieval (all active roles)
router.get('/', getDepartments);
router.get('/:id', getDepartmentById);

// Organizational hierarchy management (HR Admin only)
router.post('/', requireRoles('hr_admin'), createDepartment);
router.patch('/:id', requireRoles('hr_admin'), updateDepartment);
router.delete('/:id', requireRoles('hr_admin'), deleteDepartment);

export default router;
