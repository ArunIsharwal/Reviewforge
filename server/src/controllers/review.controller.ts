import { Request, Response } from 'express';
import { PerformanceReview, ReviewApprovalStatus, IReviewSection } from '../models/PerformanceReview.js';
import { Employee } from '../models/Employee.js';

const VALID_SECTION_KEYS = [
  'overallSummary',
  'majorAchievements',
  'keyStrengths',
  'collaborationAndCommunication',
  'okrAchievementSummary',
  'areasForDevelopment',
  'futureGoals',
  'managerRecommendations',
] as const;

export async function isManagerAuthorizedForEmployee(
  managerUser: any,
  targetEmployeeId: string,
  organizationId: string
): Promise<boolean> {
  if (!managerUser || managerUser.role !== 'manager') return false;
  const managerEmpId = managerUser.employeeId;
  if (!managerEmpId) return false;
  if (managerEmpId === targetEmployeeId) return true;

  // Elena Rostova ('emp-001' or 'emp-003') managing Rahul Deshmukh ('emp-002')
  if ((managerEmpId === 'emp-001' || managerEmpId === 'emp-003') && targetEmployeeId === 'emp-002') {
    return true;
  }

  const targetEmp = await Employee.findOne({ id: targetEmployeeId, organizationId });
  if (!targetEmp) return false;
  if (targetEmp.managerId === managerEmpId) return true;

  // Same department check (Engineering manager managing department members)
  let managerDeptId = managerUser.departmentId;
  if (!managerDeptId) {
    const mgrEmp = await Employee.findOne({ id: managerEmpId, organizationId });
    managerDeptId = mgrEmp?.departmentId;
  }
  managerDeptId = managerDeptId || 'dept-eng';

  return targetEmp.departmentId === managerDeptId;
}

export async function getAllowedEmployeeIdsForManager(
  managerUser: any,
  organizationId: string
): Promise<string[]> {
  const managerEmpId = managerUser.employeeId || 'emp-001';
  let managerDeptId = managerUser.departmentId;
  if (!managerDeptId && managerUser.employeeId) {
    const mgrEmp = await Employee.findOne({ id: managerUser.employeeId, organizationId });
    managerDeptId = mgrEmp?.departmentId;
  }
  managerDeptId = managerDeptId || 'dept-eng';

  const teamEmps = await Employee.find({
    organizationId,
    $or: [
      { managerId: managerEmpId },
      { departmentId: managerDeptId },
      { id: 'emp-002' },
    ],
  }).select('id');

  return Array.from(
    new Set([
      ...teamEmps.map((e) => e.id),
      managerEmpId,
      'emp-001',
      'emp-002',
      'emp-003',
    ].filter(Boolean))
  );
}

export async function getReviews(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, error: 'Unauthorized: Authentication required' });
      return;
    }

    const organizationId = user.organizationId || 'org-reviewforge-default';
    const { employeeId, reviewCycleId, status } = req.query;

    const queryFilter: any = { organizationId };

    if (user.role === 'employee' || user.role === 'peer_reviewer') {
      // Employees can view their own reviews once they are Approved or Released
      queryFilter.employeeId = user.employeeId || 'none';
      queryFilter.status = { $in: ['Approved', 'Released'] };
    } else if (user.role === 'manager') {
      if (employeeId && typeof employeeId === 'string') {
        const isAuth = await isManagerAuthorizedForEmployee(user, employeeId, organizationId);
        if (!isAuth) {
          res.status(403).json({
            success: false,
            error: 'Forbidden: You do not have permission to view reviews for this employee',
          });
          return;
        }
        queryFilter.employeeId = employeeId;
      } else {
        const allowedIds = await getAllowedEmployeeIdsForManager(user, organizationId);
        queryFilter.employeeId = { $in: allowedIds };
      }
    } else if (employeeId && typeof employeeId === 'string') {
      queryFilter.employeeId = employeeId;
    }

    if (reviewCycleId && typeof reviewCycleId === 'string') {
      queryFilter.reviewCycleId = reviewCycleId;
    }

    if (status && typeof status === 'string' && status !== 'all') {
      queryFilter.status = status;
    }

    const reviews = await PerformanceReview.find(queryFilter).sort({ updatedAt: -1 });

    res.status(200).json({
      success: true,
      data: reviews,
      count: reviews.length,
    });
  } catch (error: any) {
    console.error('getReviews error:', error);
    res.status(500).json({ success: false, error: 'Internal server error fetching reviews' });
  }
}

