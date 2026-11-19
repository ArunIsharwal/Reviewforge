import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  getAuditLogs,
  createAuditLog,
  rejectAuditModification,
} from '../controllers/audit-log.controller.js';

const router = express.Router();

router.use(authenticate);

// Audit log query and append-only creation
router.get('/', getAuditLogs);
router.post('/', createAuditLog);

// Strict immutability guards: update and delete operations explicitly rejected with HTTP 405
router.put('/:id', rejectAuditModification);
router.patch('/:id', rejectAuditModification);
router.delete('/:id', rejectAuditModification);
router.delete('/', rejectAuditModification);

export default router;
