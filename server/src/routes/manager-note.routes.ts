import express from 'express';
import { authenticate, requireRoles } from '../middleware/auth.js';
import {
  getManagerNotes,
  getManagerNoteById,
  createManagerNote,
  updateManagerNote,
  deleteManagerNote,
  getManagerNotesSummary,
} from '../controllers/manager-note.controller.js';

const router = express.Router();

// CRITICAL SECURITY REQUIREMENT:
// Manager notes are strictly restricted to HR Administrators and Managers.
// All routes apply authenticate and requireRoles('hr_admin', 'manager').
router.use(authenticate);
router.use(requireRoles('hr_admin', 'manager'));

// Summary endpoint for an employee (must precede /:id)
router.get('/summary/:employeeId', getManagerNotesSummary);

// Manager notes collection endpoints
router.get('/', getManagerNotes);
router.post('/', createManagerNote);

// Specific note endpoints
router.get('/:id', getManagerNoteById);
router.put('/:id', updateManagerNote);
router.delete('/:id', deleteManagerNote);

export default router;
