'use client';

import React, { useState, useMemo } from 'react';
import { useStore } from '@/lib/storage/use-store';
import { ManagerNote, ManagerNoteCategory } from '@/types';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { EmptyState } from '@/components/ui/empty-state';
import {
  StickyNote,
  Plus,
  Lock,
  User,
  FolderKanban,
  CheckCircle2,
  Search,
  Edit2,
  Trash2,
  Filter,
  BarChart3,
  AlertCircle
} from 'lucide-react';

export default function ManagerNotesPage() {
  const {
    managerNotes,
    employees,
    addManagerNote,
    updateManagerNote,
    deleteManagerNote,
    activeRole,
    authUser,
  } = useStore();

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedEmp, setSelectedEmp] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [activeNote, setActiveNote] = useState<ManagerNote | null>(null);

  // Form states for creating new note
  const [formData, setFormData] = useState({
    employeeId: employees[1]?.id || 'emp-002',
    managerId: authUser?.employeeId || 'emp-001',
    managerName: authUser?.name || 'Dr. Aris Thorne',
    title: '',
    category: 'Achievement' as ManagerNoteCategory,
    description: '',
    relatedProject: '',
    evidenceRef: '',
    date: new Date().toISOString().split('T')[0],
  });

  // Edit form state
  const [editFormData, setEditFormData] = useState({
    title: '',
    category: 'Achievement' as ManagerNoteCategory,
    description: '',
    relatedProject: '',
    evidenceRef: '',
    date: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Access check: only managers and HR admin should view this page
  const isAuthorized = activeRole === 'manager' || activeRole === 'hr_admin';

  // Category distribution metrics
  const metrics = useMemo(() => {
    const total = managerNotes.length;
    const achievements = managerNotes.filter((n) => n.category === 'Achievement').length;
    const collaboration = managerNotes.filter((n) => n.category === 'Collaboration').length;
    const leadership = managerNotes.filter((n) => n.category === 'Leadership').length;
    const improvement = managerNotes.filter((n) => n.category === 'Improvement').length;
    const problemSolving = managerNotes.filter((n) => n.category === 'Problem Solving').length;
    const delivery = managerNotes.filter((n) => n.category === 'Delivery').length;
    const withEvidence = managerNotes.filter((n) => n.evidenceRef && n.evidenceRef.trim()).length;

    return {
      total,
      achievements,
      collaboration,
      leadership,
      improvement,
      problemSolving,
      delivery,
      withEvidence,
    };
  }, [managerNotes]);

  if (!isAuthorized) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <EmptyState
          icon={<Lock className="w-8 h-8 text-[#9E2A2B]" />}
          title="Access Restricted: Confidential Manager Journal"
          description="Manager observations are strictly private and accessible only to managers and HR administrators. Switch your demo role to Manager or HR Administrator to access this view."
        />
      </div>
    );
  }

  const filteredNotes = managerNotes.filter((n) => {
    const matchesCat = selectedCategory === 'all' || n.category === selectedCategory;
    const matchesEmp = selectedEmp === 'all' || n.employeeId === selectedEmp;
    const matchesSearch =
      !searchQuery.trim() ||
      n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (n.relatedProject && n.relatedProject.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (n.evidenceRef && n.evidenceRef.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCat && matchesEmp && matchesSearch;
  });

  const handleOpenAdd = () => {
    setFormData({
      employeeId: employees.find((e) => e.id !== authUser?.employeeId)?.id || employees[0]?.id || 'emp-002',
      managerId: authUser?.employeeId || 'emp-001',
      managerName: authUser?.name || 'Dr. Aris Thorne',
      title: '',
      category: 'Achievement',
      description: '',
      relatedProject: '',
      evidenceRef: '',
      date: new Date().toISOString().split('T')[0],
    });
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (note: ManagerNote) => {
    setActiveNote(note);
    setEditFormData({
      title: note.title,
      category: note.category,
      description: note.description,
      relatedProject: note.relatedProject || '',
      evidenceRef: note.evidenceRef || '',
      date: note.date,
    });
    setIsEditModalOpen(true);
  };

  const handleOpenDelete = (note: ManagerNote) => {
    setActiveNote(note);
    setIsDeleteModalOpen(true);
  };

  const handleSaveNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.description.trim()) return;

    setIsSubmitting(true);
    try {
      await addManagerNote({
        employeeId: formData.employeeId,
        managerId: formData.managerId,
        managerName: formData.managerName,
        title: formData.title.trim(),
        category: formData.category,
        description: formData.description.trim(),
        relatedProject: formData.relatedProject.trim(),
        evidenceRef: formData.evidenceRef.trim(),
        isPrivateToManagers: true,
      });
      setIsAddModalOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeNote || !editFormData.title.trim() || !editFormData.description.trim()) return;

    setIsSubmitting(true);
    try {
      await updateManagerNote(activeNote.id, {
        title: editFormData.title.trim(),
        category: editFormData.category,
        description: editFormData.description.trim(),
        relatedProject: editFormData.relatedProject.trim(),
        evidenceRef: editFormData.evidenceRef.trim(),
        date: editFormData.date,
      });
      setIsEditModalOpen(false);
      setActiveNote(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteNote = async () => {
    if (!activeNote) return;

    setIsSubmitting(true);
    try {
      await deleteManagerNote(activeNote.id);
      setIsDeleteModalOpen(false);
      setActiveNote(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const categoryBadgeVariant = (cat: ManagerNoteCategory) => {
    switch (cat) {
      case 'Achievement':
        return 'lime' as const;
      case 'Problem Solving':
        return 'blue' as const;
      case 'Leadership':
        return 'forest' as const;
      case 'Improvement':
        return 'amber' as const;
      default:
        return 'sage' as const;
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#E6E8E1]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-[#17251F]">
              Private Manager Observations
            </h1>
            <Badge variant="amber">Strictly Confidential</Badge>
          </div>
          <p className="text-xs text-[#747D75] mt-1">
            Real-time journal of performance observations, incident triage notes, and qualitative coaching logs.
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          leftIcon={<Plus className="w-4 h-4" />}
          onClick={handleOpenAdd}
        >
          Add Observation
        </Button>
      </div>

      {/* Privacy Notice Banner */}
      <div className="p-4 bg-[#FEF6E7] border border-[#FBDCA8] rounded-xl flex items-start gap-3.5 text-xs text-[#92540D]">
        <Lock className="w-5 h-5 shrink-0 mt-0.5 text-[#D97706]" />
        <div>
          <span className="font-bold">Confidential Manager Working Notes</span>
          <p className="mt-0.5 leading-relaxed text-[#92540D]/90">
            These records are stored securely and are never rendered on employee-facing profile tabs or reports. They serve as verified empirical backing when drafting reviews in the AI Review Studio.
          </p>
        </div>
      </div>

      {/* Summary Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <div className="p-3 bg-[#FFFFFF] border border-[#E6E8E1] rounded-xl shadow-2xs">
          <div className="text-[11px] font-medium text-[#747D75]">Total Notes</div>
          <div className="text-xl font-bold text-[#17251F] mt-1">{metrics.total}</div>
        </div>
        <div className="p-3 bg-[#FFFFFF] border border-[#E6E8E1] rounded-xl shadow-2xs">
          <div className="text-[11px] font-medium text-[#2C5E1A]">Achievements</div>
          <div className="text-xl font-bold text-[#2C5E1A] mt-1">{metrics.achievements}</div>
        </div>
        <div className="p-3 bg-[#FFFFFF] border border-[#E6E8E1] rounded-xl shadow-2xs">
          <div className="text-[11px] font-medium text-[#5876D8]">Problem Solving</div>
          <div className="text-xl font-bold text-[#5876D8] mt-1">{metrics.problemSolving}</div>
        </div>
        <div className="p-3 bg-[#FFFFFF] border border-[#E6E8E1] rounded-xl shadow-2xs">
          <div className="text-[11px] font-medium text-[#1A4329]">Leadership</div>
          <div className="text-xl font-bold text-[#1A4329] mt-1">{metrics.leadership}</div>
        </div>
        <div className="p-3 bg-[#FFFFFF] border border-[#E6E8E1] rounded-xl shadow-2xs">
          <div className="text-[11px] font-medium text-[#D97706]">Improvement</div>
          <div className="text-xl font-bold text-[#D97706] mt-1">{metrics.improvement}</div>
        </div>
        <div className="p-3 bg-[#FFFFFF] border border-[#E6E8E1] rounded-xl shadow-2xs">
          <div className="text-[11px] font-medium text-[#747D75]">Delivery</div>
          <div className="text-xl font-bold text-[#17251F] mt-1">{metrics.delivery}</div>
        </div>
        <div className="p-3 bg-[#FAFBF8] border border-[#E6E8E1] rounded-xl shadow-2xs">
          <div className="text-[11px] font-medium text-[#747D75]">With Evidence</div>
          <div className="text-xl font-bold text-[#17251F] mt-1">{metrics.withEvidence}</div>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="p-4 bg-[#FFFFFF] border border-[#E6E8E1] rounded-xl flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-2.5 flex-wrap flex-1 min-w-[280px]">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#747D75]" />
            <input
              type="text"
              placeholder="Search by title, description, or project..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs text-[#202820] focus:outline-none focus:ring-1 focus:ring-[#17251F]"
            />
          </div>

          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-1.5 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs text-[#202820] focus:outline-none"
          >
            <option value="all">All Categories</option>
            <option value="Achievement">Achievement</option>
            <option value="Collaboration">Collaboration</option>
            <option value="Leadership">Leadership</option>
            <option value="Improvement">Improvement</option>
            <option value="Problem Solving">Problem Solving</option>
            <option value="Delivery">Delivery</option>
          </select>

          {/* Employee Filter */}
          <select
            value={selectedEmp}
            onChange={(e) => setSelectedEmp(e.target.value)}
            className="px-3 py-1.5 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs text-[#202820] focus:outline-none"
          >
            <option value="all">All Team Members</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} ({e.jobTitle})
              </option>
            ))}
          </select>
        </div>

        <span className="text-xs text-[#747D75] font-medium">
          Showing {filteredNotes.length} of {managerNotes.length} Note(s)
        </span>
      </div>

      {/* Notes Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredNotes.length > 0 ? (
          filteredNotes.map((note) => {
            const employee = employees.find((e) => e.id === note.employeeId);
            const canManage =
              activeRole === 'hr_admin' ||
              (activeRole === 'manager' && note.managerId === authUser?.employeeId);

            return (
              <Card
                key={note.id}
                className="flex flex-col justify-between hover:border-[#D0D4CA] transition-all bg-[#FFFFFF]"
              >
                <CardHeader>
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant={categoryBadgeVariant(note.category)} dot>
                        {note.category}
                      </Badge>
                      {employee && (
                        <span className="text-xs font-semibold text-[#17251F]">
                          For: {employee.name}
                        </span>
                      )}
                    </div>
                    <CardTitle className="text-sm mt-1.5 text-[#17251F] font-semibold">
                      {note.title}
                    </CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-[#747D75]">{note.date}</span>
                    {canManage && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleOpenEdit(note)}
                          className="p-1 text-[#747D75] hover:text-[#17251F] rounded hover:bg-[#F3F4F0] transition-colors"
                          title="Edit note"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleOpenDelete(note)}
                          className="p-1 text-[#747D75] hover:text-[#9E2A2B] rounded hover:bg-[#FDF2F2] transition-colors"
                          title="Delete note"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  <p className="text-xs text-[#202820] leading-relaxed">{note.description}</p>

                  {(note.relatedProject || note.evidenceRef) && (
                    <div className="p-3 bg-[#FAFBF8] border border-[#E6E8E1] rounded-xl text-xs space-y-1.5">
                      {note.relatedProject && (
                        <div className="flex items-center gap-1.5 text-[#747D75]">
                          <FolderKanban className="w-3.5 h-3.5 text-[#5876D8] shrink-0" />
                          <span>
                            Project:{' '}
                            <strong className="text-[#17251F] font-medium">
                              {note.relatedProject}
                            </strong>
                          </span>
                        </div>
                      )}
                      {note.evidenceRef && (
                        <div className="flex items-center gap-1.5 text-[#747D75]">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#2C5E1A] shrink-0" />
                          <span>
                            Linked Evidence:{' '}
                            <strong className="text-[#17251F] font-medium">
                              {note.evidenceRef}
                            </strong>
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>

                <CardFooter>
                  <div className="flex items-center gap-1 text-[11px] text-[#747D75]">
                    <User className="w-3 h-3" />
                    <span>Logged by: {note.managerName}</span>
                  </div>
                  <span className="text-[10px] text-[#92540D] font-mono font-semibold bg-[#FEF6E7] px-2 py-0.5 rounded border border-[#FBDCA8]">
                    Private to Managers
                  </span>
                </CardFooter>
              </Card>
            );
          })
        ) : (
          <div className="md:col-span-2">
            <EmptyState
              icon={<StickyNote className="w-8 h-8 text-[#747D75]" />}
              title="No Manager Observations Found"
              description="No notes match your current filters. Adjust your search or record a new observation."
            />
          </div>
        )}
      </div>

      {/* Add Observation Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Record Private Observation"
        description="Log a private note or coaching observation for an employee."
        maxWidth="lg"
      >
        <form onSubmit={handleSaveNote} className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-[#17251F] mb-1">Target Employee</label>
              <select
                value={formData.employeeId}
                onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs focus:ring-1 focus:ring-[#17251F]"
              >
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} ({e.jobTitle})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-[#17251F] mb-1">Category</label>
              <select
                value={formData.category}
                onChange={(e) =>
                  setFormData({ ...formData, category: e.target.value as ManagerNoteCategory })
                }
                className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs focus:ring-1 focus:ring-[#17251F]"
              >
                <option value="Achievement">Achievement</option>
                <option value="Collaboration">Collaboration</option>
                <option value="Leadership">Leadership</option>
                <option value="Improvement">Improvement</option>
                <option value="Problem Solving">Problem Solving</option>
                <option value="Delivery">Delivery</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-[#17251F] mb-1">Observation Title</label>
            <input
              type="text"
              required
              minLength={3}
              maxLength={200}
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g. Incident response during database failover..."
              className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs focus:ring-1 focus:ring-[#17251F]"
            />
          </div>

          <div>
            <label className="block font-semibold text-[#17251F] mb-1">
              Observation Description
            </label>
            <textarea
              rows={3}
              required
              minLength={10}
              maxLength={4000}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Detailed description of what occurred, context, and impact..."
              className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs focus:ring-1 focus:ring-[#17251F]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-[#17251F] mb-1">
                Related Project (Optional)
              </label>
              <input
                type="text"
                value={formData.relatedProject}
                onChange={(e) => setFormData({ ...formData, relatedProject: e.target.value })}
                placeholder="e.g. Edge API Gateway Overhaul"
                className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs focus:ring-1 focus:ring-[#17251F]"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#17251F] mb-1">
                Evidence Reference (Optional)
              </label>
              <input
                type="text"
                value={formData.evidenceRef}
                onChange={(e) => setFormData({ ...formData, evidenceRef: e.target.value })}
                placeholder="e.g. Incident Post-Mortem #4892"
                className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs focus:ring-1 focus:ring-[#17251F]"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-[#E6E8E1] flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setIsAddModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save Observation'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Observation Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Private Observation"
        description="Update details or evidence links for this observation."
        maxWidth="lg"
      >
        <form onSubmit={handleUpdateNote} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-[#17251F] mb-1">Category</label>
            <select
              value={editFormData.category}
              onChange={(e) =>
                setEditFormData({
                  ...editFormData,
                  category: e.target.value as ManagerNoteCategory,
                })
              }
              className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs focus:ring-1 focus:ring-[#17251F]"
            >
              <option value="Achievement">Achievement</option>
              <option value="Collaboration">Collaboration</option>
              <option value="Leadership">Leadership</option>
              <option value="Improvement">Improvement</option>
              <option value="Problem Solving">Problem Solving</option>
              <option value="Delivery">Delivery</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-[#17251F] mb-1">Observation Title</label>
            <input
              type="text"
              required
              minLength={3}
              maxLength={200}
              value={editFormData.title}
              onChange={(e) => setEditFormData({ ...editFormData, title: e.target.value })}
              className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs focus:ring-1 focus:ring-[#17251F]"
            />
          </div>

          <div>
            <label className="block font-semibold text-[#17251F] mb-1">
              Observation Description
            </label>
            <textarea
              rows={3}
              required
              minLength={10}
              maxLength={4000}
              value={editFormData.description}
              onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
              className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs focus:ring-1 focus:ring-[#17251F]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-[#17251F] mb-1">Related Project</label>
              <input
                type="text"
                value={editFormData.relatedProject}
                onChange={(e) =>
                  setEditFormData({ ...editFormData, relatedProject: e.target.value })
                }
                className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs focus:ring-1 focus:ring-[#17251F]"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#17251F] mb-1">Evidence Reference</label>
              <input
                type="text"
                value={editFormData.evidenceRef}
                onChange={(e) => setEditFormData({ ...editFormData, evidenceRef: e.target.value })}
                className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs focus:ring-1 focus:ring-[#17251F]"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-[#E6E8E1] flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setIsEditModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={isSubmitting}>
              {isSubmitting ? 'Updating...' : 'Update Observation'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Delete Private Observation"
        description="Are you sure you want to permanently delete this observation? This action cannot be undone."
        maxWidth="md"
      >
        <div className="space-y-4 text-xs">
          <div className="p-3 bg-[#FDF2F2] border border-[#F8D7DA] rounded-xl flex items-start gap-2.5 text-[#9E2A2B]">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">Confirm Deletion</div>
              <p className="mt-0.5 text-xs">
                "{activeNote?.title}" will be permanently removed from your manager log and will no
                longer be referenced during review synthesis.
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[#E6E8E1]">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setIsDeleteModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={handleDeleteNote}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Deleting...' : 'Delete Observation'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
