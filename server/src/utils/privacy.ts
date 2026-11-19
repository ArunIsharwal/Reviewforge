export interface FeedbackViewDTO {
  id: string;
  organizationId: string;
  reviewCycleId: string;
  targetEmployeeId: string;
  targetEmployeeName: string;
  providerEmployeeId: string;
  providerEmployeeName: string;
  providerRole: string;
  relationship: string;
  isAnonymous: boolean;
  ratings: Record<string, number>;
  strengths: string;
  improvements: string;
  status: string;
  submittedAt: string;
}

/**
 * Enforces organization anonymity policy and reviewer anonymity election.
 * Ensures the target employee can NEVER inspect identifying metadata of an anonymous reviewer.
 */
export function sanitizeFeedbackForViewer(
  feedback: any,
  viewerRole: string,
  viewerEmployeeId?: string,
  anonymityPolicy: string = 'Strict Anonymity'
): FeedbackViewDTO {
  const plain = typeof feedback.toObject === 'function' ? feedback.toObject() : { ...feedback };

  const isRecipient = viewerEmployeeId && plain.targetEmployeeId === viewerEmployeeId;
  const isStrictAnon = anonymityPolicy === 'Strict Anonymity';
  const shouldMask = (plain.isAnonymous || isStrictAnon) && (viewerRole === 'employee' || isRecipient);

  if (shouldMask) {
    return {
      ...plain,
      providerEmployeeId: 'ANONYMOUS_REVIEWER',
      providerEmployeeName: 'Anonymous Reviewer',
      providerRole: 'Peer Colleague',
      isAnonymous: true,
    };
  }

  return plain;
}

/**
 * Sanitizes an array of feedback documents for the given viewer perspective
 */
export function sanitizeFeedbackListForViewer(
  items: any[],
  viewerRole: string,
  viewerEmployeeId?: string,
  anonymityPolicy: string = 'Strict Anonymity'
): FeedbackViewDTO[] {
  return items.map((item) =>
    sanitizeFeedbackForViewer(item, viewerRole, viewerEmployeeId, anonymityPolicy)
  );
}

/**
 * Enforces performance review confidentiality gate.
 * Unreleased reviews are strictly redacted from employee view until formally published by HR Admin.
 */
export function sanitizeReviewForViewer(review: any, viewerRole: string, viewerEmployeeId?: string): any {
  const plain = typeof review.toObject === 'function' ? review.toObject() : { ...review };

  // If viewer is the reviewed employee:
  if (viewerRole === 'employee' || (viewerEmployeeId && plain.employeeId === viewerEmployeeId)) {
    // If not formally published / released, redact confidential evaluation content
    if (plain.status !== 'Released') {
      return {
        id: plain.id,
        organizationId: plain.organizationId,
        reviewCycleId: plain.reviewCycleId,
        reviewCycleTitle: plain.reviewCycleTitle,
        employeeId: plain.employeeId,
        employeeName: plain.employeeName,
        departmentName: plain.departmentName,
        jobTitle: plain.jobTitle,
        status: plain.status,
        overallRating: null,
        sections: null,
        confidentialNotice: 'Performance evaluation draft is under review and will be released following HR sign-off.',
        releasedAt: null,
      };
    }
  }

  return plain;
}
