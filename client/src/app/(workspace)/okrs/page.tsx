'use client';

import React, { useState } from 'react';
import { useStore } from '@/lib/storage/use-store';
import { OKR, KeyResult, Quarter, OKRStatus } from '@/types';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Modal } from '@/components/ui/modal';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Target,
  Plus,
  Filter,
  CheckCircle2,
  Clock,
  TrendingUp,
  Edit2,
  Users,
  Building,
  Trash2,
  AlertCircle,
  Award,
  Sparkles,
} from 'lucide-react';

export default function OKRsPage() {
  const {
    okrs,
    employees,
    departments,
    addOKR,
    updateOKR,
    updateKeyResultProgress,
    deleteOKR,
    activeRole,
    authUser,
  } = useStore();

  const [selectedQuarter, setSelectedQuarter] = useState<string>('all');
  const [selectedDept, setSelectedDept] = useState<string>('all');
  const [selectedEmp, setSelectedEmp] = useState<string>('all');

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [updatingKr, setUpdatingKr] = useState<{
    okr: OKR;
    kr: KeyResult;
    actualValue: number;
  } | null>(null);
  const [deletingOkr, setDeletingOkr] = useState<OKR | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states
  const [formData, setFormData] = useState({
    employeeId: employees[1]?.id || 'emp-002',
    quarter: 'Q4' as Quarter,
    year: 2026,
    objective: '',
    departmentId: departments[0]?.id || 'dept-eng',
    keyResults: [
      {
        id: 'kr-1',
        title: '',
        targetValue: 100,
        actualValue: 0,
        unit: '%',
        completionPercentage: 0,
        status: 'On Track' as OKRStatus,
      },
    ],
  });

  // Filtered OKRs
  const filteredOkrs = okrs.filter((okr) => {
    const matchesQ = selectedQuarter === 'all' || okr.quarter === selectedQuarter;
    const matchesDept = selectedDept === 'all' || okr.departmentId === selectedDept;
    const matchesEmp = selectedEmp === 'all' || okr.employeeId === selectedEmp;
    return matchesQ && matchesDept && matchesEmp;
  });

  // Executive metrics calculations
  const totalOkrs = okrs.length;
  const completedOkrs = okrs.filter((o) => o.status === 'Completed').length;
  const averageProgress =
    totalOkrs > 0 ? Math.round(okrs.reduce((sum, o) => sum + o.overallProgress, 0) / totalOkrs) : 0;
  const totalKeyResults = okrs.reduce((sum, o) => sum + (o.keyResults?.length || 0), 0);

  const handleOpenAdd = () => {
    const currentEmpId = authUser?.employeeId || 'emp-002';
    const currentDeptId = employees.find(e => e.id === currentEmpId)?.departmentId || departments[0]?.id || 'dept-eng';
    setFormData({
      employeeId: activeRole === 'employee' ? currentEmpId : (employees[1]?.id || 'emp-002'),
      quarter: 'Q4',
      year: 2026,
      objective: 'Scale Review Generation Worker Throughput & Resilience',
      departmentId: currentDeptId,
      keyResults: [
        {
          id: `kr-${Date.now()}-1`,
          title: 'Benchmark 50 concurrent review syntheses under 4 seconds',
          targetValue: 50,
          actualValue: 35,
          unit: 'syntheses',
          completionPercentage: 70,
          status: 'On Track',
        },
        {
          id: `kr-${Date.now()}-2`,
          title: 'Establish zero-downtime deployment pipelines for workers',
          targetValue: 100,
          actualValue: 80,
          unit: '% pipeline',
          completionPercentage: 80,
          status: 'On Track',
        },
      ],
    });
    setIsAddModalOpen(true);
  };

  const handleAddKeyResultRow = () => {
    setFormData((prev) => ({
      ...prev,
      keyResults: [
        ...prev.keyResults,
        {
          id: `kr-${Date.now()}-${prev.keyResults.length + 1}`,
          title: '',
          targetValue: 100,
          actualValue: 0,
          unit: '%',
          completionPercentage: 0,
          status: 'On Track',
        },
      ],
    }));
  };

  const handleRemoveKeyResultRow = (idx: number) => {
    if (formData.keyResults.length <= 1) return;
    setFormData((prev) => ({
      ...prev,
      keyResults: prev.keyResults.filter((_, i) => i !== idx),
    }));
  };

  const handleSaveAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.objective) return;

    setIsSubmitting(true);
    try {
      const totalPerc = formData.keyResults.reduce((acc, kr) => acc + kr.completionPercentage, 0);
      const overall = Math.round(totalPerc / Math.max(1, formData.keyResults.length));

      await addOKR({
        employeeId: formData.employeeId,
        quarter: formData.quarter,
        year: formData.year,
        objective: formData.objective,
        departmentId: formData.departmentId,
        keyResults: formData.keyResults,
        overallProgress: overall,
        status: overall >= 90 ? 'Completed' : overall >= 60 ? 'On Track' : 'At Risk',
      });

      setIsAddModalOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveProgressUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!updatingKr) return;

    setIsSubmitting(true);
    try {
      await updateKeyResultProgress(updatingKr.okr.id, updatingKr.kr.id, updatingKr.actualValue);
      setUpdatingKr(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingOkr) return;
    setIsSubmitting(true);
    try {
      await deleteOKR(deletingOkr.id);
      setDeletingOkr(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const canDelete = activeRole === 'hr_admin' || activeRole === 'manager';

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#E6E8E1]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-[#17251F]">
              Quarterly OKR Management
            </h1>
            <Badge variant="forest">Empirical Evidence</Badge>
          </div>
          <p className="text-xs text-[#747D75] mt-1">
            Track quantitative goals across Q1, Q2, Q3, and Q4. Linked directly into synthesized annual reviews.
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          leftIcon={<Plus className="w-4 h-4" />}
          onClick={handleOpenAdd}
        >
          Add Objective
        </Button>
      </div>

      {/* Metric Cards Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-3.5 bg-[#FFFFFF] border border-[#E6E8E1] rounded-xl shadow-xs">
          <div className="text-[11px] font-medium text-[#747D75] flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5 text-[#2C5E1A]" />
            Total Objectives
          </div>
          <div className="text-xl font-bold text-[#17251F] mt-1">{totalOkrs}</div>
          <div className="text-[10px] text-[#747D75] mt-0.5">Across active FY cycles</div>
        </div>

        <div className="p-3.5 bg-[#FFFFFF] border border-[#E6E8E1] rounded-xl shadow-xs">
          <div className="text-[11px] font-medium text-[#747D75] flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-[#5876D8]" />
            Average Progress
          </div>
          <div className="text-xl font-bold text-[#17251F] mt-1">{averageProgress}%</div>
          <div className="text-[10px] text-[#747D75] mt-0.5">Aggregated Key Results completion</div>
        </div>

        <div className="p-3.5 bg-[#FFFFFF] border border-[#E6E8E1] rounded-xl shadow-xs">
          <div className="text-[11px] font-medium text-[#747D75] flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#2C5E1A]" />
            Completed OKRs
          </div>
          <div className="text-xl font-bold text-[#17251F] mt-1">{completedOkrs} <span className="text-xs font-normal text-[#747D75]">/ {totalOkrs}</span></div>
          <div className="text-[10px] text-[#747D75] mt-0.5">≥90% target completion</div>
        </div>

        <div className="p-3.5 bg-[#FFFFFF] border border-[#E6E8E1] rounded-xl shadow-xs">
          <div className="text-[11px] font-medium text-[#747D75] flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#D97706]" />
            Key Results Tracked
          </div>
          <div className="text-xl font-bold text-[#17251F] mt-1">{totalKeyResults}</div>
          <div className="text-[10px] text-[#747D75] mt-0.5">Empirical review metrics</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="p-4 bg-[#FFFFFF] border border-[#E6E8E1] rounded-xl flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Quarter Pill selector */}
          <div className="inline-flex rounded-lg border border-[#E6E8E1] p-0.5 bg-[#FAFBF8]">
            {['all', 'Q1', 'Q2', 'Q3', 'Q4'].map((q) => (
              <button
                key={q}
                onClick={() => setSelectedQuarter(q)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  selectedQuarter === q
                    ? 'bg-[#17251F] text-white shadow-2xs'
                    : 'text-[#747D75] hover:text-[#17251F]'
                }`}
              >
                {q === 'all' ? 'All Quarters' : q}
              </button>
            ))}
          </div>

          {/* Department Filter */}
          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            className="px-3 py-1.5 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs text-[#202820] focus:outline-none"
          >
            <option value="all">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>

          {/* Employee Filter */}
          <select
            value={selectedEmp}
            onChange={(e) => setSelectedEmp(e.target.value)}
            className="px-3 py-1.5 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs text-[#202820] focus:outline-none"
          >
            <option value="all">All Employees</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} ({e.jobTitle})
              </option>
            ))}
          </select>
        </div>

        <span className="text-xs text-[#747D75] font-medium">
          Showing {filteredOkrs.length} Objective(s)
        </span>
      </div>

      {/* OKR Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredOkrs.length > 0 ? (
          filteredOkrs.map((okr) => {
            const owner = employees.find((e) => e.id === okr.employeeId);

            return (
              <Card key={okr.id} className="flex flex-col justify-between hover:border-[#D0D4CA] transition-all">
                <CardHeader>
                  <div className="flex items-start justify-between gap-3 w-full">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="forest" className="font-mono text-[10px]">
                          {okr.quarter} {okr.year}
                        </Badge>
                        {owner && (
                          <span className="text-xs font-semibold text-[#17251F]">
                            {owner.name}
                          </span>
                        )}
                      </div>
                      <CardTitle className="text-sm mt-1.5 leading-snug">
                        {okr.objective}
                      </CardTitle>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge
                        variant={
                          okr.status === 'Completed'
                            ? 'lime'
                            : okr.status === 'On Track'
                            ? 'forest'
                            : 'amber'
                        }
                        dot
                      >
                        {okr.overallProgress}% • {okr.status}
                      </Badge>
                      {canDelete && (
                        <button
                          onClick={() => setDeletingOkr(okr)}
                          className="p-1 text-[#747D75] hover:text-[#DC2626] rounded transition-colors cursor-pointer"
                          title="Delete OKR"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold text-[#17251F]">
                      <span>Objective Progress</span>
                      <span>{okr.overallProgress}%</span>
                    </div>
                    <ProgressBar value={okr.overallProgress} size="md" colorScheme="forest" />
                  </div>

                  {/* Key Results Details */}
                  <div className="space-y-2.5 pt-2">
                    <span className="text-[10px] font-bold text-[#747D75] uppercase tracking-wider">
                      Key Results ({okr.keyResults.length})
                    </span>

                    {okr.keyResults.map((kr) => (
                      <div
                        key={kr.id}
                        className="p-3 bg-[#FAFBF8] border border-[#E6E8E1] rounded-xl space-y-2"
                      >
                        <div className="flex items-start justify-between gap-3 text-xs">
                          <span className="font-semibold text-[#17251F] leading-tight">
                            {kr.title}
                          </span>
                          <span className="shrink-0 font-mono text-[11px] font-bold text-[#17251F]">
                            {kr.completionPercentage}%
                          </span>
                        </div>

                        <ProgressBar
                          value={kr.completionPercentage}
                          size="sm"
                          colorScheme={kr.completionPercentage >= 90 ? 'lime' : 'blue'}
                        />

                        {/* Interactive actual value adjustment */}
                        <div className="flex items-center justify-between text-[11px] text-[#747D75] pt-1 border-t border-[#E6E8E1]/60">
                          <span>
                            Target: {kr.targetValue}{kr.unit} • Actual: {kr.actualValue}{kr.unit}
                          </span>
                          <button
                            onClick={() => {
                              setUpdatingKr({
                                okr,
                                kr,
                                actualValue: kr.actualValue,
                              });
                            }}
                            className="text-[#5876D8] hover:underline font-semibold cursor-pointer"
                          >
                            Update Progress
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>

                <CardFooter>
                  <div className="text-[11px] text-[#747D75]">
                    Updated on: <span className="font-mono text-[#17251F]">{okr.updatedAt}</span>
                  </div>
                  <span className="text-[10px] text-[#2C5E1A] bg-[#EEF9D1] px-2 py-0.5 rounded-full font-semibold">
                    Evidence Verified
                  </span>
                </CardFooter>
              </Card>
            );
          })
        ) : (
          <div className="md:col-span-2">
            <EmptyState
              icon={<Target className="w-8 h-8 text-[#747D75]" />}
              title="No OKRs found"
              description="No quarterly objectives match the selected filters."
            />
          </div>
        )}
      </div>

      {/* Add Objective Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add Quarterly Objective"
        description="Register a quantitative objective and key results."
        maxWidth="lg"
      >
        <form onSubmit={handleSaveAdd} className="space-y-4 text-xs">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-[#17251F] mb-1">Quarter</label>
              <select
                value={formData.quarter}
                onChange={(e) => setFormData({ ...formData, quarter: e.target.value as Quarter })}
                className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs focus:ring-1 focus:ring-[#17251F]"
              >
                <option value="Q1">Q1</option>
                <option value="Q2">Q2</option>
                <option value="Q3">Q3</option>
                <option value="Q4">Q4</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-[#17251F] mb-1">Year</label>
              <input
                type="number"
                value={formData.year}
                onChange={(e) =>
                  setFormData({ ...formData, year: parseInt(e.target.value, 10) || 2026 })
                }
                className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs focus:ring-1 focus:ring-[#17251F]"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#17251F] mb-1">Assigned Employee</label>
              {activeRole === 'employee' ? (
                <div className="w-full px-3 py-2 bg-[#FAFBF8] border border-[#E6E8E1] rounded-lg text-xs font-semibold text-[#17251F]">
                  {employees.find((e) => e.id === formData.employeeId)?.name || 'Rahul Deshmukh'}
                </div>
              ) : (
                <select
                  value={formData.employeeId}
                  onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                  className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs focus:ring-1 focus:ring-[#17251F]"
                >
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div>
            <label className="block font-semibold text-[#17251F] mb-1">Objective Title</label>
            <input
              type="text"
              required
              value={formData.objective}
              onChange={(e) => setFormData({ ...formData, objective: e.target.value })}
              placeholder="e.g. Modernize API Gateway & Reduce P99 Latencies"
              className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs focus:ring-1 focus:ring-[#17251F]"
            />
          </div>

          {/* Key Results list in modal */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#17251F] uppercase tracking-wider text-[11px]">
                Key Results ({formData.keyResults.length})
              </span>
              <button
                type="button"
                onClick={handleAddKeyResultRow}
                className="text-xs text-[#5876D8] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Add Key Result
              </button>
            </div>

            {formData.keyResults.map((kr, idx) => (
              <div
                key={kr.id}
                className="p-3 bg-[#FAFBF8] border border-[#E6E8E1] rounded-xl space-y-2 relative"
              >
                <div className="flex items-center justify-between gap-2">
                  <input
                    type="text"
                    required
                    placeholder={`Key Result #${idx + 1} description`}
                    value={kr.title}
                    onChange={(e) => {
                      const updated = [...formData.keyResults];
                      updated[idx].title = e.target.value;
                      setFormData({ ...formData, keyResults: updated });
                    }}
                    className="w-full px-3 py-1.5 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs"
                  />
                  {formData.keyResults.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveKeyResultRow(idx)}
                      className="text-[#747D75] hover:text-[#DC2626] p-1 cursor-pointer"
                      title="Remove Key Result"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] text-[#747D75]">Target Value</label>
                    <input
                      type="number"
                      required
                      value={kr.targetValue}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 1;
                        const updated = [...formData.keyResults];
                        updated[idx].targetValue = val;
                        updated[idx].completionPercentage = Math.round(
                          (updated[idx].actualValue / val) * 100
                        );
                        setFormData({ ...formData, keyResults: updated });
                      }}
                      className="w-full px-2 py-1 bg-[#FFFFFF] border border-[#E6E8E1] rounded text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-[#747D75]">Current Actual</label>
                    <input
                      type="number"
                      value={kr.actualValue}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        const updated = [...formData.keyResults];
                        updated[idx].actualValue = val;
                        updated[idx].completionPercentage = Math.round(
                          (val / updated[idx].targetValue) * 100
                        );
                        setFormData({ ...formData, keyResults: updated });
                      }}
                      className="w-full px-2 py-1 bg-[#FFFFFF] border border-[#E6E8E1] rounded text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-[#747D75]">Metric Unit</label>
                    <input
                      type="text"
                      required
                      placeholder="%, ms, deals"
                      value={kr.unit}
                      onChange={(e) => {
                        const updated = [...formData.keyResults];
                        updated[idx].unit = e.target.value;
                        setFormData({ ...formData, keyResults: updated });
                      }}
                      className="w-full px-2 py-1 bg-[#FFFFFF] border border-[#E6E8E1] rounded text-xs"
                    />
                  </div>
                </div>
              </div>
            ))}
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
            <Button type="submit" variant="primary" size="sm" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save Objective'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Update Key Result Progress Modal */}
      {updatingKr && (
        <Modal
          isOpen={true}
          onClose={() => setUpdatingKr(null)}
          title="Update Key Result Progress"
          description={`Update quantitative progress for "${updatingKr.kr.title}"`}
          maxWidth="sm"
        >
          <form onSubmit={handleSaveProgressUpdate} className="space-y-4 text-xs">
            <div className="p-3 bg-[#FAFBF8] border border-[#E6E8E1] rounded-xl space-y-2">
              <div className="text-[#17251F] font-semibold">{updatingKr.kr.title}</div>
              <div className="flex items-center justify-between text-[11px] text-[#747D75]">
                <span>Target: <strong>{updatingKr.kr.targetValue} {updatingKr.kr.unit}</strong></span>
                <span>Current: <strong>{updatingKr.kr.actualValue} {updatingKr.kr.unit}</strong></span>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-[#17251F] mb-1">
                New Actual Value ({updatingKr.kr.unit})
              </label>
              <input
                type="number"
                step="any"
                required
                value={updatingKr.actualValue}
                onChange={(e) =>
                  setUpdatingKr({
                    ...updatingKr,
                    actualValue: parseFloat(e.target.value) || 0,
                  })
                }
                className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs focus:ring-1 focus:ring-[#17251F]"
              />
              <div className="text-[11px] text-[#747D75] mt-1">
                Calculated Completion:{' '}
                <strong>
                  {Math.min(
                    150,
                    Math.round(
                      (updatingKr.actualValue / Math.max(0.001, updatingKr.kr.targetValue)) * 100
                    )
                  )}
                  %
                </strong>
              </div>
            </div>

            <div className="pt-3 border-t border-[#E6E8E1] flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setUpdatingKr(null)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Update Progress'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete OKR Confirmation Modal */}
      {deletingOkr && (
        <Modal
          isOpen={true}
          onClose={() => setDeletingOkr(null)}
          title="Delete Quarterly Objective"
          description={`Are you sure you want to permanently delete this objective?`}
          maxWidth="sm"
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-[#FEF2F2] border border-[#FCA5A5] rounded-xl flex items-start gap-2.5 text-[#991B1B]">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Destructive Action</span>
                <p className="text-[11px] mt-0.5">
                  Deleting &quot;{deletingOkr.objective}&quot; ({deletingOkr.quarter} {deletingOkr.year}) will permanently remove all linked empirical evidence citations.
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-[#E6E8E1] flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setDeletingOkr(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                className="bg-[#DC2626] hover:bg-[#B91C1C] text-white"
                onClick={handleConfirmDelete}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Deleting...' : 'Delete Objective'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
