import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, TokenPayload } from '../utils/token.js';
import { User, UserRole, IUser } from '../models/User.js';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: IUser & { tokenPayload?: TokenPayload };
    }
  }
}

/**
 * Middleware: Verifies Bearer JWT and attaches authenticated user model to req.user.
 */
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: 'Authentication token required. Please sign in.',
      });
      return;
    }

    const token = authHeader.split(' ')[1]?.trim();
    if (!token) {
      res.status(401).json({
        success: false,
        error: 'Malformed authorization header.',
      });
      return;
    }

    const payload = await verifyAccessToken(token);
    if (!payload) {
      res.status(401).json({
        success: false,
        error: 'Invalid or expired authentication token. Please sign in again.',
        code: 'TOKEN_EXPIRED',
      });
      return;
    }

    // Verify user exists and is active in database
    const user = await User.findById(payload.id);
    if (!user) {
      res.status(401).json({
        success: false,
        error: 'User account not found.',
      });
      return;
    }

    if (user.status === 'deactivated') {
      res.status(403).json({
        success: false,
        error: 'User account has been deactivated. Please contact HR.',
      });
      return;
    }

    (req as any).user = user;
    (req as any).user.tokenPayload = payload;
    next();
  } catch (error) {
    console.error('Authentication middleware error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication processing error.',
    });
  }
}

/**
 * Middleware: Role-Based Access Control (RBAC).
 * Restricts endpoint to users having one of the specified roles.
 */
export function requireRoles(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required prior to permission check.',
      });
      return;
    }

    if (!allowedRoles.includes(user.role)) {
      res.status(403).json({
        success: false,
        error: `Access denied: Role '${user.role}' is not authorized to access this resource.`,
        requiredRoles: allowedRoles,
        currentRole: user.role,
      });
      return;
    }

    next();
  };
}

/**
 * Middleware: Prevents role escalation.
 * Rejects requests if non-HR users attempt to set or modify user roles.
 */
export function preventRoleEscalation(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const user = req.user;
  const requestedRole = req.body?.role;

  if (requestedRole && (!user || user.role !== 'hr_admin')) {
    res.status(403).json({
      success: false,
      error: 'Access denied: Only HR Administrators can assign or modify user roles.',
    });
    return;
  }

  next();
}

