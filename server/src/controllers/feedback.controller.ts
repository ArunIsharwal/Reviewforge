import { Request, Response } from 'express';
import { z } from 'zod';
import { FeedbackItem, IFeedbackItem } from '../models/Feedback.js';
import { FeedbackRequest } from '../models/FeedbackRequest.js';
import { ReviewCycle } from '../models/ReviewCycle.js';
import { Employee } from '../models/Employee.js';

// Anonymity sanitization helper
export function maskFeedbackAnonymity(
  item: any,
  caller: any
): Record<string, any> {
  const plain = item.toObject ? item.toObject() : { ...item };

  if (!plain.isAnonymous) {
    return plain;
  }

  // HR Administrator retains compliance attribution oversight
  if (caller && caller.role === 'hr_admin') {
    return plain;
  }

  // The author/provider themselves can view what they submitted
  if (
    caller &&
    caller.employeeId &&
    plain.providerEmployeeId === caller.employeeId
  ) {
    return plain;
  }

  // Mask identity for recipient employees and other viewers
  return {
    ...plain,
    providerEmployeeId: null,
    providerEmployeeName: 'Anonymous Colleague',
    providerRole: 'Peer (Anonymized)',
  };
}

// Validation schemas
const submitFeedbackSchema = z.object({
  reviewCycleId: z.string().min(1, 'Review cycle ID is required'),
  targetEmployeeId: z.string().min(1, 'Target employee ID is required'),
  isAnonymous: z.boolean().optional().default(false),
  relationship: z
    .enum(['Peer', 'Direct Report', 'Manager', 'Cross-Functional'])
    .optional()
    .default('Peer'),
  ratings: z.object({
    collaboration: z.number().int().min(1).max(5),
    communication: z.number().int().min(1).max(5),
    problemSolving: z.number().int().min(1).max(5),
    technicalContribution: z.number().int().min(1).max(5),
    leadership: z.number().int().min(1).max(5),
  }),
  strengths: z.string().min(5, 'Key strengths must be at least 5 characters long'),
  improvements: z
    .string()
    .min(5, 'Areas for growth must be at least 5 characters long'),
  additionalComments: z.string().optional().default(''),
  requestId: z.string().optional(),
});

const createFeedbackRequestSchema = z.object({
  reviewCycleId: z.string().min(1, 'Review cycle ID is required'),
  targetEmployeeId: z.string().min(1, 'Target employee ID is required'),
  reviewerEmployeeId: z.string().min(1, 'Reviewer employee ID is required'),
  relationship: z
    .enum(['Peer', 'Direct Report', 'Manager', 'Cross-Functional'])
    .optional()
    .default('Peer'),
  dueDate: z.string().optional(),
  message: z.string().optional().default(''),
});

/**
 * GET /api/v1/feedback
 * List feedback items with role-based scoping and anonymity masking.
 */
export async function getFeedbackList(req: Request, res: Response): Promise<void> {
  try {
    const caller = req.user!;
    const organizationId = caller.organizationId || 'org-reviewforge-default';
    const { reviewCycleId, cycleId, targetEmployeeId, status, type } = req.query;

    const activeCycleId = (reviewCycleId || cycleId) as string | undefined;

    const filter: any = { organizationId };

    if (activeCycleId) {
      filter.reviewCycleId = activeCycleId;
    }
    if (status) {
      filter.status = status;
    }

    // Role-based visibility scoping
    if (caller.role === 'hr_admin') {
      if (targetEmployeeId) {
        filter.targetEmployeeId = targetEmployeeId;
      }
    } else if (caller.role === 'manager') {
      // Find direct reports for this manager
      const directReports = await Employee.find({
        organizationId,
        managerId: caller.employeeId,
      }).select('id');
      const directReportIds = directReports.map((d) => d.id);
      const allowedTargetIds = [...directReportIds, caller.employeeId];

      if (targetEmployeeId) {
        if (!allowedTargetIds.includes(targetEmployeeId as string)) {
          // If manager didn't provide this feedback and target is not direct report/self
          filter.$or = [
            { targetEmployeeId, providerEmployeeId: caller.employeeId },
          ];
        } else {
          filter.targetEmployeeId = targetEmployeeId;
        }
      } else {
        filter.$or = [
          { targetEmployeeId: { $in: allowedTargetIds } },
          { providerEmployeeId: caller.employeeId },
        ];
      }
    } else {
      // Employee or Peer Reviewer: can only see feedback targeted to them or provided by them
      const callerEmpId = caller.employeeId || 'emp-nonexistent';
      if (type === 'given') {
        filter.providerEmployeeId = callerEmpId;
      } else if (type === 'received') {
        filter.targetEmployeeId = callerEmpId;
      } else if (targetEmployeeId && targetEmployeeId !== callerEmpId) {
        // Can only see feedback they authored for this target
        filter.targetEmployeeId = targetEmployeeId;
        filter.providerEmployeeId = callerEmpId;
      } else {
        filter.$or = [
          { targetEmployeeId: callerEmpId },
          { providerEmployeeId: callerEmpId },
        ];
      }
    }

    const items = await FeedbackItem.find(filter).sort({ submittedAt: -1, createdAt: -1 });

    const maskedItems = items.map((item) => maskFeedbackAnonymity(item, caller));

    res.status(200).json({
      success: true,
      count: maskedItems.length,
      data: maskedItems,
    });
  } catch (error: any) {
    console.error('Error fetching feedback list:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve feedback list',
      details: error.message,
    });
  }
}

