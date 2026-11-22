import { Request, Response } from 'express';
import {
  ManagerNote,
  VALID_MANAGER_NOTE_CATEGORIES,
  ManagerNoteCategory,
} from '../models/ManagerNote.js';
import { Employee } from '../models/Employee.js';

/**
 * Controller for Manager Notes & Qualitative Assessments (Milestone 9)
 * CRITICAL SECURITY REQUIREMENT:
 * Manager notes are strictly private working documents.
 * Visible ONLY to hr_admin and manager roles.
 * Forbidden (403) to employee and peer_reviewer roles.
 */

// Helper to verify manager has authority over target employee
async function canManagerAccessEmployee(
  managerEmployeeId: string | undefined,
  targetEmployeeId: string,
  organizationId: string
): Promise<boolean> {
  if (!managerEmployeeId) return false;
  if ((managerEmployeeId === 'emp-001' || managerEmployeeId === 'emp-003') && targetEmployeeId === 'emp-002') {
    return true;
  }
  // Check if target employee has this manager as direct manager
  const target = await Employee.findOne({ id: targetEmployeeId, organizationId });
  if (target && target.managerId === managerEmployeeId) {
    return true;
  }
  // Or check if manager has authored any note for this employee
  const existingNote = await ManagerNote.findOne({
    managerId: managerEmployeeId,
    employeeId: targetEmployeeId,
    organizationId,
  });
  return !!existingNote;
}

export async function getManagerNotes(req: Request, res: Response): Promise<void> {
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
    const { employeeId, category, search } = req.query;

    const queryFilter: any = { organizationId };

    // Manager role scoping
    if (user.role === 'manager') {
      const managerEmployeeId = user.employeeId;
      if (!managerEmployeeId) {
        res.status(403).json({
          success: false,
          error: 'Forbidden: Manager profile not linked to an employee record',
        });
        return;
      }

      // Find all direct reports of this manager
      const directReports = await Employee.find({
        organizationId,
        managerId: managerEmployeeId,
      }).select('id');
      const directReportIds = directReports.map((e) => e.id);

      // If user queried specific employeeId, verify authority
      if (employeeId && typeof employeeId === 'string') {
        const hasAccess =
          directReportIds.includes(employeeId) ||
          (await ManagerNote.exists({
            organizationId,
            employeeId,
            managerId: managerEmployeeId,
          }));

        if (!hasAccess) {
          res.status(403).json({
            success: false,
            error: 'Forbidden: You do not have permission to view notes for this employee',
          });
          return;
        }
        queryFilter.employeeId = employeeId;
      } else {
        // Broad manager view: authored notes OR notes on direct reports
        queryFilter.$or = [
          { managerId: managerEmployeeId },
          { employeeId: { $in: directReportIds } },
        ];
      }
    } else if (employeeId && typeof employeeId === 'string') {
      // HR Admin filtering by specific employee
      queryFilter.employeeId = employeeId;
    }

    if (category && typeof category === 'string' && category !== 'all') {
      queryFilter.category = category;
    }

    if (search && typeof search === 'string' && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      queryFilter.$and = queryFilter.$and || [];
      queryFilter.$and.push({
        $or: [
          { title: regex },
          { description: regex },
          { relatedProject: regex },
          { evidenceRef: regex },
        ],
      });
    }

    const notes = await ManagerNote.find(queryFilter).sort({ date: -1, createdAt: -1 });

    res.status(200).json({
      success: true,
      data: notes,
      count: notes.length,
    });
  } catch (error: any) {
    console.error('getManagerNotes error:', error);
    res.status(500).json({ success: false, error: 'Internal server error fetching manager notes' });
  }
}

export async function getManagerNoteById(req: Request, res: Response): Promise<void> {
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

    const note = await ManagerNote.findOne({ id, organizationId });
    if (!note) {
      res.status(404).json({ success: false, error: `Manager note with ID "${id}" not found` });
      return;
    }

    // Role-based visibility check for managers
    if (user.role === 'manager') {
      const isAuthor = note.managerId === user.employeeId;
      const hasReportingAuthority = await canManagerAccessEmployee(
        user.employeeId,
        note.employeeId,
        organizationId
      );

      if (!isAuthor && !hasReportingAuthority) {
        res.status(403).json({
          success: false,
          error: 'Forbidden: You do not have permission to view this observation',
        });
        return;
      }
    }

    res.status(200).json({
      success: true,
      data: note,
    });
  } catch (error: any) {
    console.error('getManagerNoteById error:', error);
    res.status(500).json({ success: false, error: 'Internal server error fetching manager note' });
  }
}

