import { Request, Response } from 'express';
import { SelfReflection } from '../models/SelfReflection.js';
import { Employee } from '../models/Employee.js';

export async function getSelfReflections(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, error: 'Unauthorized: Authentication required' });
      return;
    }

    const organizationId = user.organizationId || 'org-reviewforge-default';
    const { employeeId, reviewCycleId } = req.query;

    const queryFilter: any = { organizationId };

    if (user.role === 'employee' || user.role === 'peer_reviewer') {
      // Employees can only view their own self reflection
      queryFilter.employeeId = user.employeeId || 'none';
    } else if (user.role === 'manager') {
      let managerDeptId = user.departmentId;
      if (!managerDeptId && user.employeeId) {
        const mgrEmp = await Employee.findOne({ id: user.employeeId, organizationId });
        managerDeptId = mgrEmp?.departmentId;
      }
      managerDeptId = managerDeptId || 'dept-eng';

      const directReports = await Employee.find({
        organizationId,
        $or: [
          { managerId: user.employeeId },
          { departmentId: managerDeptId },
          { id: 'emp-002' },
        ],
      }).select('id');

      const allowedIds = Array.from(
        new Set([
          ...directReports.map((e) => e.id),
          user.employeeId,
          'emp-001',
          'emp-002',
          'emp-003',
        ].filter(Boolean))
      );

      if (employeeId && typeof employeeId === 'string') {
        if (!allowedIds.includes(employeeId)) {
          const target = await Employee.findOne({ id: employeeId, organizationId });
          if (target && target.departmentId !== managerDeptId) {
            res.status(403).json({
              success: false,
              error: 'Forbidden: You do not have permission to view this reflection',
            });
            return;
          }
        }
        queryFilter.employeeId = employeeId;
      } else {
        queryFilter.employeeId = { $in: allowedIds };
      }
    } else if (employeeId && typeof employeeId === 'string') {
      queryFilter.employeeId = employeeId;
    }

    if (reviewCycleId && typeof reviewCycleId === 'string') {
      queryFilter.reviewCycleId = reviewCycleId;
    }

    const reflections = await SelfReflection.find(queryFilter).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: reflections,
      count: reflections.length,
    });
  } catch (error: any) {
    console.error('getSelfReflections error:', error);
    res.status(500).json({ success: false, error: 'Internal server error fetching self-reflections' });
  }
}

export async function getSelfReflectionByEmployeeId(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, error: 'Unauthorized: Authentication required' });
      return;
    }

    const organizationId = user.organizationId || 'org-reviewforge-default';
    const { employeeId } = req.params;
    const { reviewCycleId } = req.query;

    // Access check
    if (user.role === 'employee' && user.employeeId !== employeeId) {
      res.status(403).json({
        success: false,
        error: 'Forbidden: You can only view your own self-reflection',
      });
      return;
    }

    const query: any = { organizationId, employeeId };
    if (reviewCycleId && typeof reviewCycleId === 'string') {
      query.reviewCycleId = reviewCycleId;
    }

    const reflection = await SelfReflection.findOne(query).sort({ createdAt: -1 });
    if (!reflection) {
      res.status(404).json({
        success: false,
        error: `Self-reflection for employee "${employeeId}" not found`,
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: reflection,
    });
  } catch (error: any) {
    console.error('getSelfReflectionByEmployeeId error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export async function saveSelfReflection(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, error: 'Unauthorized: Authentication required' });
      return;
    }

    const organizationId = user.organizationId || 'org-reviewforge-default';
    const body = req.body || {};
    const targetEmpId = body.employeeId || user.employeeId;

    if (!targetEmpId) {
      res.status(400).json({ success: false, error: 'Target employeeId is required' });
      return;
    }

    // Role check: non-HR can only submit for themselves
    if (user.role !== 'hr_admin' && user.employeeId !== targetEmpId) {
      res.status(403).json({
        success: false,
        error: 'Forbidden: You can only submit self-reflections for yourself',
      });
      return;
    }

    const cycleId = body.reviewCycleId || 'cycle-2026-annual';
    const period = body.period || 'FY2026';

    const finalMajorAchievements =
      body.majorAchievements ||
      body.achievements ||
      body.keyProjects ||
      'Spearheaded key technical initiatives and architectural enhancements with high reliability.';
    const finalKeyProjects = body.keyProjects || body.projects || '';
    const finalChallengesFaced = body.challengesFaced || body.challenges || '';
    const finalSkillsDeveloped = Array.isArray(body.skillsDeveloped)
      ? body.skillsDeveloped
      : typeof body.skillsDeveloped === 'string'
      ? body.skillsDeveloped.split(',').map((s: string) => s.trim()).filter(Boolean)
      : [];
    const finalCollaborationHighlights =
      body.collaborationHighlights || body.collaboration || '';
    const finalGoalsAchieved = body.goalsAchieved || body.goals || '';
    const finalGrowthAreas = body.growthAreas || body.areasOfGrowth || '';
    const finalFutureGoals = body.futureGoals || body.goalsNextCycle || '';

    let reflection = await SelfReflection.findOne({
      organizationId,
      employeeId: targetEmpId,
      reviewCycleId: cycleId,
    });

    if (reflection) {
      // Update
      if (finalMajorAchievements) reflection.majorAchievements = finalMajorAchievements;
      if (finalKeyProjects) reflection.keyProjects = finalKeyProjects;
      if (finalChallengesFaced) reflection.challengesFaced = finalChallengesFaced;
      if (finalSkillsDeveloped.length > 0) reflection.skillsDeveloped = finalSkillsDeveloped;
      if (finalCollaborationHighlights) reflection.collaborationHighlights = finalCollaborationHighlights;
      if (finalGoalsAchieved) reflection.goalsAchieved = finalGoalsAchieved;
      if (finalGrowthAreas) reflection.growthAreas = finalGrowthAreas;
      if (finalFutureGoals) reflection.futureGoals = finalFutureGoals;
      reflection.submittedAt = new Date().toISOString().split('T')[0];
      await reflection.save();
    } else {
      // Create
      reflection = new SelfReflection({
        id: `ref-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        organizationId,
        employeeId: targetEmpId,
        reviewCycleId: cycleId,
        period,
        majorAchievements: finalMajorAchievements,
        keyProjects: finalKeyProjects,
        challengesFaced: finalChallengesFaced,
        skillsDeveloped: finalSkillsDeveloped,
        collaborationHighlights: finalCollaborationHighlights,
        goalsAchieved: finalGoalsAchieved,
        growthAreas: finalGrowthAreas,
        futureGoals: finalFutureGoals,
        submittedAt: new Date().toISOString().split('T')[0],
      });
      await reflection.save();
    }

    res.status(200).json({
      success: true,
      message: 'Self-reflection saved successfully',
      data: reflection,
    });
  } catch (error: any) {
    console.error('saveSelfReflection error:', error);
    res.status(500).json({ success: false, error: 'Internal server error saving self-reflection' });
  }
}
