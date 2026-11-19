import { Request, Response, NextFunction } from 'express';
import { Employee, IEmployee } from '../models/Employee.js';
import { Department, IDepartment } from '../models/Department.js';
import { ReviewCycle } from '../models/ReviewCycle.js';
import { PerformanceReview, IPerformanceReview } from '../models/PerformanceReview.js';
import { FeedbackItem, IFeedbackItem } from '../models/Feedback.js';
import { FeedbackRequest, IFeedbackRequest } from '../models/FeedbackRequest.js';
import { OKR, IOKR } from '../models/OKR.js';
import { SelfReflection } from '../models/SelfReflection.js';
import { AISynthesisLog } from '../models/AISynthesisLog.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * GET /api/v1/analytics/dashboard
 * Role-scoped real-time dashboard metrics
 */
export async function getDashboardMetrics(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      throw new AppError('Authentication required.', 401);
    }

    const organizationId = user.organizationId;
    const role = user.role;
    const employeeId = user.employeeId;

    // 1. HR Administrator Dashboard
    if (role === 'hr_admin') {
      const [
        totalEmployees,
        departments,
        activeCycle,
        reviewStatusCounts,
        okrStats,
        feedbackRequestStats,
        feedbackSubmissionsCount,
        pendingApprovals,
        attentionEmployees,
      ] = await Promise.all([
        Employee.countDocuments({ organizationId, isDeactivated: { $ne: true } }),
        Department.find({ organizationId }).lean(),
        ReviewCycle.findOne({ organizationId, status: 'Active' }).sort({ startDate: -1 }).lean(),
        PerformanceReview.aggregate([
          { $match: { organizationId } },
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ]),
        OKR.aggregate([
          { $match: { organizationId } },
          { $group: { _id: null, avgProgress: { $avg: '$overallProgress' }, totalOkrs: { $sum: 1 } } },
        ]),
        FeedbackRequest.aggregate([
          { $match: { organizationId } },
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ]),
        FeedbackItem.countDocuments({ organizationId, status: 'Submitted' }),
        PerformanceReview.find({ organizationId, status: 'Pending Approval' })
          .select('id employeeId employeeName reviewCycleId status updatedAt')
          .limit(10)
          .lean(),
        Employee.find({
          organizationId,
          reviewStatus: { $in: ['Not Started', 'In Progress'] },
          isDeactivated: { $ne: true },
        })
          .select('id name employeeNumber jobTitle departmentName reviewStatus')
          .limit(6)
          .lean(),
      ]);

      // Calculate status breakdown
      const statusMap: Record<string, number> = {
        Draft: 0,
        'Pending Approval': 0,
        'Changes Requested': 0,
        Approved: 0,
        Released: 0,
      };
      let totalReviews = 0;
      for (const item of reviewStatusCounts) {
        statusMap[item._id] = item.count;
        totalReviews += item.count;
      }

      const completedReviews = (statusMap['Approved'] || 0) + (statusMap['Released'] || 0);
      const completionPercentage = totalEmployees > 0 ? Math.round((completedReviews / totalEmployees) * 100) : 0;
      const avgOkrScore = okrStats.length > 0 ? Math.round(okrStats[0].avgProgress || 0) : 0;

      // Feedback request stats
      let totalFeedbackRequests = 0;
      let completedFeedbackRequests = 0;
      for (const item of feedbackRequestStats) {
        totalFeedbackRequests += item.count;
        if (item._id === 'Completed') {
          completedFeedbackRequests += item.count;
        }
      }
      const feedbackParticipationRate =
        totalFeedbackRequests > 0
          ? Math.round((completedFeedbackRequests / totalFeedbackRequests) * 100)
          : 0;

      // Department comparisons
      const departmentStats = await Promise.all(
        departments.map(async (dept: any) => {
          const deptEmployees = await Employee.find({
            organizationId,
            departmentId: dept.id,
            isDeactivated: { $ne: true },
          }).select('id');
          const deptEmpIds = deptEmployees.map((e) => e.id);

          const deptReviews = await PerformanceReview.countDocuments({
            organizationId,
            employeeId: { $in: deptEmpIds },
            status: { $in: ['Approved', 'Released'] },
          });

          const deptOkrAgg = await OKR.aggregate([
            { $match: { organizationId, employeeId: { $in: deptEmpIds } } },
            { $group: { _id: null, avgProgress: { $avg: '$overallProgress' } } },
          ]);

          const count = deptEmpIds.length;
          const rate = count > 0 ? Math.round((deptReviews / count) * 100) : 0;
          const okrAvg = deptOkrAgg.length > 0 ? Math.round(deptOkrAgg[0].avgProgress || 0) : dept.averageOkrCompletion || 0;

          return {
            id: dept.id,
            name: dept.name,
            headName: dept.headName,
            employeeCount: count,
            completedReviews: deptReviews,
            completionRate: rate,
            averageOkrCompletion: okrAvg,
          };
        })
      );

      res.status(200).json({
        success: true,
        data: {
          role: 'hr_admin',
          summary: {
            totalEmployees,
            activeCycle: activeCycle || null,
            completedReviews,
            pendingReviews: (statusMap['Draft'] || 0) + (statusMap['Pending Approval'] || 0),
            completionPercentage,
            avgOkrScore,
            feedbackSubmissionsCount,
            totalFeedbackRequests,
            completedFeedbackRequests,
            feedbackParticipationRate,
          },
          statusBreakdown: {
            draft: statusMap['Draft'] || 0,
            pendingApproval: statusMap['Pending Approval'] || 0,
            changesRequested: statusMap['Changes Requested'] || 0,
            approved: statusMap['Approved'] || 0,
            released: statusMap['Released'] || 0,
            totalReviews,
          },
          departmentStats,
          pendingApprovalsQueue: pendingApprovals,
          attentionEmployees,
        },
      });
      return;
    }

    // 2. Manager Dashboard
    if (role === 'manager') {
      // Find direct reports
      const directReports = await Employee.find({
        organizationId,
        managerId: employeeId,
        isDeactivated: { $ne: true },
      })
        .select('id name employeeNumber jobTitle departmentName reviewStatus')
        .lean();

      const reportIds = directReports.map((e) => e.id);

      const [teamReviews, teamOkrAgg, teamFeedbackRequests, activeCycle] = await Promise.all([
        PerformanceReview.find({ organizationId, employeeId: { $in: reportIds } }).lean(),
        OKR.aggregate([
          { $match: { organizationId, employeeId: { $in: reportIds } } },
          { $group: { _id: null, avgProgress: { $avg: '$overallProgress' }, count: { $sum: 1 } } },
        ]),
        FeedbackRequest.find({ organizationId, targetEmployeeId: { $in: reportIds } }).lean(),
        ReviewCycle.findOne({ organizationId, status: 'Active' }).sort({ startDate: -1 }).lean(),
      ]);

      const statusMap: Record<string, number> = {
        Draft: 0,
        'Pending Approval': 0,
        'Changes Requested': 0,
        Approved: 0,
        Released: 0,
      };

      for (const rev of teamReviews) {
        statusMap[rev.status] = (statusMap[rev.status] || 0) + 1;
      }

      const teamTotal = directReports.length;
      const teamCompleted = (statusMap['Approved'] || 0) + (statusMap['Released'] || 0);
      const teamCompletionRate = teamTotal > 0 ? Math.round((teamCompleted / teamTotal) * 100) : 0;
      const teamAvgOkr = teamOkrAgg.length > 0 ? Math.round(teamOkrAgg[0].avgProgress || 0) : 0;

      // Manager action queue: reviews pending manager sign-off or changes requested
      const managerActionQueue = teamReviews.filter(
        (r: any) => r.status === 'Pending Approval' || r.status === 'Draft' || r.status === 'Changes Requested'
      );

      const teamRequestsCompleted = teamFeedbackRequests.filter((r: any) => r.status === 'Completed').length;
      const teamFeedbackRate =
        teamFeedbackRequests.length > 0
          ? Math.round((teamRequestsCompleted / teamFeedbackRequests.length) * 100)
          : 0;

      res.status(200).json({
        success: true,
        data: {
          role: 'manager',
          managerEmployeeId: employeeId,
          activeCycle: activeCycle || null,
          teamSummary: {
            totalReports: teamTotal,
            completedReviews: teamCompleted,
            pendingReviews: (statusMap['Draft'] || 0) + (statusMap['Pending Approval'] || 0),
            teamCompletionRate,
            teamAvgOkr,
            teamFeedbackRequestsCount: teamFeedbackRequests.length,
            teamFeedbackCompletedCount: teamRequestsCompleted,
            teamFeedbackRate,
          },
          statusBreakdown: {
            draft: statusMap['Draft'] || 0,
            pendingApproval: statusMap['Pending Approval'] || 0,
            changesRequested: statusMap['Changes Requested'] || 0,
            approved: statusMap['Approved'] || 0,
            released: statusMap['Released'] || 0,
            totalReviews: teamReviews.length,
          },
          directReports,
          actionQueue: managerActionQueue,
        },
      });
      return;
    }

    // 3. Employee Dashboard
    if (role === 'employee') {
      const [employee, activeCycle, personalReview, selfReflection, okrs, assignedRequests] =
        await Promise.all([
          Employee.findOne({ organizationId, id: employeeId }).lean(),
          ReviewCycle.findOne({ organizationId, status: 'Active' }).sort({ startDate: -1 }).lean(),
          PerformanceReview.findOne({ organizationId, employeeId }).lean(),
          SelfReflection.findOne({ organizationId, employeeId }).lean(),
          OKR.find({ organizationId, employeeId }).lean(),
          FeedbackRequest.find({ organizationId, reviewerEmployeeId: employeeId }).lean(),
        ]);

      const okrCount = okrs.length;
      const okrAvg =
        okrCount > 0 ? Math.round(okrs.reduce((acc, curr) => acc + (curr.overallProgress || 0), 0) / okrCount) : 0;

      const pendingFeedbackRequests = assignedRequests.filter((r: any) => r.status === 'Pending');
      const completedFeedbackRequests = assignedRequests.filter((r: any) => r.status === 'Completed');

      // CRITICAL SECURITY RULE: Employees can only view full review details if status is Released.
      let sanitizedReview = null;
      if (personalReview) {
        if (personalReview.status === 'Released') {
          sanitizedReview = personalReview;
        } else {
          sanitizedReview = {
            id: personalReview.id,
            employeeId: personalReview.employeeId,
            reviewCycleId: personalReview.reviewCycleId,
            status: personalReview.status,
            isReleased: false,
          };
        }
      }

      res.status(200).json({
        success: true,
        data: {
          role: 'employee',
          employee,
          activeCycle: activeCycle || null,
          reviewStatus: employee?.reviewStatus || 'Not Started',
          personalReview: sanitizedReview,
          selfReflectionStatus: {
            isSubmitted: !!selfReflection,
            submittedAt: selfReflection?.submittedAt || null,
          },
          okrSummary: {
            totalOkrs: okrCount,
            averageProgress: okrAvg,
            okrs: okrs.slice(0, 5),
          },
          peerReviewAssignments: {
            totalAssigned: assignedRequests.length,
            pendingCount: pendingFeedbackRequests.length,
            completedCount: completedFeedbackRequests.length,
            pendingRequests: pendingFeedbackRequests,
          },
        },
      });
      return;
    }

    // 4. Peer Reviewer Dashboard
    if (role === 'peer_reviewer') {
      const [activeCycle, assignedRequests, submittedFeedback] = await Promise.all([
        ReviewCycle.findOne({ organizationId, status: 'Active' }).sort({ startDate: -1 }).lean(),
        FeedbackRequest.find({ organizationId, reviewerEmployeeId: employeeId }).lean(),
        FeedbackItem.find({ organizationId, providerEmployeeId: employeeId }).lean(),
      ]);

      const pending = assignedRequests.filter((r: any) => r.status === 'Pending');
      const completed = assignedRequests.filter((r: any) => r.status === 'Completed');
      const rate = assignedRequests.length > 0 ? Math.round((completed.length / assignedRequests.length) * 100) : 0;

      res.status(200).json({
        success: true,
        data: {
          role: 'peer_reviewer',
          activeCycle: activeCycle || null,
          summary: {
            totalAssigned: assignedRequests.length,
            pendingCount: pending.length,
            completedCount: completed.length,
            completionRate: rate,
            feedbackSubmittedCount: submittedFeedback.length,
          },
          pendingAssignments: pending,
          completedAssignments: completed,
        },
      });
      return;
    }

    res.status(403).json({ success: false, message: 'Unrecognized user role.' });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/analytics/summary
 * Detailed organizational analytics: department comparisons, competency rubric averages, and cycle statistics
 */
