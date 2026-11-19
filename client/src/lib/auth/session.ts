import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { envConfig } from '@/lib/config/env';
import { SessionUser, UserRole } from '@/types';

const COOKIE_NAME = 'reviewforge_session';
const SESSION_DURATION_SECONDS = 7 * 24 * 60 * 60; // 7 days

function getSecretKey(): Uint8Array {
  const secret = envConfig.authSecret;
  return new TextEncoder().encode(secret);
}

/**
 * Creates a signed JWT session token for the authenticated user.
 */
export async function createSessionToken(user: SessionUser): Promise<string> {
  const secretKey = getSecretKey();

  return new SignJWT({
    id: user.id,
    organizationId: user.organizationId,
    name: user.name,
    email: user.email,
    role: user.role,
    employeeId: user.employeeId || null,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(secretKey);
}

/**
 * Verifies and decodes a session token. Returns null if invalid or expired.
 */
export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  try {
    const secretKey = getSecretKey();
    const { payload } = await jwtVerify(token, secretKey, {
      algorithms: ['HS256'],
    });

    return {
      id: payload.id as string,
      organizationId: payload.organizationId as string,
      name: payload.name as string,
      email: payload.email as string,
      role: payload.role as UserRole,
      employeeId: (payload.employeeId as string) || undefined,
    };
  } catch (error) {
    // Expired or invalid token
    return null;
  }
}

/**
 * Retrieves the current authenticated user session from Next.js HTTP-only cookies.
 */
export async function getSession(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(COOKIE_NAME);

    if (!sessionCookie || !sessionCookie.value) {
      return null;
    }

    return await verifySessionToken(sessionCookie.value);
  } catch (error) {
    return null;
  }
}

/**
 * Sets the session cookie on the response.
 */
export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DURATION_SECONDS,
  });
}

/**
 * Clears the session cookie on logout.
 */
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

/**
 * Checks whether the current session has one of the allowed roles.
 */
export function hasRequiredRole(session: SessionUser | null, allowedRoles: UserRole[]): boolean {
  if (!session) return false;
  return allowedRoles.includes(session.role);
}