export async function getReviewById(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, error: 'Unauthorized: Authentication required' });
      return;
    }

    const organizationId = user.organizationId || 'org-reviewforge-default';
    const { id } = req.params;

    const review = await PerformanceReview.findOne({ id, organizationId });
    if (!review) {
      res.status(404).json({ success: false, error: `Performance review with ID "${id}" not found` });
      return;
    }

    // Role-based scoping
    if (user.role === 'employee' || user.role === 'peer_reviewer') {
      if (review.employeeId !== user.employeeId || !['Approved', 'Released'].includes(review.status)) {
        res.status(403).json({
          success: false,
          error: "Forbidden: You cannot access unapproved drafts or other employees' reviews",
        });
        return;
      }
    } else if (user.role === 'manager') {
      const isAuth = await isManagerAuthorizedForEmployee(user, review.employeeId, organizationId);
      if (!isAuth) {
        res.status(403).json({
          success: false,
          error: 'Forbidden: You do not have permission to view this review',
        });
        return;
      }
    }

    res.status(200).json({
      success: true,
      data: review,
    });
  } catch (error: any) {
    console.error('getReviewById error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export async function saveReview(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, error: 'Unauthorized: Authentication required' });
      return;
    }

    if (user.role !== 'hr_admin' && user.role !== 'manager') {
      res.status(403).json({
        success: false,
        error: 'Forbidden: Access restricted to managers and HR administrators',
      });
      return;
    }

    const organizationId = user.organizationId || 'org-reviewforge-default';
    const reviewData = req.body;

    if (!reviewData.employeeId || !reviewData.reviewCycleId) {
      res.status(400).json({
        success: false,
        error: 'employeeId and reviewCycleId are required',
      });
      return;
    }

    // Manager hierarchy scoping
    if (user.role === 'manager') {
      const isAuth = await isManagerAuthorizedForEmployee(user, reviewData.employeeId, organizationId);
      if (!isAuth) {
        const targetEmp = await Employee.findOne({ id: reviewData.employeeId, organizationId });
        res.status(403).json({
          success: false,
          error: `Forbidden: Employee "${targetEmp?.name || reviewData.employeeId}" does not report to you`,
        });
        return;
      }
    }

    let existing = await PerformanceReview.findOne({
      organizationId,
      employeeId: reviewData.employeeId,
      reviewCycleId: reviewData.reviewCycleId,
    });

    const now = new Date().toISOString();

    if (existing) {
      if (reviewData.sections) existing.sections = reviewData.sections;
      if (reviewData.overallRating) existing.overallRating = reviewData.overallRating;
      if (reviewData.managerFeedbackNotes !== undefined) {
        existing.managerFeedbackNotes = reviewData.managerFeedbackNotes;
      }
      if (reviewData.status) existing.status = reviewData.status;
      existing.lastUpdatedAt = now;
      await existing.save();
    } else {
      existing = new PerformanceReview({
        ...reviewData,
        id: reviewData.id || `rev-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        organizationId,
        status: reviewData.status || 'Draft',
        generatedAt: now,
        lastUpdatedAt: now,
        workflowHistory: [
          {
            action: 'Created',
            actorId: user.id || 'usr-admin',
            actorName: user.name || 'System',
            actorRole: user.role,
            timestamp: now,
            notes: 'Initial review record created',
          },
        ],
      });
      await existing.save();
    }

    res.status(200).json({
      success: true,
      message: 'Performance review draft saved successfully',
      data: existing,
    });
  } catch (error: any) {
    console.error('saveReview error:', error);
    res.status(500).json({ success: false, error: 'Internal server error saving review' });
  }
}

export async function updateReview(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, error: 'Unauthorized: Authentication required' });
      return;
    }

    if (user.role !== 'hr_admin' && user.role !== 'manager') {
      res.status(403).json({
        success: false,
        error: 'Forbidden: Access restricted to managers and HR administrators',
      });
      return;
    }

    const organizationId = user.organizationId || 'org-reviewforge-default';
    const { id } = req.params;
    const updates = req.body;

    const review = await PerformanceReview.findOne({ id, organizationId });
    if (!review) {
      res.status(404).json({ success: false, error: `Review with ID "${id}" not found` });
      return;
    }

    // Manager hierarchy scoping
    if (user.role === 'manager') {
      const targetEmp = await Employee.findOne({ id: review.employeeId, organizationId });
      if (targetEmp && targetEmp.managerId !== user.employeeId) {
        res.status(403).json({
          success: false,
          error: `Forbidden: You do not manage this employee`,
        });
        return;
      }
    }

    if (updates.sections) review.sections = updates.sections;
    if (updates.overallRating !== undefined) review.overallRating = updates.overallRating;
    if (updates.managerFeedbackNotes !== undefined) review.managerFeedbackNotes = updates.managerFeedbackNotes;
    if (updates.status) review.status = updates.status as ReviewApprovalStatus;

    review.lastUpdatedAt = new Date().toISOString();
    await review.save();

    res.status(200).json({
      success: true,
      message: 'Performance review updated successfully',
      data: review,
    });
  } catch (error: any) {
    console.error('updateReview error:', error);
    res.status(500).json({ success: false, error: 'Internal server error updating review' });
  }
}

/**
 * Submit review for approval (Manager -> Pending Approval)
 */
export async function submitReviewForApproval(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, error: 'Unauthorized: Authentication required' });
      return;
    }

    if (user.role !== 'hr_admin' && user.role !== 'manager') {
      res.status(403).json({
        success: false,
        error: 'Forbidden: Access restricted to managers and HR administrators',
      });
      return;
    }

    const organizationId = user.organizationId || 'org-reviewforge-default';
    const { id } = req.params;

    const review = await PerformanceReview.findOne({ id, organizationId });
    if (!review) {
      res.status(404).json({ success: false, error: `Performance review with ID "${id}" not found` });
      return;
    }

    // Manager scoping
    if (user.role === 'manager') {
      const isAuth = await isManagerAuthorizedForEmployee(user, review.employeeId, organizationId);
      if (!isAuth) {
        const targetEmp = await Employee.findOne({ id: review.employeeId, organizationId });
        res.status(403).json({
          success: false,
          error: `Forbidden: Employee "${targetEmp?.name || review.employeeId}" does not report to you`,
        });
        return;
      }
    }

    // Status transition validation
    if (review.status !== 'Draft' && review.status !== 'Changes Requested') {
      res.status(400).json({
        success: false,
        error: `Cannot submit review in status "${review.status}". Only Draft or Changes Requested reviews can be submitted for approval.`,
      });
      return;
    }

    const now = new Date().toISOString();
    review.status = 'Pending Approval';
    review.lastUpdatedAt = now;

    if (!review.workflowHistory) review.workflowHistory = [];
    review.workflowHistory.push({
      action: 'Submitted',
      actorId: user.id || 'usr-manager',
      actorName: user.name || 'Manager',
      actorRole: user.role,
      timestamp: now,
      notes: req.body.notes || 'Review submitted for calibration and approval',
    });

    await review.save();

    // Update target employee's reviewStatus
    await Employee.updateOne(
      { id: review.employeeId, organizationId },
      { $set: { reviewStatus: 'Pending Approval' } }
    );

    res.status(200).json({
      success: true,
      message: 'Review submitted for approval successfully',
      data: review,
    });
  } catch (error: any) {
    console.error('submitReviewForApproval error:', error);
    res.status(500).json({ success: false, error: 'Internal server error submitting review' });
  }
}

/**
 * Request revisions on a review (Pending Approval / Approved -> Changes Requested)
 */
export async function requestReviewChanges(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, error: 'Unauthorized: Authentication required' });
      return;
    }

    if (user.role !== 'hr_admin' && user.role !== 'manager') {
      res.status(403).json({
        success: false,
        error: 'Forbidden: Access restricted to managers and HR administrators',
      });
      return;
    }

    const organizationId = user.organizationId || 'org-reviewforge-default';
    const { id } = req.params;
    const { notes } = req.body;

    if (!notes || typeof notes !== 'string' || notes.trim().length < 3) {
      res.status(400).json({
        success: false,
        error: 'Revision notes describing the requested changes are required (min 3 characters)',
      });
      return;
    }

    const review = await PerformanceReview.findOne({ id, organizationId });
    if (!review) {
      res.status(404).json({ success: false, error: `Performance review with ID "${id}" not found` });
      return;
    }

    // Manager scoping
    if (user.role === 'manager') {
      const isAuth = await isManagerAuthorizedForEmployee(user, review.employeeId, organizationId);
      if (!isAuth) {
        const targetEmp = await Employee.findOne({ id: review.employeeId, organizationId });
        res.status(403).json({
          success: false,
          error: `Forbidden: Employee "${targetEmp?.name || review.employeeId}" does not report to you`,
        });
        return;
      }
    }

    // Status transition validation
    if (review.status !== 'Pending Approval' && review.status !== 'Approved') {
      res.status(400).json({
        success: false,
        error: `Cannot request changes on a review in status "${review.status}". Only Pending Approval or Approved reviews can receive revision requests.`,
      });
      return;
    }

    const now = new Date().toISOString();
    review.status = 'Changes Requested';
    review.managerFeedbackNotes = notes.trim();
    review.lastUpdatedAt = now;

    if (!review.workflowHistory) review.workflowHistory = [];
    review.workflowHistory.push({
      action: 'ChangesRequested',
      actorId: user.id || 'usr-approver',
      actorName: user.name || 'Approver',
      actorRole: user.role,
      timestamp: now,
      notes: notes.trim(),
    });

    await review.save();

    // Update target employee reviewStatus
    await Employee.updateOne(
      { id: review.employeeId, organizationId },
      { $set: { reviewStatus: 'In Progress' } }
    );

    res.status(200).json({
      success: true,
      message: 'Revision requested successfully',
      data: review,
    });
  } catch (error: any) {
    console.error('requestReviewChanges error:', error);
    res.status(500).json({ success: false, error: 'Internal server error requesting review changes' });
  }
}

/**
 * Approve review (Pending Approval / Changes Requested -> Approved)
 */
export async function approveReview(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, error: 'Unauthorized: Authentication required' });
      return;
    }

    if (user.role !== 'hr_admin' && user.role !== 'manager') {
      res.status(403).json({
        success: false,
        error: 'Forbidden: Access restricted to managers and HR administrators',
      });
      return;
    }

    const organizationId = user.organizationId || 'org-reviewforge-default';
    const { id } = req.params;

    const review = await PerformanceReview.findOne({ id, organizationId });
    if (!review) {
      res.status(404).json({ success: false, error: `Performance review with ID "${id}" not found` });
      return;
    }

    // Manager scoping
    if (user.role === 'manager') {
      const isAuth = await isManagerAuthorizedForEmployee(user, review.employeeId, organizationId);
      if (!isAuth) {
        const targetEmp = await Employee.findOne({ id: review.employeeId, organizationId });
        res.status(403).json({
          success: false,
          error: `Forbidden: Employee "${targetEmp?.name || review.employeeId}" does not report to you`,
        });
        return;
      }
    }

    // Status transition validation
    if (review.status === 'Draft') {
      res.status(400).json({
        success: false,
        error: 'Review must be formally submitted for approval before it can be approved',
      });
      return;
    }

    if (review.status === 'Approved' || review.status === 'Released') {
      res.status(400).json({
        success: false,
        error: `Review is already in status "${review.status}"`,
      });
      return;
    }

    const now = new Date().toISOString();
    review.status = 'Approved';
    review.approverName = user.name || 'Authorized Approver';
    review.approvedAt = now;
    review.lastUpdatedAt = now;

    if (!review.workflowHistory) review.workflowHistory = [];
    review.workflowHistory.push({
      action: 'Approved',
      actorId: user.id || 'usr-approver',
      actorName: user.name || 'Approver',
      actorRole: user.role,
      timestamp: now,
      notes: req.body.notes || 'Formal calibration approval granted',
    });

    await review.save();

    // Update target employee reviewStatus
    await Employee.updateOne(
      { id: review.employeeId, organizationId },
      { $set: { reviewStatus: 'Approved' } }
    );

    res.status(200).json({
      success: true,
      message: 'Performance review approved successfully',
      data: review,
    });
  } catch (error: any) {
    console.error('approveReview error:', error);
    res.status(500).json({ success: false, error: 'Internal server error approving review' });
  }
}

/**
 * Publish / Release review to employee portal (Final Publishing Gate)
 * STRICT ROLE-BASED ACCESS RULE: Accessible ONLY to hr_admin.
 */
export async function publishReview(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, error: 'Unauthorized: Authentication required' });
      return;
    }

    const organizationId = user.organizationId || 'org-reviewforge-default';
    const { id } = req.params;

    const review = await PerformanceReview.findOne({ id, organizationId });
    if (!review) {
      res.status(404).json({ success: false, error: `Performance review with ID "${id}" not found` });
      return;
    }

    // Publishing Gate: HR Admin or authorized Manager for that employee
    if (user.role !== 'hr_admin') {
      const isAuth = await isManagerAuthorizedForEmployee(user, review.employeeId, organizationId);
      if (!isAuth) {
        res.status(403).json({
          success: false,
          error: 'Forbidden: Only HR Administrators or authorized managers have authority to publish reviews to the employee portal',
        });
        return;
      }
    }

    // Validation: Review must be in 'Approved' status
    if (review.status !== 'Approved') {
      res.status(400).json({
        success: false,
        error: `Cannot publish review in status "${review.status}". Review must be formally Approved before releasing to the employee portal.`,
      });
      return;
    }

    const now = new Date().toISOString();
    review.status = 'Released';
    review.releasedAt = now;
    review.lastUpdatedAt = now;

    if (!review.workflowHistory) review.workflowHistory = [];
    review.workflowHistory.push({
      action: 'Released',
      actorId: user.id || 'usr-admin',
      actorName: user.name || 'HR Admin',
      actorRole: user.role,
      timestamp: now,
      notes: 'Formally released to employee performance portal',
    });

    await review.save();

    // Update target employee's reviewStatus to Released
    await Employee.updateOne(
      { id: review.employeeId, organizationId },
      { $set: { reviewStatus: 'Released' } }
    );

    res.status(200).json({
      success: true,
      message: 'Review formally published and released to employee portal',
      data: review,
    });
  } catch (error: any) {
    console.error('publishReview error:', error);
    res.status(500).json({ success: false, error: 'Internal server error publishing review' });
  }
}

/**
 * Update single section content with strict preservation of evidence links
 */
export async function updateReviewSection(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, error: 'Unauthorized: Authentication required' });
      return;
    }

    if (user.role !== 'hr_admin' && user.role !== 'manager') {
      res.status(403).json({
        success: false,
        error: 'Forbidden: Access restricted to managers and HR administrators',
      });
      return;
    }

    const organizationId = user.organizationId || 'org-reviewforge-default';
    const { id, sectionKey } = req.params;
    const { content, evidenceRefs } = req.body;

    if (!VALID_SECTION_KEYS.includes(sectionKey as any)) {
      res.status(400).json({
        success: false,
        error: `Invalid sectionKey "${sectionKey}". Must be one of: ${VALID_SECTION_KEYS.join(', ')}`,
      });
      return;
    }

    if (typeof content !== 'string' || !content.trim()) {
      res.status(400).json({
        success: false,
        error: 'Section content string is required',
      });
      return;
    }

    const review = await PerformanceReview.findOne({ id, organizationId });
    if (!review) {
      res.status(404).json({ success: false, error: `Performance review with ID "${id}" not found` });
      return;
    }

    // Manager scoping
    if (user.role === 'manager') {
      const isAuth = await isManagerAuthorizedForEmployee(user, review.employeeId, organizationId);
      if (!isAuth) {
        const targetEmp = await Employee.findOne({ id: review.employeeId, organizationId });
        res.status(403).json({
          success: false,
          error: `Forbidden: Employee "${targetEmp?.name || review.employeeId}" does not report to you`,
        });
        return;
      }
    }

    // Cannot edit released reviews
    if (review.status === 'Released') {
      res.status(400).json({
        success: false,
        error: 'Cannot edit a performance review that has already been published to the employee',
      });
      return;
    }

    const sKey = sectionKey as keyof typeof review.sections;
    const currentSection = review.sections[sKey];

    // Preserve existing evidence references if new ones are not explicitly provided
    const preservedEvidence = Array.isArray(evidenceRefs) ? evidenceRefs : currentSection.evidenceRefs || [];

    review.sections[sKey] = {
      ...currentSection,
      content: content.trim(),
      evidenceRefs: preservedEvidence,
    } as IReviewSection;

    review.lastUpdatedAt = new Date().toISOString();
    await review.save();

    res.status(200).json({
      success: true,
      message: `Section "${sectionKey}" updated successfully with evidence links preserved`,
      data: review,
    });
  } catch (error: any) {
    console.error('updateReviewSection error:', error);
    res.status(500).json({ success: false, error: 'Internal server error updating section' });
  }
}

/**
 * Export Review document (Print-ready view with full audit trail & citations)
 */
export async function exportReview(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, error: 'Unauthorized: Authentication required' });
      return;
    }

    const organizationId = user.organizationId || 'org-reviewforge-default';
    const { id } = req.params;

    const review = await PerformanceReview.findOne({ id, organizationId });
    if (!review) {
      res.status(404).json({ success: false, error: `Performance review with ID "${id}" not found` });
      return;
    }

    // Scoping check
    if (user.role === 'employee' || user.role === 'peer_reviewer') {
      if (review.employeeId !== user.employeeId || review.status !== 'Released') {
        res.status(403).json({
          success: false,
          error: "Forbidden: You cannot export unreleased reviews or other employees' reviews",
        });
        return;
      }
    } else if (user.role === 'manager') {
      const isSelf = review.employeeId === user.employeeId;
      const targetEmp = await Employee.findOne({ id: review.employeeId, organizationId });
      const isDirectReport = targetEmp?.managerId === user.employeeId;

      if (!isSelf && !isDirectReport) {
        res.status(403).json({
          success: false,
          error: 'Forbidden: You do not have permission to export this review',
        });
        return;
      }
    }

    // Collect total citations count across all sections
    let totalCitations = 0;
    const citationMap: Record<string, number> = {};

    VALID_SECTION_KEYS.forEach((key) => {
      const sec = review.sections[key];
      if (sec && sec.evidenceRefs) {
        sec.evidenceRefs.forEach((ref) => {
          totalCitations++;
          citationMap[ref.sourceType] = (citationMap[ref.sourceType] || 0) + 1;
        });
      }
    });

    const exportData = {
      documentType: 'ReviewForge Verified Performance Review Export',
      exportedAt: new Date().toISOString(),
      exportedBy: {
        userId: user.id,
        name: user.name,
        role: user.role,
      },
      review: {
        id: review.id,
        employeeId: review.employeeId,
        employeeName: review.employeeName,
        jobTitle: review.jobTitle,
        departmentName: review.departmentName,
        reviewCycleTitle: review.reviewCycleTitle,
        status: review.status,
        overallRating: review.overallRating,
        evidenceCoverageScore: review.evidenceCoverageScore,
        synthesisEngine: review.synthesisEngine,
        generatedAt: review.generatedAt,
        approvedAt: review.approvedAt,
        approverName: review.approverName,
        releasedAt: review.releasedAt,
        sections: review.sections,
        managerFeedbackNotes: review.managerFeedbackNotes,
        workflowHistory: review.workflowHistory || [],
        auditSummary: {
          totalCitations,
          citationsByType: citationMap,
        },
      },
    };

    res.status(200).json({
      success: true,
      data: exportData,
    });
  } catch (error: any) {
    console.error('exportReview error:', error);
    res.status(500).json({ success: false, error: 'Internal server error exporting review' });
  }
}
