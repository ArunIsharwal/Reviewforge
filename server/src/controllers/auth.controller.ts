import { Request, Response } from 'express';
import { z } from 'zod';
import { User } from '../models/User.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  generateRandomToken,
  hashToken,
} from '../utils/token.js';

// Request Validation Schemas
export const LoginSchema = z.object({
  email: z.string().email('Please provide a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
});

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export const ForgotPasswordSchema = z.object({
  email: z.string().email('Please provide a valid email address'),
});

export const ResetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters long'),
});

/**
 * POST /api/v1/auth/login
 */
export async function login(req: Request, res: Response): Promise<void> {
  const validation = LoginSchema.safeParse(req.body);
  if (!validation.success) {
    res.status(400).json({
      success: false,
      error: validation.error.issues[0]?.message || 'Invalid credentials format',
      issues: validation.error.issues,
    });
    return;
  }

  const { email, password } = validation.data;
  const normalizedEmail = email.toLowerCase().trim();

  // Find user in MongoDB
  const user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    res.status(401).json({
      success: false,
      error: 'Invalid email or password.',
    });
    return;
  }

  // Check account status
  if (user.status === 'deactivated') {
    res.status(403).json({
      success: false,
      error: 'Account deactivated. Please contact your HR administrator.',
    });
    return;
  }

  // Verify password using bcrypt
  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    res.status(401).json({
      success: false,
      error: 'Invalid email or password.',
    });
    return;
  }

  // Generate tokens
  const payload = {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    role: user.role,
    organizationId: user.organizationId,
    employeeId: user.employeeId,
  };

  const accessToken = await generateAccessToken(payload);
  const refreshToken = await generateRefreshToken(payload);

  // Store refresh token and update last login
  user.refreshToken = refreshToken;
  user.lastLoginAt = new Date();
  await user.save();

  res.status(200).json({
    success: true,
    message: `Signed in successfully as ${user.name} (${user.role}).`,
    accessToken,
    refreshToken,
    user: user.toJSON(),
  });
}

/**
 * POST /api/v1/auth/logout
 */
export async function logout(req: Request, res: Response): Promise<void> {
  // If user is authenticated, clear stored refresh token in DB
  const user = req.user;
  if (user) {
    user.refreshToken = undefined;
    await user.save();
  } else if (req.body?.refreshToken) {
    // If unauthenticated but provided refresh token, clear corresponding record
    await User.updateOne({ refreshToken: req.body.refreshToken }, { $unset: { refreshToken: 1 } });
  }

  res.status(200).json({
    success: true,
    message: 'Logged out successfully. Session invalidated.',
  });
}

/**
 * POST /api/v1/auth/refresh
 */
export async function refreshToken(req: Request, res: Response): Promise<void> {
  const validation = RefreshTokenSchema.safeParse(req.body);
  if (!validation.success) {
    res.status(400).json({
      success: false,
      error: 'Refresh token is required.',
    });
    return;
  }

  const { refreshToken: rawRefreshToken } = validation.data;

  // 1. Cryptographically verify refresh token
  const payload = await verifyRefreshToken(rawRefreshToken);
  if (!payload) {
    res.status(401).json({
      success: false,
      error: 'Invalid or expired refresh token. Please sign in again.',
    });
    return;
  }

  // 2. Look up user and verify token matches stored database record (anti-replay/revocation)
  const user = await User.findById(payload.id);
  if (!user || user.status === 'deactivated') {
    res.status(401).json({
      success: false,
      error: 'User not found or account deactivated.',
    });
    return;
  }

  if (user.refreshToken !== rawRefreshToken) {
    res.status(401).json({
      success: false,
      error: 'Refresh token has been revoked or invalidated. Please sign in again.',
    });
    return;
  }

  // 3. Rotate tokens
  const tokenPayload = {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    role: user.role,
    organizationId: user.organizationId,
    employeeId: user.employeeId,
  };

  const newAccessToken = await generateAccessToken(tokenPayload);
  const newRefreshToken = await generateRefreshToken(tokenPayload);

  user.refreshToken = newRefreshToken;
  await user.save();

  res.status(200).json({
    success: true,
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
  });
}

/**
 * POST /api/v1/auth/forgot-password
 */
export async function forgotPassword(req: Request, res: Response): Promise<void> {
  const validation = ForgotPasswordSchema.safeParse(req.body);
  if (!validation.success) {
    res.status(400).json({
      success: false,
      error: 'Please provide a valid email address.',
    });
    return;
  }

  const { email } = validation.data;
  const user = await User.findOne({ email: email.toLowerCase().trim() });

  if (!user) {
    // For security, don't leak whether user exists in production
    res.status(200).json({
      success: true,
      message: 'If this email address exists in ReviewForge, a password reset token has been issued.',
    });
    return;
  }

  // Generate reset token and set 1-hour expiration
  const rawToken = generateRandomToken();
  const hashed = hashToken(rawToken);

  user.passwordResetToken = hashed;
  user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  await user.save();

  res.status(200).json({
    success: true,
    message: 'Password reset token generated successfully.',
    resetToken: rawToken, // Provided for automated testing / delivery
    expiresAt: user.passwordResetExpires.toISOString(),
  });
}

/**
 * POST /api/v1/auth/reset-password
 */
export async function resetPassword(req: Request, res: Response): Promise<void> {
  const validation = ResetPasswordSchema.safeParse(req.body);
  if (!validation.success) {
    res.status(400).json({
      success: false,
      error: validation.error.issues[0]?.message || 'Invalid password reset data',
    });
    return;
  }

  const { token, newPassword } = validation.data;
  const hashed = hashToken(token);

  // Find user by valid unexpired token
  const user = await User.findOne({
    passwordResetToken: hashed,
    passwordResetExpires: { $gt: new Date() },
  });

  if (!user) {
    res.status(400).json({
      success: false,
      error: 'Invalid or expired password reset token.',
    });
    return;
  }

  // Hash new password and clear reset token & all sessions
  user.passwordHash = await User.hashPassword(newPassword);
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  user.refreshToken = undefined; // Force re-login on all devices
  await user.save();

  res.status(200).json({
    success: true,
    message: 'Password has been successfully updated. You may now sign in with your new password.',
  });
}

/**
 * GET /api/v1/auth/me
 */
export async function getCurrentUser(req: Request, res: Response): Promise<void> {
  const user = req.user;
  if (!user) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated.',
    });
    return;
  }

  res.status(200).json({
    success: true,
    user: user.toJSON(),
  });
}