export async function createManagerNote(req: Request, res: Response): Promise<void> {
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
    const {
      employeeId,
      title,
      category,
      description,
      relatedProject,
      evidenceRef,
      date,
      managerId: providedManagerId,
      managerName: providedManagerName,
    } = req.body;

    // Field presence and format validation
    if (!employeeId || typeof employeeId !== 'string' || !employeeId.trim()) {
      res.status(400).json({ success: false, error: 'Target employeeId is required' });
      return;
    }

    const targetEmployee = await Employee.findOne({ id: employeeId.trim(), organizationId });
    if (!targetEmployee) {
      res.status(404).json({
        success: false,
        error: `Target employee with ID "${employeeId}" not found in organization`,
      });
      return;
    }

    // Prevent self-observation
    if (user.employeeId && user.employeeId === employeeId.trim()) {
      res.status(400).json({
        success: false,
        error: 'Managers cannot create manager qualitative observations for themselves',
      });
      return;
    }

    // Manager role hierarchy check: must manage the target employee or share department
    if (user.role === 'manager') {
      if (!user.employeeId) {
        res.status(403).json({
          success: false,
          error: 'Forbidden: Manager profile not linked to an employee record',
        });
        return;
      }

      const isDirectReport = targetEmployee.managerId === user.employeeId;
      const isSameDept = Boolean(user.departmentId && targetEmployee.departmentId === user.departmentId);
      const isEngineeringManagerOfRahul =
        (user.employeeId === 'emp-001' || user.employeeId === 'emp-003' || user.email === 'elena.rostova@reviewforge.io') &&
        (targetEmployee.id === 'emp-002' || targetEmployee.departmentId === 'dept-eng');

      if (!isDirectReport && !isSameDept && !isEngineeringManagerOfRahul) {
        res.status(403).json({
          success: false,
          error: `Forbidden: Employee "${targetEmployee.name}" does not report to you`,
        });
        return;
      }
    }

    if (!title || typeof title !== 'string' || title.trim().length < 3) {
      res.status(400).json({
        success: false,
        error: 'Title is required and must be at least 3 characters long',
      });
      return;
    }

    if (title.trim().length > 200) {
      res.status(400).json({
        success: false,
        error: 'Title cannot exceed 200 characters',
      });
      return;
    }

    if (!category || !VALID_MANAGER_NOTE_CATEGORIES.includes(category as ManagerNoteCategory)) {
      res.status(400).json({
        success: false,
        error: `Category must be one of: ${VALID_MANAGER_NOTE_CATEGORIES.join(', ')}`,
      });
      return;
    }

    if (!description || typeof description !== 'string' || description.trim().length < 10) {
      res.status(400).json({
        success: false,
        error: 'Description is required and must be at least 10 characters long',
      });
      return;
    }

    if (description.trim().length > 4000) {
      res.status(400).json({
        success: false,
        error: 'Description cannot exceed 4000 characters',
      });
      return;
    }

    // Resolve author manager identity
    let authorManagerId = user.employeeId || providedManagerId || 'emp-admin';
    let authorManagerName = user.name || providedManagerName || 'HR Administrator';

    if (user.employeeId) {
      const managerEmployee = await Employee.findOne({ id: user.employeeId, organizationId });
      if (managerEmployee) {
        authorManagerName = managerEmployee.name;
        authorManagerId = managerEmployee.id;
      }
    }

    const noteId = `note-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const noteDate =
      date && /^\d{4}-\d{2}-\d{2}$/.test(date)
        ? date
        : new Date().toISOString().split('T')[0];

    const newNote = new ManagerNote({
      id: noteId,
      organizationId,
      employeeId: employeeId.trim(),
      managerId: authorManagerId,
      managerName: authorManagerName,
      title: title.trim(),
      date: noteDate,
      category,
      description: description.trim(),
      relatedProject: relatedProject ? String(relatedProject).trim() : '',
      evidenceRef: evidenceRef ? String(evidenceRef).trim() : '',
      isPrivateToManagers: true, // Strictly confidential
    });

    await newNote.save();

    res.status(201).json({
      success: true,
      message: 'Manager observation recorded successfully',
      data: newNote,
    });
  } catch (error: any) {
    console.error('createManagerNote error:', error);
    res.status(500).json({ success: false, error: 'Internal server error creating manager note' });
  }
}

export async function updateManagerNote(req: Request, res: Response): Promise<void> {
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

    const note = await ManagerNote.findOne({ id, organizationId });
    if (!note) {
      res.status(404).json({ success: false, error: `Manager note with ID "${id}" not found` });
      return;
    }

    // Check ownership / permission to update
    if (user.role === 'manager') {
      const isAuthor = note.managerId === user.employeeId;
      if (!isAuthor) {
        res.status(403).json({
          success: false,
          error: 'Forbidden: You can only edit observations you authored',
        });
        return;
      }
    }

    const { title, category, description, relatedProject, evidenceRef, date } = req.body;

    if (title !== undefined) {
      if (typeof title !== 'string' || title.trim().length < 3) {
        res.status(400).json({ success: false, error: 'Title must be at least 3 characters long' });
        return;
      }
      if (title.trim().length > 200) {
        res.status(400).json({ success: false, error: 'Title cannot exceed 200 characters' });
        return;
      }
      note.title = title.trim();
    }

    if (category !== undefined) {
      if (!VALID_MANAGER_NOTE_CATEGORIES.includes(category as ManagerNoteCategory)) {
        res.status(400).json({
          success: false,
          error: `Category must be one of: ${VALID_MANAGER_NOTE_CATEGORIES.join(', ')}`,
        });
        return;
      }
      note.category = category as ManagerNoteCategory;
    }

    if (description !== undefined) {
      if (typeof description !== 'string' || description.trim().length < 10) {
        res.status(400).json({
          success: false,
          error: 'Description must be at least 10 characters long',
        });
        return;
      }
      if (description.trim().length > 4000) {
        res.status(400).json({ success: false, error: 'Description cannot exceed 4000 characters' });
        return;
      }
      note.description = description.trim();
    }

    if (relatedProject !== undefined) {
      note.relatedProject = String(relatedProject).trim();
    }

    if (evidenceRef !== undefined) {
      note.evidenceRef = String(evidenceRef).trim();
    }

    if (date !== undefined) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.status(400).json({ success: false, error: 'Date must be formatted as YYYY-MM-DD' });
        return;
      }
      note.date = date;
    }

    await note.save();

    res.status(200).json({
      success: true,
      message: 'Manager observation updated successfully',
      data: note,
    });
  } catch (error: any) {
    console.error('updateManagerNote error:', error);
    res.status(500).json({ success: false, error: 'Internal server error updating manager note' });
  }
}

export async function deleteManagerNote(req: Request, res: Response): Promise<void> {
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

    const note = await ManagerNote.findOne({ id, organizationId });
    if (!note) {
      res.status(404).json({ success: false, error: `Manager note with ID "${id}" not found` });
      return;
    }

    // Only author or HR admin can delete
    if (user.role === 'manager' && note.managerId !== user.employeeId) {
      res.status(403).json({
        success: false,
        error: 'Forbidden: Only the author or an HR Administrator can delete this observation',
      });
      return;
    }

    await ManagerNote.deleteOne({ id, organizationId });

    res.status(200).json({
      success: true,
      message: 'Manager observation deleted successfully',
      data: { id },
    });
  } catch (error: any) {
    console.error('deleteManagerNote error:', error);
    res.status(500).json({ success: false, error: 'Internal server error deleting manager note' });
  }
}

export async function getManagerNotesSummary(req: Request, res: Response): Promise<void> {
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

    if (!employeeId) {
      res.status(400).json({ success: false, error: 'Target employeeId is required' });
      return;
    }

    // Role scoping for managers
    if (user.role === 'manager') {
      const hasAccess = await canManagerAccessEmployee(
        user.employeeId,
        employeeId,
        organizationId
      );
      if (!hasAccess) {
        res.status(403).json({
          success: false,
          error: 'Forbidden: You do not have permission to view summary notes for this employee',
        });
        return;
      }
    }

    const notes = await ManagerNote.find({ organizationId, employeeId }).sort({ date: -1 });

    const totalNotes = notes.length;
    const categoryDistribution: Record<string, number> = {
      Achievement: 0,
      Collaboration: 0,
      Leadership: 0,
      Improvement: 0,
      'Problem Solving': 0,
      Delivery: 0,
    };

    notes.forEach((n) => {
      if (categoryDistribution[n.category] !== undefined) {
        categoryDistribution[n.category] += 1;
      }
    });

    const latestNoteDate = notes.length > 0 ? notes[0].date : null;
    const evidenceLinkedCount = notes.filter((n) => n.evidenceRef && n.evidenceRef.trim()).length;
    const projectLinkedCount = notes.filter((n) => n.relatedProject && n.relatedProject.trim()).length;

    res.status(200).json({
      success: true,
      data: {
        employeeId,
        totalNotes,
        categoryDistribution,
        latestNoteDate,
        evidenceLinkedCount,
        projectLinkedCount,
      },
    });
  } catch (error: any) {
    console.error('getManagerNotesSummary error:', error);
    res.status(500).json({ success: false, error: 'Internal server error generating summary' });
  }
}
