'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useStore } from '@/lib/storage/use-store';
import { Employee, EmploymentStatus, ReviewStatus, UserRole } from '@/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SearchInput } from '@/components/ui/search-input';
import { Modal } from '@/components/ui/modal';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Users,
  Plus,
  Filter,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Edit2,
  Eye,
  Mail,
  Building,
  Calendar,
  CheckCircle2,
  Trash2
} from 'lucide-react';

export default function EmployeesPage() {
  const { employees, departments, addEmployee, updateEmployee, deleteEmployee, activeRole } = useStore();

  const [search, setSearch] = useState('');
  const [selectedDept, setSelectedDept] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'name' | 'joinDate' | 'status'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8;

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [deletingEmployee, setDeletingEmployee] = useState<Employee | null>(null);

  // Form states for Add / Edit
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    employeeNumber: '',
    jobTitle: '',
    role: 'employee' as UserRole,
    departmentId: departments[0]?.id || 'dept-eng',
    employmentStatus: 'Full-Time' as EmploymentStatus,
    managerName: 'Dr. Aris Thorne',
    location: 'San Francisco, CA (HQ)',
    skills: 'React, TypeScript, Cloud',
    bio: ''
  });

  // Filter & Sort Logic
  const filteredEmployees = employees.filter(emp => {
    const matchesSearch =
      emp.name.toLowerCase().includes(search.toLowerCase()) ||
      emp.email.toLowerCase().includes(search.toLowerCase()) ||
      emp.jobTitle.toLowerCase().includes(search.toLowerCase()) ||
      emp.employeeNumber.toLowerCase().includes(search.toLowerCase());

    const matchesDept = selectedDept === 'all' || emp.departmentId === selectedDept;
    const matchesStatus = selectedStatus === 'all' || emp.reviewStatus === selectedStatus;

    return matchesSearch && matchesDept && matchesStatus;
  });

  const sortedEmployees = [...filteredEmployees].sort((a, b) => {
    let comparison = 0;
    if (sortBy === 'name') comparison = a.name.localeCompare(b.name);
    else if (sortBy === 'joinDate') comparison = a.joinDate.localeCompare(b.joinDate);
    else if (sortBy === 'status') comparison = a.reviewStatus.localeCompare(b.reviewStatus);
    return sortOrder === 'asc' ? comparison : -comparison;
  });

  const totalPages = Math.ceil(sortedEmployees.length / pageSize);
  const paginatedEmployees = sortedEmployees.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const handleOpenAdd = () => {
    // Determine the next safe employee number from the maximum existing RF-xxxx number
    const maxNum = employees.reduce((max, emp) => {
      const match = emp.employeeNumber?.match(/RF-(\d+)/i);
      return match ? Math.max(max, parseInt(match[1], 10)) : max;
    }, 1000);
    const nextEmpNum = `RF-${maxNum + 1}`;

    setFormData({
      name: '',
      email: '',
      employeeNumber: nextEmpNum,
      jobTitle: '',
      role: 'employee' as UserRole,
      departmentId: departments[0]?.id || 'dept-eng',
      employmentStatus: 'Full-Time',
      managerName: employees[0]?.name || 'Dr. Aris Thorne',
      location: 'San Francisco, CA (HQ)',
      skills: 'TypeScript, React, Node.js',
      bio: 'Enterprise contributor.'
    });
    setIsAddModalOpen(true);
  };

  const handleSaveAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.jobTitle) return;

    const dept = departments.find(d => d.id === formData.departmentId);
    const matchedMgr = employees.find(
      emp => emp.name.toLowerCase() === formData.managerName.trim().toLowerCase()
    );

    const result = await addEmployee({
      employeeNumber: formData.employeeNumber,
      name: formData.name.trim(),
      email: formData.email.trim(),
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      departmentId: formData.departmentId,
      departmentName: dept ? dept.name : 'Engineering & Infrastructure',
      jobTitle: formData.jobTitle.trim(),
      managerId: matchedMgr ? matchedMgr.id : (employees[0]?.id || 'emp-001'),
      managerName: formData.managerName.trim(),
      joinDate: new Date().toISOString().split('T')[0],
      employmentStatus: formData.employmentStatus,
      reviewStatus: 'Not Started',
      location: formData.location.trim(),
      bio: formData.bio.trim(),
      skills: formData.skills.split(',').map(s => s.trim()).filter(Boolean),
      ...(formData.role ? { role: formData.role } : {})
    } as any);

    if (result) {
      setIsAddModalOpen(false);
    }
  };

  const handleOpenEdit = (emp: Employee) => {
    setEditingEmployee(emp);
    setFormData({
      name: emp.name,
      email: emp.email,
      employeeNumber: emp.employeeNumber,
      jobTitle: emp.jobTitle,
      role: 'employee' as UserRole,
      departmentId: emp.departmentId,
      employmentStatus: emp.employmentStatus,
      managerName: emp.managerName || 'None',
      location: emp.location,
      skills: emp.skills.join(', '),
      bio: emp.bio
    });
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee) return;

    const dept = departments.find(d => d.id === formData.departmentId);
    const matchedMgr = employees.find(
      emp => emp.name.toLowerCase() === formData.managerName.trim().toLowerCase()
    );

    updateEmployee(editingEmployee.id, {
      name: formData.name.trim(),
      email: formData.email.trim(),
      jobTitle: formData.jobTitle.trim(),
      departmentId: formData.departmentId,
      departmentName: dept ? dept.name : editingEmployee.departmentName,
      employmentStatus: formData.employmentStatus,
      managerId: matchedMgr ? matchedMgr.id : editingEmployee.managerId,
      managerName: formData.managerName.trim(),
      location: formData.location.trim(),
      bio: formData.bio.trim(),
      skills: formData.skills.split(',').map(s => s.trim()).filter(Boolean)
    });

    setEditingEmployee(null);
  };

  const handleConfirmDelete = async () => {
    if (!deletingEmployee) return;
    await deleteEmployee(deletingEmployee.id);
    setDeletingEmployee(null);
  };

  const statusVariant = (status: ReviewStatus) => {
    switch (status) {
      case 'Approved':
        return 'lime' as const;
      case 'Released':
        return 'blue' as const;
      case 'Pending Approval':
        return 'amber' as const;
      case 'In Progress':
        return 'forest' as const;
      default:
        return 'outline' as const;
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#E6E8E1]">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#17251F]">
            Employee Directory
          </h1>
          <p className="text-xs text-[#747D75] mt-1">
            Manage organization members, department designations, and review cycle status.
          </p>
        </div>

        {activeRole === 'hr_admin' && (
          <div className="flex items-center gap-2.5">
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={handleOpenAdd}
            >
              Add Employee
            </Button>
          </div>
        )}
      </div>

      {/* Filters Bar */}
      <div className="p-4 bg-[#FFFFFF] border border-[#E6E8E1] rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-2xs">
        <div className="flex flex-1 items-center gap-2.5 flex-wrap">
          <SearchInput
            value={search}
            onChangeValue={setSearch}
            placeholder="Search by name, title, ID, or email..."
            className="w-full sm:w-72"
          />

          {/* Department Filter */}
          <select
            value={selectedDept}
            onChange={e => {
              setSelectedDept(e.target.value);
              setCurrentPage(1);
            }}
            className="px-3 py-2 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs text-[#202820] focus:outline-none focus:ring-1 focus:ring-[#17251F]"
          >
            <option value="all">All Departments</option>
            {departments.map(d => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>

          {/* Review Status Filter */}
          <select
            value={selectedStatus}
            onChange={e => {
              setSelectedStatus(e.target.value);
              setCurrentPage(1);
            }}
            className="px-3 py-2 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs text-[#202820] focus:outline-none focus:ring-1 focus:ring-[#17251F]"
          >
            <option value="all">All Review Statuses</option>
            <option value="Not Started">Not Started</option>
            <option value="In Progress">In Progress</option>
            <option value="Pending Approval">Pending Approval</option>
            <option value="Approved">Approved</option>
            <option value="Released">Released</option>
          </select>
        </div>

        {/* Sort Controls */}
        <div className="flex items-center gap-2 text-xs text-[#747D75]">
          <span className="shrink-0 font-medium">Sort by:</span>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as 'name' | 'joinDate' | 'status')}
            className="px-2 py-1.5 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs text-[#202820] focus:outline-none"
          >
            <option value="name">Name</option>
            <option value="joinDate">Join Date</option>
            <option value="status">Review Status</option>
          </select>
          <button
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            className="p-1.5 rounded-lg border border-[#E6E8E1] bg-[#FAFBF8] hover:bg-[#F0F2EB] text-[#17251F] cursor-pointer"
            title="Toggle sort direction"
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Employee Table */}
      <Card className="overflow-hidden">
        {paginatedEmployees.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FAFBF8] border-b border-[#E6E8E1] text-[#747D75] font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="px-5 py-3.5">Employee</th>
                  <th className="px-4 py-3.5">Department & Role</th>
                  <th className="px-4 py-3.5">Manager</th>
                  <th className="px-4 py-3.5">Joined</th>
                  <th className="px-4 py-3.5">Review Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E6E8E1]">
                {paginatedEmployees.map(emp => (
                  <tr
                    key={emp.id}
                    className="hover:bg-[#FAFBF8] transition-colors group"
                  >
                    {/* Employee Info */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-[#17251F] text-white flex items-center justify-center font-bold text-xs ring-1 ring-[#CADACD]">
                          {emp.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <Link
                            href={`/employees/${emp.id}`}
                            className="font-bold text-[#17251F] hover:text-[#5876D8] transition-colors"
                          >
                            {emp.name}
                          </Link>
                          <div className="text-[11px] text-[#747D75] flex items-center gap-1.5">
                            <span className="font-mono text-[#17251F]">{emp.employeeNumber}</span>
                            <span>•</span>
                            <span className="truncate max-w-[140px]">{emp.email}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Department & Role */}
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-[#17251F]">{emp.jobTitle}</div>
                      <div className="text-[11px] text-[#747D75]">{emp.departmentName}</div>
                    </td>

                    {/* Manager */}
                    <td className="px-4 py-3.5 text-[#202820]">
                      {emp.managerName || (
                        <span className="text-[#747D75] italic">Executive Lead</span>
                      )}
                    </td>

                    {/* Joined */}
                    <td className="px-4 py-3.5 text-[#747D75] font-mono text-[11px]">
                      {emp.joinDate}
                    </td>

                    {/* Review Status */}
                    <td className="px-4 py-3.5">
                      <Badge variant={statusVariant(emp.reviewStatus)} dot>
                        {emp.reviewStatus}
                      </Badge>
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link href={`/employees/${emp.id}`}>
                          <button
                            className="p-1.5 rounded-lg text-[#747D75] hover:text-[#17251F] hover:bg-[#F0F2EB] transition-colors cursor-pointer"
                            title="View employee profile"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </Link>
                        {(activeRole === 'hr_admin' || activeRole === 'manager') && (
                          <button
                            onClick={() => handleOpenEdit(emp)}
                            className="p-1.5 rounded-lg text-[#747D75] hover:text-[#17251F] hover:bg-[#F0F2EB] transition-colors cursor-pointer"
                            title="Edit employee record"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {activeRole === 'hr_admin' && (
                          <button
                            onClick={() => setDeletingEmployee(emp)}
                            className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer"
                            title="Deactivate employee record"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <Link href={`/ai-review-studio?employeeId=${emp.id}`}>
                          <button
                            className="p-1.5 rounded-lg text-[#17251F] bg-[#EEF9D1] hover:bg-[#E5F5BE] transition-colors cursor-pointer"
                            title="Synthesize Review in AI Studio"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-[#17251F]" />
                          </button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={<Users className="w-8 h-8 text-[#747D75]" />}
            title="No employees found"
            description="No employees matched your current search and filter criteria. Clear filters or add a new employee."
            actionLabel="Clear Filters"
            onAction={() => {
              setSearch('');
              setSelectedDept('all');
              setSelectedStatus('all');
            }}
          />
        )}

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="px-5 py-3.5 bg-[#FAFBF8] border-t border-[#E6E8E1] flex items-center justify-between text-xs text-[#747D75]">
            <span>
              Showing {(currentPage - 1) * pageSize + 1} to{' '}
              {Math.min(currentPage * pageSize, sortedEmployees.length)} of{' '}
              {sortedEmployees.length} employees
            </span>

            <div className="flex items-center gap-1.5">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(currentPage - 1)}
                className="p-1.5 rounded-lg border border-[#E6E8E1] bg-[#FFFFFF] hover:bg-[#F0F2EB] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 font-medium text-[#17251F]">
                {currentPage} of {totalPages}
              </span>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(currentPage + 1)}
                className="p-1.5 rounded-lg border border-[#E6E8E1] bg-[#FFFFFF] hover:bg-[#F0F2EB] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* Add Employee Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add New Employee"
        description="Create a new organization employee record for performance tracking."
        maxWidth="lg"
      >
        <form onSubmit={handleSaveAdd} className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-[#17251F] mb-1">Full Name</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Maya Chen"
                className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs focus:ring-1 focus:ring-[#17251F]"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#17251F] mb-1">Email Address</label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
                placeholder="maya.chen@reviewforge.internal"
                className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs focus:ring-1 focus:ring-[#17251F]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-[#17251F] mb-1">Job Title</label>
              <input
                type="text"
                required
                value={formData.jobTitle}
                onChange={e => setFormData({ ...formData, jobTitle: e.target.value })}
                placeholder="Senior Product Designer"
                className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs focus:ring-1 focus:ring-[#17251F]"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#17251F] mb-1">Department</label>
              <select
                value={formData.departmentId}
                onChange={e => setFormData({ ...formData, departmentId: e.target.value })}
                className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs focus:ring-1 focus:ring-[#17251F]"
              >
                {departments.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-[#17251F] mb-1">Account Role</label>
              <select
                value={formData.role}
                onChange={e => setFormData({ ...formData, role: e.target.value as UserRole })}
                className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs focus:ring-1 focus:ring-[#17251F]"
              >
                <option value="employee">Employee</option>
                <option value="manager">Manager</option>
                <option value="peer_reviewer">Peer Reviewer</option>
                <option value="hr_admin">HR Administrator</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-[#17251F] mb-1">Manager Name</label>
              <input
                type="text"
                list="add-managers-list"
                value={formData.managerName}
                onChange={e => setFormData({ ...formData, managerName: e.target.value })}
                placeholder="Select or enter manager"
                className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs focus:ring-1 focus:ring-[#17251F]"
              />
              <datalist id="add-managers-list">
                {employees.map(emp => (
                  <option key={emp.id} value={emp.name}>
                    {emp.jobTitle}
                  </option>
                ))}
              </datalist>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-[#17251F] mb-1">Location</label>
              <input
                type="text"
                value={formData.location}
                onChange={e => setFormData({ ...formData, location: e.target.value })}
                className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs focus:ring-1 focus:ring-[#17251F]"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#17251F] mb-1">Employment Status</label>
              <select
                value={formData.employmentStatus}
                onChange={e => setFormData({ ...formData, employmentStatus: e.target.value as EmploymentStatus })}
                className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs focus:ring-1 focus:ring-[#17251F]"
              >
                <option value="Full-Time">Full-Time</option>
                <option value="Part-Time">Part-Time</option>
                <option value="Contractor">Contractor</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-[#17251F] mb-1">Core Skills (comma separated)</label>
            <input
              type="text"
              value={formData.skills}
              onChange={e => setFormData({ ...formData, skills: e.target.value })}
              className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs focus:ring-1 focus:ring-[#17251F]"
            />
          </div>

          <div>
            <label className="block font-semibold text-[#17251F] mb-1">Professional Bio</label>
            <textarea
              rows={2}
              value={formData.bio}
              onChange={e => setFormData({ ...formData, bio: e.target.value })}
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
              Save Employee
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Employee Modal */}
      <Modal
        isOpen={Boolean(editingEmployee)}
        onClose={() => setEditingEmployee(null)}
        title="Edit Employee Details"
        description="Update profile, department assignment, and reporting structure."
        maxWidth="lg"
      >
        <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-[#17251F] mb-1">Full Name</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs focus:ring-1 focus:ring-[#17251F]"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#17251F] mb-1">Email Address</label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs focus:ring-1 focus:ring-[#17251F]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-[#17251F] mb-1">Job Title</label>
              <input
                type="text"
                required
                value={formData.jobTitle}
                onChange={e => setFormData({ ...formData, jobTitle: e.target.value })}
                className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs focus:ring-1 focus:ring-[#17251F]"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#17251F] mb-1">Department</label>
              <select
                value={formData.departmentId}
                onChange={e => setFormData({ ...formData, departmentId: e.target.value })}
                className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs focus:ring-1 focus:ring-[#17251F]"
              >
                {departments.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-[#17251F] mb-1">Manager Name</label>
              <input
                type="text"
                list="edit-managers-list"
                value={formData.managerName}
                onChange={e => setFormData({ ...formData, managerName: e.target.value })}
                placeholder="Select or enter manager"
                className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs focus:ring-1 focus:ring-[#17251F]"
              />
              <datalist id="edit-managers-list">
                {employees
                  .filter(e => e.id !== editingEmployee?.id)
                  .map(emp => (
                    <option key={emp.id} value={emp.name}>
                      {emp.jobTitle}
                    </option>
                  ))}
              </datalist>
            </div>
            <div>
              <label className="block font-semibold text-[#17251F] mb-1">Location</label>
              <input
                type="text"
                value={formData.location}
                onChange={e => setFormData({ ...formData, location: e.target.value })}
                className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs focus:ring-1 focus:ring-[#17251F]"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-[#17251F] mb-1">Skills</label>
            <input
              type="text"
              value={formData.skills}
              onChange={e => setFormData({ ...formData, skills: e.target.value })}
              className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs focus:ring-1 focus:ring-[#17251F]"
            />
          </div>

          <div className="pt-3 border-t border-[#E6E8E1] flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setEditingEmployee(null)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm">
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>

      {/* Deactivate Employee Confirmation Modal */}
      <Modal
        isOpen={Boolean(deletingEmployee)}
        onClose={() => setDeletingEmployee(null)}
        title="Deactivate Employee Record"
        description="Are you sure you want to deactivate this employee? They will no longer appear in active review cycles."
        maxWidth="md"
      >
        <div className="space-y-4 text-xs">
          <p className="text-[#747D75]">
            Employee:{' '}
            <span className="font-semibold text-[#17251F]">
              {deletingEmployee?.name}
            </span>{' '}
            ({deletingEmployee?.employeeNumber}) - {deletingEmployee?.jobTitle}
          </p>
          <div className="pt-3 border-t border-[#E6E8E1] flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setDeletingEmployee(null)}
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
              Deactivate Employee
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

