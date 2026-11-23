'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useStore } from '@/lib/storage/use-store';
import { PerformanceReview } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { EmptyState } from '@/components/ui/empty-state';
import {
  FileCheck2,
  Printer,
  ArrowLeft,
  Sparkles,
  CheckCircle2,
  Send,
  Edit3,
  Save,
  X,
  AlertTriangle,
  History,
  RotateCcw,
  Check
} from 'lucide-react';

export default function ReviewDetailPage() {
  const params = useParams();
  const router = useRouter();
  const reviewId = params?.id as string;

  const {
    performanceReviews,
    submitReviewForApproval,
    requestReviewChanges,
    approveReview,
    publishReview,
    updateReviewSection,
    showToast,
    activeRole,
    authUser,
    employees,
  } = useStore();

  const review = performanceReviews.find(r => r.id === reviewId);

  const [managerComments, setManagerComments] = useState(
    review?.managerFeedbackNotes || ''
  );
  const [editingSectionKey, setEditingSectionKey] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [isRequestChangesOpen, setIsRequestChangesOpen] = useState(false);
  const [changeNotes, setChangeNotes] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const isHrAdmin = activeRole === 'hr_admin' || authUser?.role === 'hr_admin';
  const isManagerOrAdmin = isHrAdmin || activeRole === 'manager' || authUser?.role === 'manager';

  if (!review) {
    return (
      <div className="max-w-4xl mx-auto py-12">
        <EmptyState
          icon={<FileCheck2 className="w-8 h-8 text-[#747D75]" />}
          title="Review Document Not Found"
          description="The requested review could not be located in the system."
          actionLabel="Back to Reviews"
          onAction={() => router.push('/reviews')}
        />
      </div>
    );
  }

  const currentEmpId =
    authUser?.employeeId ||
    employees.find(e => e.email.toLowerCase() === authUser?.email?.toLowerCase())?.id ||
    'emp-002';
  const isEmployee = activeRole === 'employee';

  // Strict employee privacy check: only own Approved or Released reviews can be inspected by employees
  if (isEmployee) {
    const isOwnReview =
      review.employeeId === currentEmpId ||
      (authUser?.email &&
        employees.find(e => e.id === review.employeeId)?.email?.toLowerCase() ===
          authUser.email.toLowerCase());

    if (!isOwnReview) {
      return (
        <div className="max-w-4xl mx-auto py-12">
          <EmptyState
            icon={<AlertTriangle className="w-8 h-8 text-[#9E2A2B]" />}
            title="Access Restricted: Confidential Evaluation"
            description="Employees are only authorized to view their own personal performance evaluations."
            actionLabel="Back to Reviews"
            onAction={() => router.push('/reviews')}
          />
        </div>
      );
    }

    if (review.status !== 'Approved' && review.status !== 'Released') {
      return (
        <div className="max-w-4xl mx-auto py-12">
          <EmptyState
            icon={<AlertTriangle className="w-8 h-8 text-[#D97706]" />}
            title="Review Under Active Calibration"
            description="Your performance review is currently undergoing manager drafting and calibration. It will become visible here once formally approved by leadership."
            actionLabel="Back to Reviews"
            onAction={() => router.push('/reviews')}
          />
        </div>
      );
    }
  }

  const sectionKeys: (keyof PerformanceReview['sections'])[] = [
    'overallSummary',
    'majorAchievements',
    'keyStrengths',
    'collaborationAndCommunication',
    'okrAchievementSummary',
    'areasForDevelopment',
    'futureGoals',
    'managerRecommendations'
  ];

  const handlePrint = () => {
    window.print();
  };

  const handleSubmitForApproval = async () => {
    setIsLoading(true);
    await submitReviewForApproval(review.id);
    setIsLoading(false);
  };

  const handleApprove = async () => {
    setIsLoading(true);
    await approveReview(review.id);
    setIsLoading(false);
  };

  const handleRelease = async () => {
    setIsLoading(true);
    await publishReview(review.id);
    setIsLoading(false);
  };

  const handleConfirmRequestChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!changeNotes.trim()) return;
    setIsLoading(true);
    await requestReviewChanges(review.id, changeNotes.trim());
    setIsLoading(false);
    setIsRequestChangesOpen(false);
    setChangeNotes('');
  };

  const handleStartEditSection = (key: string, currentContent: string) => {
    setEditingSectionKey(key);
    setEditingContent(currentContent);
  };

  const handleSaveSectionEdit = async (key: string) => {
    setIsLoading(true);
    await updateReviewSection(review.id, key, editingContent);
    setIsLoading(false);
    setEditingSectionKey(null);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      {/* Top Header & Navigation Actions (Hidden during print) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 no-print">
        <Link
          href="/reviews"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#747D75] hover:text-[#17251F] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Reviews</span>
        </Link>

        {/* Workflow Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Printer className="w-3.5 h-3.5" />}
            onClick={handlePrint}
          >
            Export / Print PDF
          </Button>

          {isManagerOrAdmin && (
            <Link href={`/ai-review-studio?employeeId=${review.employeeId}`}>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Sparkles className="w-3.5 h-3.5 text-[#17251F]" />}
              >
                Open in Studio
              </Button>
            </Link>
          )}

          {/* Workflow Transitions */}
          {isManagerOrAdmin && (review.status === 'Draft' || review.status === 'Changes Requested') && (
            <Button
              variant="primary"
              size="sm"
              isLoading={isLoading}
              leftIcon={<Send className="w-3.5 h-3.5 text-[#C8ED78]" />}
              onClick={handleSubmitForApproval}
            >
              Submit for Approval
            </Button>
          )}

          {isManagerOrAdmin && (review.status === 'Pending Approval' || review.status === 'Approved') && (
            <Button
              variant="secondary"
              size="sm"
              isLoading={isLoading}
              leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
              onClick={() => setIsRequestChangesOpen(true)}
            >
              Request Changes
            </Button>
          )}

          {isManagerOrAdmin && review.status === 'Pending Approval' && (
            <Button
              variant="primary"
              size="sm"
              isLoading={isLoading}
              leftIcon={<CheckCircle2 className="w-3.5 h-3.5 text-[#C8ED78]" />}
              onClick={handleApprove}
            >
              Approve Review
            </Button>
          )}

          {(isHrAdmin || isManagerOrAdmin) && review.status === 'Approved' && (
            <Button
              variant="primary"
              size="sm"
              isLoading={isLoading}
              leftIcon={<Send className="w-3.5 h-3.5 text-[#C8ED78]" />}
              onClick={handleRelease}
            >
              Release to Employee Portal
            </Button>
          )}
        </div>
      </div>

      {/* Revision Requested Notice */}
      {review.status === 'Changes Requested' && review.managerFeedbackNotes && (
        <div className="p-4 bg-[#FEF6E7] border border-[#FBDCA8] rounded-2xl flex items-start gap-3 text-xs text-[#92540D] no-print">
          <AlertTriangle className="w-5 h-5 text-[#D97706] shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-bold">Revisions Requested by Approver</div>
            <p className="leading-relaxed">{review.managerFeedbackNotes}</p>
          </div>
        </div>
      )}

      {/* Printable Formal Review Report Document */}
      <div className="bg-[#FFFFFF] border border-[#E6E8E1] rounded-2xl shadow-sm p-8 sm:p-12 space-y-8 card-print">
        {/* Document Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 pb-6 border-b-2 border-[#17251F]">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded bg-[#17251F] text-[#C8ED78] flex items-center justify-center font-bold text-xs">
                RF
              </div>
              <span className="font-bold text-sm tracking-tight text-[#17251F]">
                ReviewForge Enterprise Performance Document
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-[#17251F]">
              {review.employeeName}
            </h1>
            <p className="text-xs text-[#747D75] mt-0.5">
              {review.jobTitle} • {review.departmentName}
            </p>
          </div>

          <div className="text-right sm:text-right space-y-1">
            <span className="text-[10px] uppercase font-bold text-[#747D75]">
              {review.reviewCycleTitle}
            </span>
            <div className="flex items-center sm:justify-end gap-2 mt-1">
              <span className="text-xs text-[#747D75]">Final Rating:</span>
              <span className="px-3 py-1 rounded-lg bg-[#17251F] text-[#C8ED78] font-extrabold text-sm">
                {review.overallRating} / 5.0
              </span>
            </div>
            <div className="text-[11px] font-semibold text-[#2C5E1A]">
              Evidence Coverage: {review.evidenceCoverageScore}%
            </div>
          </div>
        </div>

        {/* Metadata summary bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-[#FAFBF8] border border-[#E6E8E1] rounded-xl text-xs">
          <div>
            <span className="text-[10px] uppercase font-bold text-[#747D75]">Review Status</span>
            <div className="font-bold text-[#17251F] mt-0.5">
              <Badge
                variant={
                  review.status === 'Released'
                    ? 'blue'
                    : review.status === 'Approved'
                    ? 'lime'
                    : review.status === 'Changes Requested'
                    ? 'rose'
                    : 'amber'
                }
                dot
              >
                {review.status}
              </Badge>
            </div>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-[#747D75]">Generated On</span>
            <div className="font-mono text-[#17251F] mt-0.5">
              {new Date(review.generatedAt).toLocaleDateString()}
            </div>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-[#747D75]">Approver</span>
            <div className="font-semibold text-[#17251F] mt-0.5">
              {review.approverName || (review.status === 'Released' ? 'HR Leadership' : 'Pending Sign-off')}
            </div>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-[#747D75]">Synthesis Engine</span>
            <div className="font-mono text-[10px] text-[#747D75] mt-0.5 truncate">
              {review.synthesisEngine}
            </div>
          </div>
        </div>

        {/* 8 Formal Sections with Inline Editing Support */}
        <div className="space-y-7">
          {sectionKeys.map((k, index) => {
            const section = review.sections[k];
            const isEditing = editingSectionKey === k;

            return (
              <div key={k} className="space-y-2 print-avoid-break p-3.5 rounded-xl border border-transparent hover:border-[#E6E8E1] transition-all">
                <div className="flex items-center justify-between pb-1 border-b border-[#E6E8E1]">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-[#17251F] text-[#C8ED78] flex items-center justify-center font-bold text-[10px]">
                      {index + 1}
                    </span>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#17251F]">
                      {section.title}
                    </h3>
                  </div>

                  {/* Inline Edit Button (Hidden if released or non-manager) */}
                  {isManagerOrAdmin && review.status !== 'Released' && !isEditing && (
                    <button
                      onClick={() => handleStartEditSection(k, section.content)}
                      className="no-print flex items-center gap-1 text-[11px] font-medium text-[#747D75] hover:text-[#17251F] px-2 py-0.5 rounded hover:bg-[#F0F2EB] transition-colors cursor-pointer"
                      title="Edit section content with evidence links preserved"
                    >
                      <Edit3 className="w-3 h-3" />
                      <span>Edit Content</span>
                    </button>
                  )}
                </div>

                {isEditing ? (
                  <div className="space-y-2 pt-1 no-print">
                    <textarea
                      rows={4}
                      value={editingContent}
                      onChange={e => setEditingContent(e.target.value)}
                      className="w-full p-3 bg-[#FAFBF8] border border-[#17251F] rounded-lg text-xs text-[#202820] leading-relaxed focus:bg-white focus:outline-none"
                    />
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setEditingSectionKey(null)}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        variant="primary"
                        isLoading={isLoading}
                        leftIcon={<Save className="w-3 h-3" />}
                        onClick={() => handleSaveSectionEdit(k)}
                      >
                        Save & Preserve Citations
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-[#202820] leading-relaxed">
                    {section.content}
                  </p>
                )}

                {/* Linked Evidence Citations */}
                {section.evidenceRefs && section.evidenceRefs.length > 0 && (
                  <div className="pt-1 flex flex-wrap gap-1.5">
                    {section.evidenceRefs.map(ev => (
                      <span
                        key={ev.id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#FAFBF8] border border-[#CADACD] text-[10px] text-[#17251F]"
                      >
                        <strong>{ev.sourceType}:</strong> {ev.sourceTitle}
                        {ev.metrics && (
                          <span className="font-bold text-[#2C5E1A]">({ev.metrics})</span>
                        )}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Workflow Audit Trail Timeline */}
        {review.workflowHistory && review.workflowHistory.length > 0 && (
          <div className="pt-6 border-t-2 border-[#E6E8E1] space-y-3 no-print">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-[#17251F]" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#17251F]">
                Calibration & Publishing Audit Trail
              </h3>
            </div>
            <div className="divide-y divide-[#E6E8E1] bg-[#FAFBF8] border border-[#E6E8E1] rounded-xl overflow-hidden">
              {review.workflowHistory.map((item, idx) => (
                <div key={idx} className="p-3 text-xs flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[#17251F]">{item.action}</span>
                      <span className="text-[10px] text-[#747D75]">
                        by {item.actorName} ({item.actorRole})
                      </span>
                    </div>
                    {item.notes && (
                      <p className="text-[11px] text-[#747D75] mt-0.5 italic">
                        &quot;{item.notes}&quot;
                      </p>
                    )}
                  </div>
                  <span className="font-mono text-[10px] text-[#747D75] shrink-0">
                    {new Date(item.timestamp).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Formal Signature Box */}
        <div className="pt-6 border-t-2 border-[#E6E8E1] space-y-4 print-avoid-break">
          <div className="grid grid-cols-2 gap-8 pt-4 text-xs">
            <div>
              <span className="text-[10px] text-[#747D75] uppercase font-bold">
                Evaluating Manager Sign-Off
              </span>
              <div className="mt-4 pt-1 border-b border-[#202820] font-semibold text-[#17251F]">
                {review.approverName || 'Elena Rostova (Engineering Manager)'}
              </div>
              <div className="text-[10px] text-[#747D75] mt-1 font-mono">
                Approved: {review.approvedAt ? new Date(review.approvedAt).toLocaleDateString() : 'Pending Sign-off'}
              </div>
            </div>

            <div>
              <span className="text-[10px] text-[#747D75] uppercase font-bold">
                HR Administration & Publishing Gate
              </span>
              <div className="mt-4 pt-1 border-b border-[#202820] font-semibold text-[#17251F]">
                {review.releasedAt ? 'ReviewForge HR Governance' : 'Pending Formal Release'}
              </div>
              <div className="text-[10px] text-[#747D75] mt-1 font-mono">
                Released: {review.releasedAt ? new Date(review.releasedAt).toLocaleDateString() : 'Awaiting HR Release'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Request Changes Modal */}
      <Modal
        isOpen={isRequestChangesOpen}
        onClose={() => setIsRequestChangesOpen(false)}
        title="Request Review Revisions"
        description="Return this review draft to the evaluating manager with specific calibration feedback."
        maxWidth="md"
      >
        <form onSubmit={handleConfirmRequestChanges} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-[#17251F] mb-1">
              Calibration Feedback & Required Adjustments
            </label>
            <textarea
              rows={4}
              required
              value={changeNotes}
              onChange={e => setChangeNotes(e.target.value)}
              placeholder="e.g. Please recalibrate section 6 to account for cross-team RFC contributions..."
              className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E6E8E1] rounded-xl text-xs focus:ring-1 focus:ring-[#17251F]"
            />
          </div>

          <div className="pt-3 border-t border-[#E6E8E1] flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setIsRequestChangesOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="danger"
              size="sm"
              isLoading={isLoading}
            >
              Confirm Revision Request
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