/**
 * GET /api/v1/feedback/:id
 * Retrieve a single feedback entry with anonymity masking.
 */
export async function getFeedbackById(req: Request, res: Response): Promise<void> {
  try {
    const caller = req.user!;
    const organizationId = caller.organizationId || 'org-reviewforge-default';
    const { id } = req.params;

    const item = await FeedbackItem.findOne({ id, organizationId });
    if (!item) {
      res.status(404).json({
        success: false,
        error: `Feedback entry with ID '${id}' not found`,
      });
      return;
    }

    // Authorization check
    if (caller.role !== 'hr_admin') {
      const isTarget = item.targetEmployeeId === caller.employeeId;
      const isProvider = item.providerEmployeeId === caller.employeeId;

      let isManager = false;
      if (caller.role === 'manager') {
        const targetEmployee = await Employee.findOne({
          id: item.targetEmployeeId,
          organizationId,
        });
        if (targetEmployee?.managerId === caller.employeeId) {
          isManager = true;
        }
      }

      if (!isTarget && !isProvider && !isManager) {
        res.status(403).json({
          success: false,
          error: 'Access denied: You are not authorized to view this feedback entry',
        });
        return;
      }
    }

    const sanitized = maskFeedbackAnonymity(item, caller);

    res.status(200).json({
      success: true,
      data: sanitized,
    });
  } catch (error: any) {
    console.error('Error fetching feedback by ID:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve feedback entry',
      details: error.message,
    });
  }
}

/**
 * POST /api/v1/feedback
 * Submit a 360-degree feedback review.
 */
