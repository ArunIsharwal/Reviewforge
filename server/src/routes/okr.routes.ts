import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  getOKRs,
  getOKRById,
  createOKR,
  updateOKR,
  updateKeyResultProgress,
  deleteOKR,
  getOKRsSummary,
} from '../controllers/okr.controller.js';

const router = express.Router();

// Summary route must precede /:id
router.get('/summary/:employeeId', authenticate, getOKRsSummary);

// Base routes
router.get('/', authenticate, getOKRs);
router.post('/', authenticate, createOKR);
router.get('/:id', authenticate, getOKRById);
router.patch('/:id', authenticate, updateOKR);
router.patch('/:id/key-results/:krId', authenticate, updateKeyResultProgress);
router.delete('/:id', authenticate, deleteOKR);

export default router;
