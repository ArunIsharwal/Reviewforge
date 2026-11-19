import express, { Request, Response } from 'express';
import {
  login,
  logout,
  refreshToken,
  forgotPassword,
  resetPassword,
  getCurrentUser,
} from '../controllers/auth.controller.js';
import { authenticate, requireRoles, preventRoleEscalation } from '../middleware/auth.js';

const router = express.Router();

// Public Authentication Endpoints
router.post('/login', login);
router.post('/refresh', refreshToken);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// Protected User Session
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, getCurrentUser);

// Protected RBAC Verification Endpoints
router.get(
  '/test/hr-only',
  authenticate,
  requireRoles('hr_admin'),
  (req: Request, res: Response) => {
    res.status(200).json({
      success: true,
      message: 'Welcome to HR Administrator portal. Access granted.',
      role: req.user?.role,
    });
  }
);

router.get(
  '/test/manager-only',
  authenticate,
  requireRoles('hr_admin', 'manager'),
  (req: Request, res: Response) => {
    res.status(200).json({
      success: true,
      message: 'Manager scope access granted.',
      role: req.user?.role,
    });
  }
);

router.get(
  '/test/all-roles',
  authenticate,
  requireRoles('hr_admin', 'manager', 'employee', 'peer_reviewer'),
  (req: Request, res: Response) => {
    res.status(200).json({
      success: true,
      message: 'Authenticated employee access granted.',
      role: req.user?.role,
    });
  }
);

router.post(
  '/test/role-escalation',
  authenticate,
  preventRoleEscalation,
  (req: Request, res: Response) => {
    res.status(200).json({
      success: true,
      message: 'Role assignment permitted.',
      assignedRole: req.body?.role,
    });
  }
);

export default router;

