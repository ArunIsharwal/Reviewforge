'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useStore } from '@/lib/storage/use-store';
import { Department } from '@/types';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { ProgressBar } from '@/components/ui/progress-bar';
import { EmptyState } from '@/components/ui/empty-state';
import { Building, Users, Target, ArrowRight, Plus, Edit2, Trash2, AlertCircle } from 'lucide-react';

export default function DepartmentsPage() {
  const { departments, employees, activeRole, addDepartment, updateDepartment, deleteDepartment, showToast } =
    useStore();

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [deletingDept, setDeletingDept] = useState<Department | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    headEmployeeId: '',
    description: '',
  });

  const handleOpenAdd = () => {
    setFormData({
      name: '',
      code: '',
      headEmployeeId: employees[0]?.id || '',
      description: '',
    });
    setIsAddModalOpen(true);
  };

  const handleSaveAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.code || !formData.headEmployeeId) {
      showToast('Please fill in department name, code, and select a head', 'warning');
      return;
    }

    const head = employees.find((emp) => emp.id === formData.headEmployeeId);

    const result = await addDepartment({
      name: formData.name.trim(),
      code: formData.code.trim().toUpperCase(),
      headEmployeeId: formData.headEmployeeId,
      headName: head ? head.name : 'Unassigned',
      description: formData.description.trim(),
      employeeCount: 0,
      averageOkrCompletion: 0,
    });

    if (result) {
      setIsAddModalOpen(false);
    }
  };

  const handleOpenEdit = (dept: Department) => {
    setEditingDept(dept);
    setFormData({
      name: dept.name,
      code: dept.code,
      headEmployeeId: dept.headEmployeeId,
      description: dept.description,
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDept) return;

    const head = employees.find((emp) => emp.id === formData.headEmployeeId);

    const success = await updateDepartment(editingDept.id, {
      name: formData.name.trim(),
      code: formData.code.trim().toUpperCase(),
      headEmployeeId: formData.headEmployeeId,
      headName: head ? head.name : editingDept.headName,
      description: formData.description.trim(),
    });

    if (success) {
      setEditingDept(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingDept) return;

    const assignedCount = employees.filter((e) => e.departmentId === deletingDept.id).length;
    if (assignedCount > 0) {
      showToast(
        `Cannot delete department '${deletingDept.name}' because ${assignedCount} employee(s) are assigned to it. Please reassign them first.`,
        'error'
      );
      setDeletingDept(null);
      return;
    }

    await deleteDepartment(deletingDept.id);
    setDeletingDept(null);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#E6E8E1]">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#17251F]">
            Departments & Squad Structure
          </h1>
          <p className="text-xs text-[#747D75] mt-1">
            Organizational division hierarchy, leadership assignment, and aggregated goal performance.
          </p>
        </div>

        {activeRole === 'hr_admin' && (
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={handleOpenAdd}
          >
            Add Department
          </Button>
        )}
      </div>

      {/* Department Cards Grid */}
      {departments.length === 0 ? (
        <EmptyState
          icon={<Building className="w-8 h-8 text-[#747D75]" />}
          title="No departments found"
          description="Create your first organization department to organize employees and review workflows."
          actionLabel="Add Department"
          onAction={handleOpenAdd}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {departments.map((dept) => {
            const deptEmployees = employees.filter((e) => e.departmentId === dept.id);
            const liveCount = deptEmployees.length;

            return (
              <Card key={dept.id} className="flex flex-col justify-between hover:border-[#D0D4CA] transition-all">
                <CardHeader>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <Badge variant="forest" className="font-mono text-[10px]">
                        {dept.code}
                      </Badge>

                      {activeRole === 'hr_admin' && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleOpenEdit(dept)}
                            className="p-1 rounded text-[#747D75] hover:text-[#17251F] hover:bg-[#F0F2EB] transition-colors"
                            title="Edit department"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeletingDept(dept)}
                            className="p-1 rounded text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-colors"
                            title="Delete department"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                    <CardTitle className="text-base mt-2">{dept.name}</CardTitle>
                  </div>
                  <div className="p-2 bg-[#FAFBF8] border border-[#E6E8E1] rounded-lg">
                    <Building className="w-4 h-4 text-[#747D75]" />
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  <p className="text-xs text-[#747D75] leading-relaxed line-clamp-2">
                    {dept.description || 'No description provided.'}
                  </p>

                  <div className="p-3 bg-[#FAFBF8] border border-[#E6E8E1] rounded-xl text-xs space-y-2">
                    <div className="flex justify-between">
                      <span className="text-[#747D75]">Department Head:</span>
                      <span className="font-bold text-[#17251F]">{dept.headName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#747D75]">Active Members:</span>
                      <span className="font-bold text-[#17251F]">{liveCount} on file</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold text-[#17251F]">
                      <span>Average OKR Progress</span>
                      <span>{dept.averageOkrCompletion}%</span>
                    </div>
                    <ProgressBar
                      value={dept.averageOkrCompletion}
                      size="sm"
                      colorScheme="lime"
                    />
                  </div>
                </CardContent>

                <CardFooter>
                  <Link
                    href={`/employees?dept=${dept.id}`}
                    className="w-full flex items-center justify-between text-xs font-semibold text-[#17251F] hover:text-[#5876D8]"
                  >
                    <span>View Department Members ({liveCount})</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Department Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Create New Department"
        description="Establish an organizational unit, department code, and appoint a division head."
        maxWidth="md"
      >
        <form onSubmit={handleSaveAdd} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-[#17251F] mb-1">Department Name</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Information Security & Compliance"
              className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs focus:ring-1 focus:ring-[#17251F]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-[#17251F] mb-1">Department Code</label>
              <input
                type="text"
                required
                maxLength={8}
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                placeholder="e.g. SEC"
                className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs font-mono uppercase focus:ring-1 focus:ring-[#17251F]"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#17251F] mb-1">Department Head</label>
              <select
                value={formData.headEmployeeId}
                onChange={(e) => setFormData({ ...formData, headEmployeeId: e.target.value })}
                className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs focus:ring-1 focus:ring-[#17251F]"
              >
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} ({emp.jobTitle})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-[#17251F] mb-1">Department Scope & Mission</label>
            <textarea
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Briefly define this department's enterprise objectives and responsibilities..."
              className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs focus:ring-1 focus:ring-[#17251F]"
            />
          </div>

          <div className="pt-3 border-t border-[#E6E8E1] flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setIsAddModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm">
              Create Department
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Department Modal */}
      <Modal
        isOpen={Boolean(editingDept)}
        onClose={() => setEditingDept(null)}
        title="Edit Department Structure"
        description="Modify division details, code, and leadership assignment."
        maxWidth="md"
      >
        <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-[#17251F] mb-1">Department Name</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs focus:ring-1 focus:ring-[#17251F]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-[#17251F] mb-1">Department Code</label>
              <input
                type="text"
                required
                maxLength={8}
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs font-mono uppercase focus:ring-1 focus:ring-[#17251F]"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#17251F] mb-1">Department Head</label>
              <select
                value={formData.headEmployeeId}
                onChange={(e) => setFormData({ ...formData, headEmployeeId: e.target.value })}
                className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs focus:ring-1 focus:ring-[#17251F]"
              >
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} ({emp.jobTitle})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-[#17251F] mb-1">Department Description</label>
            <textarea
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs focus:ring-1 focus:ring-[#17251F]"
            />
          </div>

          <div className="pt-3 border-t border-[#E6E8E1] flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setEditingDept(null)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm">
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Department Confirmation Modal */}
      <Modal
        isOpen={Boolean(deletingDept)}
        onClose={() => setDeletingDept(null)}
        title="Delete Department"
        description="Are you sure you want to delete this organizational department?"
        maxWidth="md"
      >
        <div className="space-y-4 text-xs">
          <p className="text-[#747D75]">
            Department:{' '}
            <span className="font-semibold text-[#17251F]">
              {deletingDept?.name} ({deletingDept?.code})
            </span>
          </p>

          {employees.filter((e) => e.departmentId === deletingDept?.id).length > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-amber-800">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
              <p className="leading-relaxed">
                <strong>Safeguard Active:</strong> This department currently has{' '}
                {employees.filter((e) => e.departmentId === deletingDept?.id).length} employee(s) assigned.
                The system will prohibit deletion until all team members have been reassigned.
              </p>
            </div>
          )}

          <div className="pt-3 border-t border-[#E6E8E1] flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setDeletingDept(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              className="bg-rose-600 hover:bg-rose-700 text-white"
              onClick={handleConfirmDelete}
            >
              Confirm Deletion
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