export async function getAnalyticsSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      throw new AppError('Authentication required.', 401);
    }

    // Only HR Admin and Manager can access aggregate analytics
    if (user.role !== 'hr_admin' && user.role !== 'manager') {
      throw new AppError('Access denied: Unauthorized role for talent analytics.', 403);
    }

    const organizationId = user.organizationId;
    const { reviewCycleId, departmentId } = req.query;

    const empFilter: Record<string, any> = { organizationId, isDeactivated: { $ne: true } };
    if (departmentId && departmentId !== 'all') {
      empFilter.departmentId = departmentId;
    }

    // If manager, scope to direct reports or department
    if (user.role === 'manager') {
      const directReports = await Employee.find({
        organizationId,
        managerId: user.employeeId,
        isDeactivated: { $ne: true },
      }).select('id');
      const reportIds = directReports.map((e) => e.id);
      empFilter.$or = [{ managerId: user.employeeId }, { id: { $in: reportIds } }, { id: user.employeeId }];
    }

    const employees = await Employee.find(empFilter).select('id name departmentId departmentName').lean();
    const employeeIds = employees.map((e) => e.id);

    // Filter reviews
    const reviewFilter: Record<string, any> = { organizationId, employeeId: { $in: employeeIds } };
    if (reviewCycleId && reviewCycleId !== 'all') {
      reviewFilter.reviewCycleId = reviewCycleId;
    }

    const [reviews, okrAgg, feedbackItems, feedbackRequests, departments, synthesisLogs] = await Promise.all([
      PerformanceReview.find(reviewFilter).lean(),
      OKR.aggregate([
        { $match: { organizationId, employeeId: { $in: employeeIds } } },
        { $group: { _id: null, avgProgress: { $avg: '$overallProgress' }, totalOkrs: { $sum: 1 } } },
      ]),
      FeedbackItem.find({ organizationId, targetEmployeeId: { $in: employeeIds } }).lean(),
      FeedbackRequest.find({ organizationId, targetEmployeeId: { $in: employeeIds } }).lean(),
      Department.find({ organizationId }).lean(),
      AISynthesisLog.aggregate([
        { $match: { organizationId, status: 'success' } },
        {
          $group: {
            _id: null,
            avgCoverage: { $avg: '$coverageScore' },
            avgLatency: { $avg: '$latencyMs' },
            totalSyntheses: { $sum: 1 },
          },
        },
      ]),
    ]);

    // Review status counts
    const statusCounts = {
      draft: reviews.filter((r: any) => r.status === 'Draft').length,
      pendingApproval: reviews.filter((r: any) => r.status === 'Pending Approval').length,
      changesRequested: reviews.filter((r: any) => r.status === 'Changes Requested').length,
      approved: reviews.filter((r: any) => r.status === 'Approved').length,
      released: reviews.filter((r: any) => r.status === 'Released').length,
    };

    const completedReviewsCount = statusCounts.approved + statusCounts.released;
    const totalEmployeesCount = employees.length;
    const completionRate = totalEmployeesCount > 0 ? Math.round((completedReviewsCount / totalEmployeesCount) * 100) : 0;
    const avgOkrProgress = okrAgg.length > 0 ? Math.round(okrAgg[0].avgProgress || 0) : 0;

    // Competency distributions from 360 Feedback
    let totalCollab = 0;
    let totalComm = 0;
    let totalProb = 0;
    let totalTech = 0;
    let totalLead = 0;
    const validRatings = feedbackItems.filter((f: any) => f.ratings);
    const validRatingsCount = validRatings.length;

    for (const f of validRatings as any[]) {
      totalCollab += f.ratings.collaboration || 0;
      totalComm += f.ratings.communication || 0;
      totalProb += f.ratings.problemSolving || 0;
      totalTech += f.ratings.technicalContribution || 0;
      totalLead += f.ratings.leadership || 0;
    }

    const n = Math.max(1, validRatingsCount);
    const competencies = [
      { name: 'Collaboration & Teamwork', score: Number((totalCollab / n).toFixed(1)), count: validRatingsCount },
      { name: 'Technical Depth & Quality', score: Number((totalTech / n).toFixed(1)), count: validRatingsCount },
      { name: 'Analytical Problem Solving', score: Number((totalProb / n).toFixed(1)), count: validRatingsCount },
      { name: 'Ownership & Delivery', score: Number((totalComm / n).toFixed(1)), count: validRatingsCount },
      { name: 'Leadership & Mentorship', score: Number((totalLead / n).toFixed(1)), count: validRatingsCount },
    ];

    // Department comparisons
    const deptStats = await Promise.all(
      departments.map(async (d: any) => {
        const deptEmployees = employees.filter((e) => e.departmentId === d.id);
        const deptEmpIds = deptEmployees.map((e) => e.id);

        const deptCompleted = reviews.filter(
          (r: any) => deptEmpIds.includes(r.employeeId) && (r.status === 'Approved' || r.status === 'Released')
        ).length;

        const deptOkrs = await OKR.aggregate([
          { $match: { organizationId, employeeId: { $in: deptEmpIds } } },
          { $group: { _id: null, avgProgress: { $avg: '$overallProgress' } } },
        ]);

        const deptFeedbackCount = feedbackItems.filter((f: any) => deptEmpIds.includes(f.targetEmployeeId)).length;

        const rate = deptEmployees.length > 0 ? Math.round((deptCompleted / deptEmployees.length) * 100) : 0;
        const okrRate = deptOkrs.length > 0 ? Math.round(deptOkrs[0].avgProgress || 0) : d.averageOkrCompletion || 0;

        return {
          id: d.id,
          name: d.name,
          employeeCount: deptEmployees.length,
          completedReviews: deptCompleted,
          completionRate: rate,
          averageOkrProgress: okrRate,
          feedbackCount: deptFeedbackCount,
        };
      })
    );

    // Reviewer participation
    const completedRequestsCount = feedbackRequests.filter((r: any) => r.status === 'Completed').length;
    const participationRate =
      feedbackRequests.length > 0 ? Math.round((completedRequestsCount / feedbackRequests.length) * 100) : 0;

    res.status(200).json({
      success: true,
      data: {
        totalEmployees: totalEmployeesCount,
        completedReviewsCount,
        completionRate,
        averageOkrProgress: avgOkrProgress,
        statusBreakdown: statusCounts,
        departmentStats: deptStats,
        competencies,
        feedbackParticipation: {
          totalRequests: feedbackRequests.length,
          completedRequests: completedRequestsCount,
          participationRate,
          totalFeedbackItems: feedbackItems.length,
        },
        aiQuality: {
          averageCoverage: synthesisLogs.length > 0 ? Math.round(synthesisLogs[0].avgCoverage || 0) : 92,
          totalSyntheses: synthesisLogs.length > 0 ? synthesisLogs[0].totalSyntheses : 0,
          averageLatencyMs: synthesisLogs.length > 0 ? Math.round(synthesisLogs[0].avgLatency || 0) : 1850,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/analytics/export
 * Exports analytics data in CSV or JSON report format
 */
export async function exportAnalytics(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      throw new AppError('Authentication required.', 401);
    }

    if (user.role !== 'hr_admin' && user.role !== 'manager') {
      throw new AppError('Access denied: Unauthorized to export analytics.', 403);
    }

    const organizationId = user.organizationId;
    const format = req.query.format === 'csv' ? 'csv' : 'json';

    const [departments, employees, reviews, okrAgg] = await Promise.all([
      Department.find({ organizationId }).lean(),
      Employee.find({ organizationId, isDeactivated: { $ne: true } }).lean(),
      PerformanceReview.find({ organizationId }).lean(),
      OKR.aggregate([
        { $match: { organizationId } },
        { $group: { _id: '$departmentId', avgProgress: { $avg: '$overallProgress' } } },
      ]),
    ]);

    const okrMap: Record<string, number> = {};
    for (const item of okrAgg) {
      if (item._id) {
        okrMap[item._id] = Math.round(item.avgProgress || 0);
      }
    }

    const reportRows = departments.map((dept: any) => {
      const deptEmployees = employees.filter((e) => e.departmentId === dept.id);
      const deptEmpIds = deptEmployees.map((e) => e.id);
      const completed = reviews.filter(
        (r: any) => deptEmpIds.includes(r.employeeId) && (r.status === 'Approved' || r.status === 'Released')
      ).length;
      const rate = deptEmployees.length > 0 ? Math.round((completed / deptEmployees.length) * 100) : 0;
      const okr = okrMap[dept.id] !== undefined ? okrMap[dept.id] : dept.averageOkrCompletion || 0;

      return {
        departmentId: dept.id,
        departmentName: dept.name,
        headName: dept.headName,
        totalEmployees: deptEmployees.length,
        completedReviews: completed,
        completionRate: rate,
        averageOkrProgress: okr,
      };
    });

    if (format === 'csv') {
      const headers = ['Department ID,Department Name,Department Head,Total Employees,Completed Reviews,Completion Rate %,Average OKR Progress %'];
      const rows = reportRows.map(
        (r) => `"${r.departmentId}","${r.departmentName}","${r.headName}",${r.totalEmployees},${r.completedReviews},${r.completionRate}%,${r.averageOkrProgress}%`
      );
      const csvContent = [headers, ...rows].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="talent-analytics-report.csv"');
      res.status(200).send(csvContent);
      return;
    }

    // JSON format
    const totalEmployees = employees.length;
    const completedTotal = reviews.filter((r: any) => r.status === 'Approved' || r.status === 'Released').length;
    const overallRate = totalEmployees > 0 ? Math.round((completedTotal / totalEmployees) * 100) : 0;

    res.status(200).json({
      success: true,
      data: {
        organizationId,
        generatedAt: new Date().toISOString(),
        generatedBy: user.email,
        summary: {
          totalEmployees,
          completedReviews: completedTotal,
          overallCompletionRate: overallRate,
          totalDepartments: departments.length,
        },
        departmentBreakdown: reportRows,
      },
    });
  } catch (error) {
    next(error);
  }
}
