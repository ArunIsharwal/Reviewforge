import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  getSelfReflections,
  getSelfReflectionByEmployeeId,
  saveSelfReflection,
} from '../controllers/self-reflection.controller.js';

const router = express.Router();

router.use(authenticate);

router.get('/', getSelfReflections);
router.get('/:employeeId', getSelfReflectionByEmployeeId);
router.post('/', saveSelfReflection);

export default router;
