import express from 'express';
import {
  getEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  deleteEmployee,
} from '../controllers/employee.controller.js';
import { authenticate, requireRoles } from '../middleware/auth.js';

const router = express.Router();

// All employee routes require active authentication
router.use(authenticate);

// Directory list & profile views (available to all active roles)
router.get('/', getEmployees);
router.get('/:id', getEmployeeById);

// Creation (HR Admin only)
router.post('/', requireRoles('hr_admin'), createEmployee);

// Modification (HR Admin, Manager, or Self)
router.patch('/:id', updateEmployee);

// Soft deactivation or permanent deletion (HR Admin only)
router.delete('/:id', requireRoles('hr_admin'), deleteEmployee);

export default router;
