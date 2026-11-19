import { SignJWT, jwtVerify } from 'jose';
import crypto from 'crypto';
import { config } from '../config/env.js';
import { UserRole } from '../models/User.js';

export interface TokenPayload {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  organizationId: string;
  employeeId?: string;
  [key: string]: unknown;
}

function getSecretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

/**
 * Generates an Access Token with 15-minute expiration.
 */
export async function generateAccessToken(payload: TokenPayload): Promise<string> {
  const secretKey = getSecretKey(config.JWT_SECRET);
  return new SignJWT({ ...payload, jti: crypto.randomUUID() })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(config.JWT_EXPIRES_IN || '15m')
    .sign(secretKey);
}

/**
 * Generates a Refresh Token with 7-day expiration and unique JTI nonce.
 */
export async function generateRefreshToken(payload: TokenPayload): Promise<string> {
  const secretKey = getSecretKey(config.REFRESH_TOKEN_SECRET);
  return new SignJWT({
    id: payload.id,
    email: payload.email,
    role: payload.role,
    organizationId: payload.organizationId,
    jti: crypto.randomUUID(), // Guarantees uniqueness across rapid token rotations
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(config.REFRESH_TOKEN_EXPIRES_IN || '7d')
    .sign(secretKey);
}

/**
 * Verifies an Access Token. Returns decoded payload or null if invalid/expired.
 */
export async function verifyAccessToken(token: string): Promise<TokenPayload | null> {
  try {
    const secretKey = getSecretKey(config.JWT_SECRET);
    const { payload } = await jwtVerify(token, secretKey, {
      algorithms: ['HS256'],
    });

    return {
      id: payload.id as string,
      email: payload.email as string,
      name: payload.name as string,
      role: payload.role as UserRole,
      organizationId: payload.organizationId as string,
      employeeId: payload.employeeId as string | undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Verifies a Refresh Token. Returns decoded payload or null if invalid/expired.
 */
export async function verifyRefreshToken(token: string): Promise<TokenPayload | null> {
  try {
    const secretKey = getSecretKey(config.REFRESH_TOKEN_SECRET);
    const { payload } = await jwtVerify(token, secretKey, {
      algorithms: ['HS256'],
    });

    return {
      id: payload.id as string,
      email: payload.email as string,
      name: (payload.name as string) || '',
      role: payload.role as UserRole,
      organizationId: payload.organizationId as string,
      employeeId: payload.employeeId as string | undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Generates a cryptographic random hex token (e.g. for password resets).
 */
export function generateRandomToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hashes a token using SHA-256 for secure database storage.
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