export async function submitFeedback(req: Request, res: Response): Promise<void> {
  try {
    const caller = req.user!;
    const organizationId = caller.organizationId || 'org-reviewforge-default';

    const parseResult = submitFeedbackSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: 'Validation failed for feedback submission',
        details: parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      });
      return;
    }

    const {
      reviewCycleId,
      targetEmployeeId,
      isAnonymous,
      relationship,
      ratings,
      strengths,
      improvements,
      additionalComments,
      requestId,
    } = parseResult.data;

    // 1. Verify Review Cycle exists and is Active
    const cycle = await ReviewCycle.findOne({ id: reviewCycleId, organizationId });
    if (!cycle) {
      res.status(404).json({
        success: false,
        error: `Review cycle with ID '${reviewCycleId}' not found`,
      });
      return;
    }

    if (cycle.status !== 'Active') {
      res.status(400).json({
        success: false,
        error: `Feedback can only be submitted for active review cycles. Current cycle status is '${cycle.status}'.`,
      });
      return;
    }

    // 2. Verify Target Employee exists and is active
    const targetEmployee = await Employee.findOne({ id: targetEmployeeId, organizationId });
    if (!targetEmployee) {
      res.status(404).json({
        success: false,
        error: `Target employee with ID '${targetEmployeeId}' not found`,
      });
      return;
    }

    // 3. Self-feedback check
    if (caller.employeeId && caller.employeeId === targetEmployeeId) {
      res.status(400).json({
        success: false,
        error: 'Self-review as peer feedback is not allowed. Please submit a Self-Reflection instead.',
      });
      return;
    }

    // 4. Determine provider metadata
    const providerEmployeeId = caller.employeeId || null;
    let providerEmployeeName = caller.name;
    if (providerEmployeeId) {
      const providerEmp = await Employee.findOne({ id: providerEmployeeId, organizationId });
      if (providerEmp) {
        providerEmployeeName = providerEmp.name;
      }
    }

    const providerRoleLabel =
      relationship === 'Manager'
        ? 'Manager'
        : relationship === 'Direct Report'
        ? 'Direct Report'
        : relationship === 'Cross-Functional'
        ? 'Cross-Functional Partner'
        : 'Peer Reviewer';

    // 5. Generate unique feedback ID
    const feedbackId = `fb-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const newFeedback = new FeedbackItem({
      id: feedbackId,
      organizationId,
      reviewCycleId,
      targetEmployeeId,
      targetEmployeeName: targetEmployee.name,
      providerEmployeeId,
      providerEmployeeName,
      providerRole: providerRoleLabel,
      relationship,
      isAnonymous,
      ratings,
      strengths,
      improvements,
      additionalComments: additionalComments || '',
      submittedAt: new Date().toISOString().split('T')[0],
      status: 'Submitted',
      requestId: requestId || null,
    });

    await newFeedback.save();

    // 6. Automatically complete any matching pending FeedbackRequest
    if (providerEmployeeId) {
      const requestFilter: any = {
        organizationId,
        reviewCycleId,
        targetEmployeeId,
        reviewerEmployeeId: providerEmployeeId,
        status: 'Pending',
      };
      if (requestId) {
        requestFilter.id = requestId;
      }

      await FeedbackRequest.findOneAndUpdate(
        requestFilter,
        {
          status: 'Completed',
          submittedFeedbackId: feedbackId,
        },
        { new: true }
      );
    }

    res.status(201).json({
      success: true,
      message: '360° feedback submitted successfully',
      data: newFeedback,
    });
  } catch (error: any) {
    console.error('Error submitting feedback:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to submit feedback review',
      details: error.message,
    });
  }
}

/**
 * GET /api/v1/feedback/requests
 * List peer feedback requests with role-based scoping.
 */
export async function getFeedbackRequests(req: Request, res: Response): Promise<void> {
  try {
    const caller = req.user!;
    const organizationId = caller.organizationId || 'org-reviewforge-default';
    const { reviewCycleId, cycleId, status, type } = req.query;

    const activeCycleId = (reviewCycleId || cycleId) as string | undefined;

    const filter: any = { organizationId };
    if (activeCycleId) {
      filter.reviewCycleId = activeCycleId;
    }
    if (status) {
      filter.status = status;
    }

    if (caller.role === 'hr_admin') {
      // HR Admin can view all requests
    } else if (caller.role === 'manager') {
      const callerEmpId = caller.employeeId || 'emp-nonexistent';
      const directReports = await Employee.find({
        organizationId,
        managerId: callerEmpId,
      }).select('id');
      const directReportIds = directReports.map((d) => d.id);

      if (type === 'incoming') {
        filter.reviewerEmployeeId = callerEmpId;
      } else if (type === 'outgoing') {
        filter.requestedByEmployeeId = callerEmpId;
      } else {
        filter.$or = [
          { reviewerEmployeeId: callerEmpId },
          { requestedByEmployeeId: callerEmpId },
          { targetEmployeeId: { $in: directReportIds } },
        ];
      }
    } else {
      // Employee or Peer Reviewer
      const callerEmpId = caller.employeeId || 'emp-nonexistent';
      if (type === 'incoming') {
        filter.reviewerEmployeeId = callerEmpId;
      } else if (type === 'outgoing') {
        filter.requestedByEmployeeId = callerEmpId;
      } else {
        filter.$or = [
          { reviewerEmployeeId: callerEmpId },
          { requestedByEmployeeId: callerEmpId },
        ];
      }
    }

    const requests = await FeedbackRequest.find(filter).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: requests.length,
      data: requests,
    });
  } catch (error: any) {
    console.error('Error fetching feedback requests:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve feedback requests',
      details: error.message,
    });
  }
}

/**
 * POST /api/v1/feedback/requests
 * Create a new peer feedback request.
 */
export async function createFeedbackRequest(req: Request, res: Response): Promise<void> {
  try {
    const caller = req.user!;
    const organizationId = caller.organizationId || 'org-reviewforge-default';

    const parseResult = createFeedbackRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: 'Validation failed for feedback request creation',
        details: parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      });
      return;
    }

    const {
      reviewCycleId,
      targetEmployeeId,
      reviewerEmployeeId,
      relationship,
      dueDate,
      message,
    } = parseResult.data;

    // 1. Verify Active Review Cycle
    const cycle = await ReviewCycle.findOne({ id: reviewCycleId, organizationId });
    if (!cycle) {
      res.status(404).json({
        success: false,
        error: `Review cycle with ID '${reviewCycleId}' not found`,
      });
      return;
    }
    if (cycle.status !== 'Active') {
      res.status(400).json({
        success: false,
        error: `Feedback requests can only be sent during active review cycles. Current cycle status is '${cycle.status}'.`,
      });
      return;
    }

    // 2. Verify Target and Reviewer Employees exist
    const [targetEmployee, reviewerEmployee] = await Promise.all([
      Employee.findOne({ id: targetEmployeeId, organizationId }),
      Employee.findOne({ id: reviewerEmployeeId, organizationId }),
    ]);

    if (!targetEmployee) {
      res.status(404).json({
        success: false,
        error: `Target employee '${targetEmployeeId}' not found`,
      });
      return;
    }
    if (!reviewerEmployee) {
      res.status(404).json({
        success: false,
        error: `Reviewer employee '${reviewerEmployeeId}' not found`,
      });
      return;
    }

    // 3. Reviewer cannot be the target
    if (targetEmployeeId === reviewerEmployeeId) {
      res.status(400).json({
        success: false,
        error: 'Cannot request peer feedback from the employee being evaluated',
      });
      return;
    }

    // 4. Duplicate pending request check
    const existing = await FeedbackRequest.findOne({
      organizationId,
      reviewCycleId,
      targetEmployeeId,
      reviewerEmployeeId,
      status: 'Pending',
    });

    if (existing) {
      res.status(409).json({
        success: false,
        error: 'A pending feedback request already exists for this reviewer and target employee in this cycle.',
        existingRequestId: existing.id,
      });
      return;
    }

    const requestId = `fbr-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const newRequest = new FeedbackRequest({
      id: requestId,
      organizationId,
      reviewCycleId,
      targetEmployeeId,
      targetEmployeeName: targetEmployee.name,
      reviewerEmployeeId,
      reviewerEmployeeName: reviewerEmployee.name,
      requestedByEmployeeId: caller.employeeId || caller.id,
      requestedByName: caller.name,
      relationship,
      status: 'Pending',
      dueDate:
        dueDate ||
        (() => {
          const d = new Date();
          d.setDate(d.getDate() + 14);
          return d.toISOString().split('T')[0];
        })(),
      message: message || '',
    });

    await newRequest.save();

    res.status(201).json({
      success: true,
      message: 'Peer feedback request created successfully',
      data: newRequest,
    });
  } catch (error: any) {
    console.error('Error creating feedback request:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create feedback request',
      details: error.message,
    });
  }
}

