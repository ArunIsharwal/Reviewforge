'use client';

import React, { useState } from 'react';
import { useStore } from '@/lib/storage/use-store';
import { FeedbackRating } from '@/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs } from '@/components/ui/tabs';
import { Modal } from '@/components/ui/modal';
import { EmptyState } from '@/components/ui/empty-state';
import {
  MessageSquareQuote,
  Plus,
  Lock,
  EyeOff,
  UserCheck,
  Star,
  CheckCircle2,
  Clock,
  Send,
  UserPlus,
  XCircle,
  HelpCircle,
  TrendingUp,
} from 'lucide-react';

export default function FeedbackPage() {
  const {
    feedback,
    feedbackRequests,
    employees,
    addFeedback,
    createFeedbackRequest,
    declineFeedbackRequest,
    activeRole,
    reviewCycles,
  } = useStore();

  const [activeTab, setActiveTab] = useState<'all' | 'submitted' | 'requests'>('all');
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [activeRequestId, setActiveRequestId] = useState<string | undefined>(undefined);

  // Submit Feedback Form states
  const [targetEmpId, setTargetEmpId] = useState(employees[1]?.id || 'emp-002');
  const [relationship, setRelationship] = useState<'Peer' | 'Direct Report' | 'Manager' | 'Cross-Functional'>('Peer');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [ratings, setRatings] = useState<FeedbackRating>({
    collaboration: 5,
    communication: 4,
    problemSolving: 5,
    technicalContribution: 5,
    leadership: 4,
  });
  const [strengths, setStrengths] = useState('');
  const [improvements, setImprovements] = useState('');
  const [comments, setComments] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Request Feedback Form states
  const [reqTargetEmpId, setReqTargetEmpId] = useState(employees[1]?.id || 'emp-002');
  const [reqReviewerEmpId, setReqReviewerEmpId] = useState(employees[2]?.id || 'emp-003');
  const [reqRelationship, setReqRelationship] = useState<'Peer' | 'Direct Report' | 'Manager' | 'Cross-Functional'>('Peer');
  const [reqDueDate, setReqDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().split('T')[0];
  });
  const [reqMessage, setReqMessage] = useState('');
  const [isRequesting, setIsRequesting] = useState(false);

  const targetEmployee = employees.find((e) => e.id === targetEmpId) || employees[0];
  const activeCycle = reviewCycles.find((c) => c.status === 'Active') || reviewCycles[0];

  const submittedFeedback = feedback.filter((f) => f.status === 'Submitted');
  const pendingRequests = feedbackRequests.filter((r) => r.status === 'Pending');

  // Compute aggregate stats for summary bar
  const totalFeedbackCount = feedback.length;
  const anonymousCount = feedback.filter((f) => f.isAnonymous).length;
  const anonymousPercentage = totalFeedbackCount > 0 ? Math.round((anonymousCount / totalFeedbackCount) * 100) : 0;

  const averageRating =
    totalFeedbackCount > 0
      ? (
          feedback.reduce((sum, f) => {
            const r = f.ratings;
            return sum + (r.collaboration + r.communication + r.problemSolving + r.technicalContribution + r.leadership) / 5;
          }, 0) / totalFeedbackCount
        ).toFixed(1)
      : '0.0';

  const handleOpenSubmit = (prefillTargetId?: string, requestId?: string) => {
    if (prefillTargetId) {
      setTargetEmpId(prefillTargetId);
    } else {
      setTargetEmpId(employees[1]?.id || 'emp-002');
    }
    setActiveRequestId(requestId);
    setIsAnonymous(false);
    setRelationship('Peer');
    setRatings({
      collaboration: 5,
      communication: 4,
      problemSolving: 5,
      technicalContribution: 5,
      leadership: 4,
    });
    setStrengths(
      'Consistently reliable and high technical craftsmanship. Delivered significant latency improvements.'
    );
    setImprovements(
      'Document architectural decisions in formal RFCs earlier in the sprint.'
    );
    setComments('High-leverage contributor to our squad goals.');
    setIsSubmitModalOpen(true);
  };

  const handleSaveFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetEmployee) return;

    setIsSubmitting(true);
    try {
      await addFeedback({
        reviewCycleId: activeCycle?.id || 'cycle-2026-annual',
        targetEmployeeId: targetEmployee.id,
        targetEmployeeName: targetEmployee.name,
        providerEmployeeId: isAnonymous ? null : 'emp-003',
        providerEmployeeName: isAnonymous ? 'Anonymous Colleague' : 'Elena Rostova',
        providerRole: isAnonymous ? 'Peer (Anonymized)' : `${relationship} Reviewer`,
        isAnonymous,
        ratings,
        strengths,
        improvements,
        additionalComments: comments,
        status: 'Submitted',
      });
      setIsSubmitModalOpen(false);
      setActiveRequestId(undefined);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    const reqTarget = employees.find((e) => e.id === reqTargetEmpId);
    const reqReviewer = employees.find((e) => e.id === reqReviewerEmpId);
    if (!reqTarget || !reqReviewer) return;

    setIsRequesting(true);
    try {
      await createFeedbackRequest({
        reviewCycleId: activeCycle?.id || 'cycle-2026-annual',
        targetEmployeeId: reqTarget.id,
        targetEmployeeName: reqTarget.name,
        reviewerEmployeeId: reqReviewer.id,
        reviewerEmployeeName: reqReviewer.name,
        relationship: reqRelationship,
        dueDate: reqDueDate,
        message: reqMessage,
      });
      setIsRequestModalOpen(false);
      setReqMessage('');
    } finally {
      setIsRequesting(false);
    }
  };

  const handleDeclineRequest = async (requestId: string) => {
    await declineFeedbackRequest(requestId);
  };

  const tabs = [
    { id: 'all', label: 'All Feedback', count: feedback.length },
    { id: 'submitted', label: 'Submitted Reviews', count: submittedFeedback.length },
    { id: 'requests', label: 'Pending Requests', count: pendingRequests.length },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#E6E8E1]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-[#17251F]">
              360° Peer Feedback Management
            </h1>
            <Badge variant="sage">Multi-Rater</Badge>
          </div>
          <p className="text-xs text-[#747D75] mt-1">
            Collect balanced, multi-dimensional ratings across collaboration, problem-solving, and technical delivery.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<UserPlus className="w-4 h-4" />}
            onClick={() => setIsRequestModalOpen(true)}
          >
            Request Feedback
          </Button>
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={() => handleOpenSubmit()}
          >
            Submit Peer Feedback
          </Button>
        </div>
      </div>

      {/* Metrics Summary Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-3.5 bg-[#FFFFFF] border border-[#E6E8E1] rounded-xl shadow-xs">
          <div className="text-[11px] font-medium text-[#747D75] flex items-center gap-1.5">
            <MessageSquareQuote className="w-3.5 h-3.5 text-[#2C5E1A]" />
            Total Reviews
          </div>
          <div className="text-xl font-bold text-[#17251F] mt-1">{totalFeedbackCount}</div>
          <div className="text-[10px] text-[#747D75] mt-0.5">Across active review cycles</div>
        </div>

        <div className="p-3.5 bg-[#FFFFFF] border border-[#E6E8E1] rounded-xl shadow-xs">
          <div className="text-[11px] font-medium text-[#747D75] flex items-center gap-1.5">
            <Star className="w-3.5 h-3.5 text-[#D97706] fill-[#D97706]" />
            Average Score
          </div>
          <div className="text-xl font-bold text-[#17251F] mt-1">{averageRating} <span className="text-xs font-normal text-[#747D75]">/ 5.0</span></div>
          <div className="text-[10px] text-[#747D75] mt-0.5">5-rubric aggregated score</div>
        </div>

        <div className="p-3.5 bg-[#FFFFFF] border border-[#E6E8E1] rounded-xl shadow-xs">
          <div className="text-[11px] font-medium text-[#747D75] flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-[#5876D8]" />
            Pending Requests
          </div>
          <div className="text-xl font-bold text-[#17251F] mt-1">{pendingRequests.length}</div>
          <div className="text-[10px] text-[#747D75] mt-0.5">Awaiting provider completion</div>
        </div>

        <div className="p-3.5 bg-[#FFFFFF] border border-[#E6E8E1] rounded-xl shadow-xs">
          <div className="text-[11px] font-medium text-[#747D75] flex items-center gap-1.5">
            <EyeOff className="w-3.5 h-3.5 text-[#747D75]" />
            Anonymous Attributions
          </div>
          <div className="text-xl font-bold text-[#17251F] mt-1">{anonymousPercentage}%</div>
          <div className="text-[10px] text-[#747D75] mt-0.5">{anonymousCount} of {totalFeedbackCount} anonymous</div>
        </div>
      </div>

      {/* Anonymity Security Notice */}
      <div className="p-3.5 bg-[#FAFBF8] border border-[#E6E8E1] rounded-xl flex items-start gap-3 text-xs text-[#747D75]">
        <Lock className="w-4 h-4 text-[#5876D8] shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-[#17251F]">
            Strict Anonymity Policy Enforced
          </span>
          <p className="text-[11px] mt-0.5 leading-relaxed">
            When feedback is marked anonymous, provider identity and IDs are completely masked
            in employee-facing interfaces. Currently viewing as{' '}
            <strong className="text-[#17251F]">{activeRole.toUpperCase()}</strong>.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        tabs={tabs}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as 'all' | 'submitted' | 'requests')}
      />

      {/* Tab Content: Requests Tab */}
      {activeTab === 'requests' ? (
        <div className="space-y-3">
          {pendingRequests.length > 0 ? (
            pendingRequests.map((req) => (
              <Card key={req.id} className="p-4 space-y-3 hover:border-[#D0D4CA] transition-all">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-[#E6E8E1]">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[#17251F]">
                        Feedback Request for {req.targetEmployeeName}
                      </span>
                      <Badge variant="amber" className="text-[10px]">
                        <Clock className="w-3 h-3 mr-1" /> Pending
                      </Badge>
                      {req.relationship && (
                        <Badge variant="outline" className="text-[10px]">
                          {req.relationship}
                        </Badge>
                      )}
                    </div>
                    <div className="text-[11px] text-[#747D75] mt-0.5">
                      Assigned Reviewer: <strong className="text-[#17251F]">{req.reviewerEmployeeName}</strong>
                      {req.requestedByName && (
                        <span> • Requested by: <strong>{req.requestedByName}</strong></span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-[#747D75]">
                      Due: {req.dueDate}
                    </span>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleOpenSubmit(req.targetEmployeeId, req.id)}
                      className="text-xs py-1 h-7"
                    >
                      Give Feedback
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleDeclineRequest(req.id)}
                      className="text-xs py-1 h-7 text-[#DC2626] hover:bg-[#FEF2F2]"
                    >
                      Decline
                    </Button>
                  </div>
                </div>

                {req.message && (
                  <div className="p-2.5 bg-[#FAFBF8] rounded-lg border border-[#E6E8E1] text-xs text-[#202820]">
                    <span className="font-semibold text-[#747D75]">Request Note: </span>
                    {req.message}
                  </div>
                )}
              </Card>
            ))
          ) : (
            <EmptyState
              icon={<CheckCircle2 className="w-8 h-8 text-[#2C5E1A]" />}
              title="No pending feedback requests"
              description="All assigned peer feedback requests have been completed or none are currently assigned."
            />
          )}
        </div>
      ) : (
        /* Tab Content: Feedback Items Grid */
        <div className="space-y-4">
          {(activeTab === 'all' ? feedback : submittedFeedback).length > 0 ? (
            (activeTab === 'all' ? feedback : submittedFeedback).map((item) => {
              const isEmployeeView = activeRole === 'employee';
              const displayProviderName =
                item.isAnonymous && isEmployeeView
                  ? 'Anonymous Colleague'
                  : item.providerEmployeeName;

              return (
                <Card key={item.id} className="p-5 space-y-3.5 hover:border-[#D0D4CA] transition-all">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#E6E8E1]">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[#17251F]">
                          Feedback for {item.targetEmployeeName}
                        </span>
                        {item.isAnonymous ? (
                          <Badge variant="outline" className="text-[10px]">
                            <EyeOff className="w-3 h-3 mr-1" /> Anonymous
                          </Badge>
                        ) : (
                          <Badge variant="forest" className="text-[10px]">
                            Public Attribution
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-[10px]">
                          {item.relationship || item.providerRole}
                        </Badge>
                      </div>
                      <div className="text-[11px] text-[#747D75] mt-0.5">
                        Submitted by: <strong className="text-[#17251F]">{displayProviderName}</strong> ({item.providerRole})
                      </div>
                    </div>

                    <span className="text-[11px] font-mono text-[#747D75]">
                      {item.submittedAt}
                    </span>
                  </div>

                  {/* 5-Dimension Ratings Bar */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs">
                    <div className="p-2 bg-[#FAFBF8] rounded-lg border border-[#E6E8E1]">
                      <div className="text-[10px] text-[#747D75]">Collaboration</div>
                      <div className="font-bold text-[#17251F] flex items-center justify-center gap-1 mt-0.5">
                        <Star className="w-3 h-3 text-[#D97706] fill-[#D97706]" />
                        <span>{item.ratings?.collaboration || 0}/5</span>
                      </div>
                    </div>
                    <div className="p-2 bg-[#FAFBF8] rounded-lg border border-[#E6E8E1]">
                      <div className="text-[10px] text-[#747D75]">Communication</div>
                      <div className="font-bold text-[#17251F] flex items-center justify-center gap-1 mt-0.5">
                        <Star className="w-3 h-3 text-[#D97706] fill-[#D97706]" />
                        <span>{item.ratings?.communication || 0}/5</span>
                      </div>
                    </div>
                    <div className="p-2 bg-[#FAFBF8] rounded-lg border border-[#E6E8E1]">
                      <div className="text-[10px] text-[#747D75]">Problem Solving</div>
                      <div className="font-bold text-[#17251F] flex items-center justify-center gap-1 mt-0.5">
                        <Star className="w-3 h-3 text-[#D97706] fill-[#D97706]" />
                        <span>{item.ratings?.problemSolving || 0}/5</span>
                      </div>
                    </div>
                    <div className="p-2 bg-[#FAFBF8] rounded-lg border border-[#E6E8E1]">
                      <div className="text-[10px] text-[#747D75]">Technical Impact</div>
                      <div className="font-bold text-[#17251F] flex items-center justify-center gap-1 mt-0.5">
                        <Star className="w-3 h-3 text-[#D97706] fill-[#D97706]" />
                        <span>{item.ratings?.technicalContribution || 0}/5</span>
                      </div>
                    </div>
                    <div className="p-2 bg-[#FAFBF8] rounded-lg border border-[#E6E8E1]">
                      <div className="text-[10px] text-[#747D75]">Leadership</div>
                      <div className="font-bold text-[#17251F] flex items-center justify-center gap-1 mt-0.5">
                        <Star className="w-3 h-3 text-[#D97706] fill-[#D97706]" />
                        <span>{item.ratings?.leadership || 0}/5</span>
                      </div>
                    </div>
                  </div>

                  {/* Qualitative Feedback */}
                  <div className="space-y-2 text-xs pt-1">
                    <div className="p-3 bg-[#FAFBF8] rounded-lg border border-[#E6E8E1]">
                      <span className="font-bold text-[#2C5E1A]">Observed Strengths: </span>
                      <span className="text-[#202820] leading-relaxed">{item.strengths}</span>
                    </div>
                    <div className="p-3 bg-[#FAFBF8] rounded-lg border border-[#E6E8E1]">
                      <span className="font-bold text-[#92540D]">Areas for Growth: </span>
                      <span className="text-[#202820] leading-relaxed">{item.improvements}</span>
                    </div>
                    {item.additionalComments && (
                      <div className="text-[11px] text-[#747D75] italic px-1">
                        &quot;{item.additionalComments}&quot;
                      </div>
                    )}
                  </div>
                </Card>
              );
            })
          ) : (
            <EmptyState
              icon={<MessageSquareQuote className="w-8 h-8 text-[#747D75]" />}
              title="No feedback items in this tab"
              description="No 360 peer feedback found for this filter selection."
            />
          )}
        </div>
      )}

      {/* Submit Feedback Modal */}
      <Modal
        isOpen={isSubmitModalOpen}
        onClose={() => setIsSubmitModalOpen(false)}
        title="Submit 360° Peer Review"
        description="Provide multi-dimensional performance feedback for a colleague."
        maxWidth="lg"
      >
        <form onSubmit={handleSaveFeedback} className="space-y-4 text-xs">
          {/* Target Colleague */}
          <div>
            <label className="block font-semibold text-[#17251F] mb-1">
              Select Colleague
            </label>
            <select
              value={targetEmpId}
              onChange={(e) => setTargetEmpId(e.target.value)}
              className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs focus:ring-1 focus:ring-[#17251F]"
            >
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} ({e.jobTitle} • {e.departmentName})
                </option>
              ))}
            </select>
          </div>

          {/* Perspective / Relationship */}
          <div>
            <label className="block font-semibold text-[#17251F] mb-1">
              Your Professional Relationship to Colleague
            </label>
            <select
              value={relationship}
              onChange={(e) => setRelationship(e.target.value as any)}
              className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs focus:ring-1 focus:ring-[#17251F]"
            >
              <option value="Peer">Peer / Squad Colleague</option>
              <option value="Direct Report">Direct Report</option>
              <option value="Manager">Manager / Squad Lead</option>
              <option value="Cross-Functional">Cross-Functional Partner</option>
            </select>
          </div>

          {/* Anonymity Toggle */}
          <div className="p-3 bg-[#FAFBF8] border border-[#E6E8E1] rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <EyeOff className="w-4 h-4 text-[#5876D8]" />
              <div>
                <div className="font-semibold text-[#17251F]">Submit Anonymously</div>
                <div className="text-[10px] text-[#747D75]">
                  Hides your identity from the recipient in employee-facing reports.
                </div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={isAnonymous}
              onChange={(e) => setIsAnonymous(e.target.checked)}
              className="w-4 h-4 accent-[#17251F] cursor-pointer"
            />
          </div>

          {/* 5-Dimension Rating Sliders */}
          <div className="space-y-3 pt-1">
            <span className="font-bold text-[#17251F] text-xs uppercase tracking-wider">
              Performance Rubric (1 to 5)
            </span>

            {[
              { key: 'collaboration', label: 'Cross-Squad Collaboration' },
              { key: 'communication', label: 'Clarity of Communication' },
              { key: 'problemSolving', label: 'Analytical Problem Solving' },
              { key: 'technicalContribution', label: 'Technical Execution & Quality' },
              { key: 'leadership', label: 'Ownership & Leadership' },
            ].map((dim) => (
              <div key={dim.key} className="flex items-center justify-between gap-4">
                <span className="text-xs text-[#202820] w-48">{dim.label}</span>
                <input
                  type="range"
                  min={1}
                  max={5}
                  step={1}
                  value={ratings[dim.key as keyof FeedbackRating]}
                  onChange={(e) =>
                    setRatings({
                      ...ratings,
                      [dim.key]: parseInt(e.target.value, 10),
                    })
                  }
                  className="w-36 accent-[#17251F] cursor-pointer"
                />
                <span className="w-12 text-right font-bold text-[#17251F]">
                  {ratings[dim.key as keyof FeedbackRating]} / 5
                </span>
              </div>
            ))}
          </div>

          {/* Qualitative Inputs */}
          <div>
            <label className="block font-semibold text-[#17251F] mb-1">
              Key Strengths (What does this colleague do exceptionally well?)
            </label>
            <textarea
              rows={2}
              required
              value={strengths}
              onChange={(e) => setStrengths(e.target.value)}
              className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs focus:ring-1 focus:ring-[#17251F]"
            />
          </div>

          <div>
            <label className="block font-semibold text-[#17251F] mb-1">
              Areas for Improvement (Where can they grow in the upcoming cycle?)
            </label>
            <textarea
              rows={2}
              required
              value={improvements}
              onChange={(e) => setImprovements(e.target.value)}
              className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs focus:ring-1 focus:ring-[#17251F]"
            />
          </div>

          <div>
            <label className="block font-semibold text-[#17251F] mb-1">
              Additional Observations (Optional)
            </label>
            <input
              type="text"
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="Any specific project context or feedback..."
              className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs focus:ring-1 focus:ring-[#17251F]"
            />
          </div>

          <div className="pt-3 border-t border-[#E6E8E1] flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setIsSubmitModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isSubmitting}
              rightIcon={<Send className="w-3.5 h-3.5" />}
            >
              {isSubmitting ? 'Submitting...' : 'Submit Review'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Request Feedback Modal */}
      <Modal
        isOpen={isRequestModalOpen}
        onClose={() => setIsRequestModalOpen(false)}
        title="Request Peer Feedback"
        description="Ask a colleague to provide structured 360° feedback on an employee."
        maxWidth="md"
      >
        <form onSubmit={handleCreateRequest} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-[#17251F] mb-1">
              Employee Being Evaluated
            </label>
            <select
              value={reqTargetEmpId}
              onChange={(e) => setReqTargetEmpId(e.target.value)}
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
            <label className="block font-semibold text-[#17251F] mb-1">
              Reviewer (Colleague to Provide Feedback)
            </label>
            <select
              value={reqReviewerEmpId}
              onChange={(e) => setReqReviewerEmpId(e.target.value)}
              className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs focus:ring-1 focus:ring-[#17251F]"
            >
              {employees.map((e) => (
                <option key={e.id} value={e.id} disabled={e.id === reqTargetEmpId}>
                  {e.name} ({e.jobTitle}) {e.id === reqTargetEmpId ? '(Cannot review self)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-[#17251F] mb-1">
              Expected Relationship Perspective
            </label>
            <select
              value={reqRelationship}
              onChange={(e) => setReqRelationship(e.target.value as any)}
              className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs focus:ring-1 focus:ring-[#17251F]"
            >
              <option value="Peer">Peer / Squad Colleague</option>
              <option value="Direct Report">Direct Report</option>
              <option value="Manager">Manager / Lead</option>
              <option value="Cross-Functional">Cross-Functional Partner</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-[#17251F] mb-1">
              Due Date
            </label>
            <input
              type="date"
              required
              value={reqDueDate}
              onChange={(e) => setReqDueDate(e.target.value)}
              className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs focus:ring-1 focus:ring-[#17251F]"
            />
          </div>

          <div>
            <label className="block font-semibold text-[#17251F] mb-1">
              Message / Specific Focus (Optional)
            </label>
            <textarea
              rows={2}
              value={reqMessage}
              onChange={(e) => setReqMessage(e.target.value)}
              placeholder="e.g. Please provide input on Q3 cross-squad architecture handoff..."
              className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs focus:ring-1 focus:ring-[#17251F]"
            />
          </div>

          <div className="pt-3 border-t border-[#E6E8E1] flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setIsRequestModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isRequesting || reqTargetEmpId === reqReviewerEmpId}
              rightIcon={<Send className="w-3.5 h-3.5" />}
            >
              {isRequesting ? 'Sending...' : 'Send Request'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
