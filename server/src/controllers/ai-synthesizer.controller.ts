import { Request, Response } from 'express';
import { AISynthesizerService } from '../services/ai-synthesizer.service.js';
import { Employee } from '../models/Employee.js';
import { ReviewCycle } from '../models/ReviewCycle.js';
import { OKR } from '../models/OKR.js';
import { FeedbackItem } from '../models/Feedback.js';
import { SelfReflection } from '../models/SelfReflection.js';
import { ManagerNote } from '../models/ManagerNote.js';
import { AISynthesisLog } from '../models/AISynthesisLog.js';

/**
 * Controller for AI Performance Review Synthesizer (Milestone 10)
 * Restricted to hr_admin and manager roles.
 * Employees and peer reviewers are strictly forbidden (HTTP 403).
 */
export async function synthesizeReview(req: Request, res: Response): Promise<void> {
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
    const { employeeId, reviewCycleId, regenerateSection, forceMock } = req.body;

    if (!employeeId || typeof employeeId !== 'string' || !employeeId.trim()) {
      res.status(400).json({ success: false, error: 'Target employeeId is required' });
      return;
    }

    if (!reviewCycleId || typeof reviewCycleId !== 'string' || !reviewCycleId.trim()) {
      res.status(400).json({ success: false, error: 'Review cycleId is required' });
      return;
    }

    const employee = await Employee.findOne({ id: employeeId.trim(), organizationId });
    if (!employee) {
      res.status(404).json({
        success: false,
        error: `Target employee with ID "${employeeId}" not found in organization`,
      });
      return;
    }

    const cycle = await ReviewCycle.findOne({ id: reviewCycleId.trim(), organizationId });
    if (!cycle) {
      res.status(404).json({
        success: false,
        error: `Review cycle with ID "${reviewCycleId}" not found in organization`,
      });
      return;
    }

    // Role-based scoping for managers
    if (user.role === 'manager') {
      if (!user.employeeId) {
        res.status(403).json({
          success: false,
          error: 'Forbidden: Manager account not linked to an employee record',
        });
        return;
      }

      if (employee.managerId !== user.employeeId) {
        res.status(403).json({
          success: false,
          error: `Forbidden: Employee "${employee.name}" does not report to you`,
        });
        return;
      }
    }

    const result = await AISynthesizerService.synthesizePerformanceReview({
      organizationId,
      employeeId: employeeId.trim(),
      reviewCycleId: reviewCycleId.trim(),
      actorId: user.id || 'usr-admin',
      actorRole: user.role,
      regenerateSection: regenerateSection ? String(regenerateSection).trim() : undefined,
      forceMock: Boolean(forceMock),
    });

    res.status(200).json({
      success: true,
      message: regenerateSection
        ? `Section "${regenerateSection}" regenerated successfully`
        : 'Performance review synthesized successfully',
      data: result.review,
      quality: result.quality,
      engine: result.engine,
    });
  } catch (error: any) {
    if (error.statusCode === 503 || error.code === 'AI_PROVIDER_UNAVAILABLE') {
      res.status(503).json({
        success: false,
        error: error.message,
        code: error.code || 'AI_PROVIDER_UNAVAILABLE',
      });
      return;
    }

    console.error('synthesizeReview error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error synthesizing performance review',
    });
  }
}

export async function getQualityCheck(req: Request, res: Response): Promise<void> {
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
    const { employeeId } = req.params;
    const { reviewCycleId } = req.query;

    const employee = await Employee.findOne({ id: employeeId, organizationId });
    if (!employee) {
      res.status(404).json({ success: false, error: `Employee "${employeeId}" not found` });
      return;
    }

    // Role-based scoping for managers
    if (user.role === 'manager' && employee.managerId !== user.employeeId) {
      res.status(403).json({
        success: false,
        error: 'Forbidden: You can only inspect quality for your direct reports',
      });
      return;
    }

    const cycleFilter: any = { organizationId, employeeId };
    if (reviewCycleId && typeof reviewCycleId === 'string') {
      cycleFilter.reviewCycleId = reviewCycleId;
    }

    const [selfReflection, feedback, managerNotes, okrs] = await Promise.all([
      SelfReflection.findOne(cycleFilter),
      FeedbackItem.find({
        organizationId,
        targetEmployeeId: employeeId,
        status: 'Submitted',
        ...(reviewCycleId ? { reviewCycleId } : {}),
      }),
      ManagerNote.find({ organizationId, employeeId }),
      OKR.find({ organizationId, employeeId }),
    ]);

    const quality = AISynthesizerService.evaluateEvidenceQuality(
      okrs,
      feedback,
      selfReflection,
      managerNotes
    );

    res.status(200).json({
      success: true,
      data: {
        employeeId,
        quality,
        evidenceCounts: {
          okrsCount: okrs.length,
          feedbackCount: feedback.length,
          hasSelfReflection: Boolean(selfReflection),
          managerNotesCount: managerNotes.length,
        },
      },
    });
  } catch (error: any) {
    console.error('getQualityCheck error:', error);
    res.status(500).json({ success: false, error: 'Internal server error evaluating quality' });
  }
}

export async function getSynthesisLogs(req: Request, res: Response): Promise<void> {
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
    const { employeeId } = req.params;

    const logs = await AISynthesisLog.find({ organizationId, employeeId }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: logs,
      count: logs.length,
    });
  } catch (error: any) {
    console.error('getSynthesisLogs error:', error);
    res.status(500).json({ success: false, error: 'Internal server error fetching synthesis logs' });
  }
}