/**
 * PATCH /api/v1/feedback/requests/:id/decline
 * Decline a peer feedback request.
 */
export async function declineFeedbackRequest(req: Request, res: Response): Promise<void> {
  try {
    const caller = req.user!;
    const organizationId = caller.organizationId || 'org-reviewforge-default';
    const { id } = req.params;

    const request = await FeedbackRequest.findOne({ id, organizationId });
    if (!request) {
      res.status(404).json({
        success: false,
        error: `Feedback request with ID '${id}' not found`,
      });
      return;
    }

    // Authorization: only the assigned reviewer or an HR admin can decline
    const isReviewer = caller.employeeId && caller.employeeId === request.reviewerEmployeeId;
    const isHr = caller.role === 'hr_admin';

    if (!isReviewer && !isHr) {
      res.status(403).json({
        success: false,
        error: 'Access denied: Only the assigned reviewer or HR Administrator can decline this request',
      });
      return;
    }

    if (request.status === 'Completed') {
      res.status(400).json({
        success: false,
        error: 'Cannot decline a feedback request that has already been completed',
      });
      return;
    }

    request.status = 'Declined';
    await request.save();

    res.status(200).json({
      success: true,
      message: 'Feedback request declined successfully',
      data: request,
    });
  } catch (error: any) {
    console.error('Error declining feedback request:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to decline feedback request',
      details: error.message,
    });
  }
}

