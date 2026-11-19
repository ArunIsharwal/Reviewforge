import { SessionUser, UserRole, FeedbackItem, ManagerNote, PerformanceReview } from '@/types';
import { getSession } from './session';
import { NextResponse } from 'next/server';

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number = 401) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}

/**
 * Ensures the request is authenticated and returns the session user.
 */
export async function requireAuth(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) {
    throw new AuthError('Authentication required. Please sign in.', 401);
  }
  return session;
}

/**
 * Ensures the authenticated user has one of the required roles.
 */
export async function requireRole(allowedRoles: UserRole[]): Promise<SessionUser> {
  const session = await requireAuth();
  if (!allowedRoles.includes(session.role)) {
    throw new AuthError('Access denied: insufficient permissions for this operation.', 403);
  }
  return session;
}

/**
 * Creates a standard JSON error response for auth failures.
 */
export function handleAuthError(error: unknown): NextResponse {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.status }
    );
  }
  console.error('Unhandled authorization error:', error);
  return NextResponse.json(
    { success: false, error: 'Internal server error' },
    { status: 500 }
  );
}

/**
 * SERVER-SIDE ANONYMITY FILTER:
 * Strips provider identity from feedback items for employee views.
 */
export function sanitizeFeedbackForViewer(
  feedback: FeedbackItem[],
  viewer: SessionUser
): FeedbackItem[] {
  // HR Admins and Managers can see provider details if policy allows, but employees can NEVER see anonymous providers
  if (viewer.role === 'employee' || viewer.role === 'peer_reviewer') {
    return feedback.map(item => {
      if (item.isAnonymous) {
        return {
          ...item,
          providerEmployeeId: null,
          providerEmployeeName: 'Anonymous Colleague',
          providerRole: 'Colleague',
        };
      }
      return item;
    });
  }
  return feedback;
}

/**
 * SERVER-SIDE PRIVATE NOTES FILTER:
 * Strictly blocks employees and peer reviewers from viewing private manager observations.
 */
export function filterManagerNotesForViewer(
  notes: ManagerNote[],
  viewer: SessionUser
): ManagerNote[] {
  if (viewer.role === 'employee' || viewer.role === 'peer_reviewer') {
    return []; // Completely blocked from employee and peer views
  }
  return notes;
}

/**
 * SERVER-SIDE REVIEW STATUS GATE:
 * Employees may ONLY view reviews that have been formally 'Released' by HR.
 */
export function filterReviewsForViewer(
  reviews: PerformanceReview[],
  viewer: SessionUser
): PerformanceReview[] {
  if (viewer.role === 'employee') {
    // Only released reviews belonging to the employee themselves
    return reviews.filter(
      r => r.employeeId === viewer.employeeId && r.status === 'Released'
    );
  }
  return reviews;
}