/**
 * GET /api/v1/feedback/summary/:employeeId
 * Aggregate 360 feedback statistics and rubric dimension averages for an employee.
 */
export async function getFeedbackSummary(req: Request, res: Response): Promise<void> {
  try {
    const caller = req.user!;
    const organizationId = caller.organizationId || 'org-reviewforge-default';
    const { employeeId } = req.params;
    const { reviewCycleId, cycleId } = req.query;

    const activeCycleId = (reviewCycleId || cycleId) as string | undefined;

    // Authorization check
    if (caller.role !== 'hr_admin' && caller.employeeId !== employeeId) {
      let isManager = false;
      if (caller.role === 'manager') {
        const emp = await Employee.findOne({ id: employeeId, organizationId });
        if (emp?.managerId === caller.employeeId) {
          isManager = true;
        }
      }
      if (!isManager) {
        res.status(403).json({
          success: false,
          error: 'Access denied: You can only view feedback summaries for yourself or your direct reports',
        });
        return;
      }
    }

    const filter: any = {
      organizationId,
      targetEmployeeId: employeeId,
      status: 'Submitted',
    };
    if (activeCycleId) {
      filter.reviewCycleId = activeCycleId;
    }

    const items = await FeedbackItem.find(filter);

    if (items.length === 0) {
      res.status(200).json({
        success: true,
        data: {
          employeeId,
          totalReviews: 0,
          averageScore: 0,
          dimensionAverages: {
            collaboration: 0,
            communication: 0,
            problemSolving: 0,
            technicalContribution: 0,
            leadership: 0,
          },
          perspectiveBreakdown: {
            Peer: 0,
            DirectReport: 0,
            Manager: 0,
            CrossFunctional: 0,
          },
          anonymityStats: {
            anonymousCount: 0,
            publicCount: 0,
          },
        },
      });
      return;
    }

    // Accumulate sums
    let totalCollab = 0;
    let totalComm = 0;
    let totalProb = 0;
    let totalTech = 0;
    let totalLead = 0;
    let anonymousCount = 0;

    const perspectiveBreakdown: Record<string, number> = {
      Peer: 0,
      'Direct Report': 0,
      Manager: 0,
      'Cross-Functional': 0,
    };

    for (const item of items) {
      totalCollab += item.ratings.collaboration;
      totalComm += item.ratings.communication;
      totalProb += item.ratings.problemSolving;
      totalTech += item.ratings.technicalContribution;
      totalLead += item.ratings.leadership;

      if (item.isAnonymous) anonymousCount++;
      if (item.relationship && perspectiveBreakdown[item.relationship] !== undefined) {
        perspectiveBreakdown[item.relationship]++;
      }
    }

    const n = items.length;
    const avgCollab = Number((totalCollab / n).toFixed(2));
    const avgComm = Number((totalComm / n).toFixed(2));
    const avgProb = Number((totalProb / n).toFixed(2));
    const avgTech = Number((totalTech / n).toFixed(2));
    const avgLead = Number((totalLead / n).toFixed(2));

    const overallAverage = Number(
      ((avgCollab + avgComm + avgProb + avgTech + avgLead) / 5).toFixed(2)
    );

    res.status(200).json({
      success: true,
      data: {
        employeeId,
        totalReviews: n,
        averageScore: overallAverage,
        dimensionAverages: {
          collaboration: avgCollab,
          communication: avgComm,
          problemSolving: avgProb,
          technicalContribution: avgTech,
          leadership: avgLead,
        },
        perspectiveBreakdown: {
          Peer: perspectiveBreakdown['Peer'],
          DirectReport: perspectiveBreakdown['Direct Report'],
          Manager: perspectiveBreakdown['Manager'],
          CrossFunctional: perspectiveBreakdown['Cross-Functional'],
        },
        anonymityStats: {
          anonymousCount,
          publicCount: n - anonymousCount,
        },
      },
    });
  } catch (error: any) {
    console.error('Error calculating feedback summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to compute feedback summary',
      details: error.message,
    });
  }
}
