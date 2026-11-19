'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useStore } from '@/lib/storage/use-store';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ProgressBar } from '@/components/ui/progress-bar';
import {
  Users,
  CalendarDays,
  FileCheck2,
  Clock,
  MessageSquareQuote,
  Sparkles,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Building,
  Target,
  ChevronRight,
  Lock,
  ExternalLink,
  Award,
  RefreshCw
} from 'lucide-react';

export default function DashboardPage() {
  const {
    employees,
    reviewCycles,
    performanceReviews,
    feedback,
    departments,
    auditLogs,
    activeRole,
    authUser,
    getDashboardMetrics,
    dbConnected
  } = useStore();

  const [backendData, setBackendData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function fetchMetrics() {
      setIsLoading(true);
      const data = await getDashboardMetrics();
      if (isMounted && data) {
        setBackendData(data);
      }
      if (isMounted) setIsLoading(false);
    }
    fetchMetrics();
    return () => {
      isMounted = false;
    };
  }, [getDashboardMetrics, activeRole]);

  const activeCycle = backendData?.summary?.activeCycle ||
    backendData?.activeCycle ||
    reviewCycles.find(c => c.status === 'Active') ||
    reviewCycles[0];

  // =========================================================================
  // ROLE 1: HR ADMINISTRATOR DASHBOARD VIEW
  // =========================================================================
  if (activeRole === 'hr_admin') {
    const totalEmployees = backendData?.summary?.totalEmployees ?? employees.length;
    const completedReviews = backendData?.summary?.completedReviews ?? performanceReviews.filter(
      r => r.status === 'Approved' || r.status === 'Released'
    ).length;
    const pendingReviews = backendData?.summary?.pendingReviews ?? performanceReviews.filter(
      r => r.status === 'Pending Approval' || r.status === 'Draft'
    ).length;
    const feedbackParticipationRate = backendData?.summary?.feedbackParticipationRate ?? 92;
    const completionPercentage = backendData?.summary?.completionPercentage ?? Math.round((completedReviews / Math.max(1, totalEmployees)) * 100);

    const draftCount = backendData?.statusBreakdown?.draft ?? performanceReviews.filter(r => r.status === 'Draft').length;
    const pendingApprovalCount = backendData?.statusBreakdown?.pendingApproval ?? performanceReviews.filter(r => r.status === 'Pending Approval').length;
    const approvedCount = backendData?.statusBreakdown?.approved ?? performanceReviews.filter(r => r.status === 'Approved').length;
    const releasedCount = backendData?.statusBreakdown?.released ?? performanceReviews.filter(r => r.status === 'Released').length;

    const actionQueue = backendData?.pendingApprovalsQueue || performanceReviews.filter(r => r.status === 'Pending Approval');
    const attentionEmployees = backendData?.attentionEmployees || employees.filter(
      e => e.reviewStatus === 'Not Started' || e.reviewStatus === 'In Progress'
    ).slice(0, 4);

    const departmentStats = backendData?.departmentStats || departments.map(d => ({
      id: d.id,
      name: d.name,
      headName: d.headName,
      employeeCount: d.employeeCount,
      completionRate: 78,
      averageOkrCompletion: d.averageOkrCompletion
    }));

    return (
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Header Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#E6E8E1]">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-[#17251F]">
                Executive Talent Intelligence
              </h1>
              <Badge variant="forest">Organization Overview</Badge>
              {dbConnected && <Badge variant="lime" dot>MongoDB Live</Badge>}
            </div>
            <p className="text-xs text-[#747D75] mt-1">
              Active Cycle: <span className="font-semibold text-[#17251F]">{activeCycle?.title}</span> • Period: {activeCycle?.period}
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <Link href="/ai-review-studio">
              <Button
                variant="accent"
                size="sm"
                leftIcon={<Sparkles className="w-3.5 h-3.5 text-[#17251F]" />}
              >
                Open AI Review Studio
              </Button>
            </Link>
            <Link href="/approvals">
              <Button variant="secondary" size="sm">
                Publishing Queue ({actionQueue.length})
              </Button>
            </Link>
          </div>
        </div>

        {/* Metric Cards Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard
            title="Total Employees"
            value={totalEmployees}
            subtitle={`Across ${departmentStats.length} departments`}
            icon={<Users className="w-4 h-4 text-[#17251F]" />}
          />
          <StatCard
            title="Active Review Cycle"
            value={activeCycle ? activeCycle.period : 'None'}
            subtitle={`${activeCycle?.eligibleEmployeesCount || totalEmployees} participants`}
            badgeLabel={activeCycle?.status || 'Active'}
            icon={<CalendarDays className="w-4 h-4 text-[#5876D8]" />}
          />
          <StatCard
            title="Reviews Completed"
            value={completedReviews}
            change={`${completionPercentage}% calibrated`}
            isPositive={true}
            subtitle={`${completionPercentage}% organization completion`}
            icon={<FileCheck2 className="w-4 h-4 text-[#2C5E1A]" />}
          />
          <StatCard
            title="Reviews In Queue"
            value={pendingReviews}
            subtitle={`${pendingApprovalCount} awaiting sign-off`}
            icon={<Clock className="w-4 h-4 text-[#D97706]" />}
          />
          <StatCard
            title="360° Participation"
            value={`${feedbackParticipationRate}%`}
            change="Multi-rater inputs"
            isPositive={true}
            subtitle="Verified feedback rate"
            icon={<MessageSquareQuote className="w-4 h-4 text-[#5876D8]" />}
          />
        </div>

        {/* Main Grid: Progress & Department Overview */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 space-y-6">
            {/* Review Completion Progress Card */}
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Review Cycle Completion & Calibration</CardTitle>
                  <CardDescription>
                    Tracking synthesis and sign-off progression for {activeCycle?.title}
                  </CardDescription>
                </div>
                <Badge variant="lime" dot>On Schedule</Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between text-xs font-semibold text-[#17251F]">
                  <span>Overall Organization Progress</span>
                  <span className="text-sm font-bold text-[#17251F]">{completionPercentage}%</span>
                </div>
                <ProgressBar value={completionPercentage} size="lg" colorScheme="forest" />

                <div className="grid grid-cols-4 gap-2 pt-2 text-center">
                  <div className="p-2.5 bg-[#FAFBF8] border border-[#E6E8E1] rounded-xl">
                    <span className="text-[10px] text-[#747D75] uppercase font-bold">Drafts</span>
                    <div className="text-lg font-bold text-[#17251F] mt-0.5">{draftCount}</div>
                  </div>
                  <div className="p-2.5 bg-[#FEF6E7] border border-[#FBDCA8] rounded-xl">
                    <span className="text-[10px] text-[#92540D] uppercase font-bold">Pending Signoff</span>
                    <div className="text-lg font-bold text-[#92540D] mt-0.5">{pendingApprovalCount}</div>
                  </div>
                  <div className="p-2.5 bg-[#EEF9D1] border border-[#D6EFA0] rounded-xl">
                    <span className="text-[10px] text-[#2C5E1A] uppercase font-bold">Approved</span>
                    <div className="text-lg font-bold text-[#2C5E1A] mt-0.5">{approvedCount}</div>
                  </div>
                  <div className="p-2.5 bg-[#EEF2FC] border border-[#D3DDF6] rounded-xl">
                    <span className="text-[10px] text-[#344E9E] uppercase font-bold">Released</span>
                    <div className="text-lg font-bold text-[#344E9E] mt-0.5">{releasedCount}</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Department Breakdown */}
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Department-Wise Performance & OKR Calibration</CardTitle>
                  <CardDescription>
                    Live completion and goal achievement across organizational units
                  </CardDescription>
                </div>
                <Link href="/departments" className="text-xs text-[#5876D8] hover:underline font-medium">
                  View all departments
                </Link>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {departmentStats.map((dept: any) => (
                    <div
                      key={dept.id}
                      className="p-3.5 rounded-xl border border-[#E6E8E1] bg-[#FAFBF8] hover:bg-[#FFFFFF] transition-all space-y-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <Building className="w-4 h-4 text-[#747D75]" />
                          <div>
                            <span className="text-xs font-bold text-[#17251F]">{dept.name}</span>
                            <span className="text-[11px] text-[#747D75] ml-2">Lead: {dept.headName}</span>
                          </div>
                        </div>
                        <span className="text-xs font-semibold text-[#17251F]">{dept.employeeCount} Members</span>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-xs">
                        <div>
                          <div className="flex justify-between text-[11px] text-[#747D75] mb-1">
                            <span>Average OKR Progress</span>
                            <span className="font-semibold text-[#17251F]">{dept.averageOkrCompletion}%</span>
                          </div>
                          <ProgressBar value={dept.averageOkrCompletion} size="sm" colorScheme="lime" />
                        </div>
                        <div>
                          <div className="flex justify-between text-[11px] text-[#747D75] mb-1">
                            <span>Review Progress</span>
                            <span className="font-semibold text-[#17251F]">{dept.completionRate}%</span>
                          </div>
                          <ProgressBar value={dept.completionRate} size="sm" colorScheme="forest" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Action Queue */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CardTitle>HR Release & Approval Queue</CardTitle>
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[#FEF6E7] text-[#92540D]">
                    {actionQueue.length} Pending
                  </span>
                </div>
                <Link href="/approvals" className="text-xs text-[#5876D8] hover:underline font-medium">
                  Open Approvals
                </Link>
              </CardHeader>
              <CardContent>
                {actionQueue.length > 0 ? (
                  <div className="divide-y divide-[#E6E8E1]">
                    {actionQueue.map((review: any) => (
                      <div key={review.id} className="py-3 flex items-center justify-between gap-4 first:pt-0 last:pb-0">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-[#17251F] text-[#FFFFFF] flex items-center justify-center font-bold text-xs">
                            {review.employeeName?.charAt(0) || 'R'}
                          </div>
                          <div>
                            <div className="text-xs font-bold text-[#17251F]">{review.employeeName}</div>
                            <div className="text-[11px] text-[#747D75]">
                              {review.jobTitle || 'Team Member'} • Review ID: {review.id}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="amber" dot>{review.status}</Badge>
                          <Link href={`/reviews/${review.id}`}>
                            <Button size="sm" variant="secondary">Inspect</Button>
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-6 text-center text-xs text-[#747D75]">
                    No reviews currently pending approval in this queue.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Deadlines, Attention, Audit */}
          <div className="lg:col-span-4 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Cycle Deadlines</CardTitle>
                <Badge variant="outline">Q4 Schedule</Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="p-3 bg-[#FAFBF8] border border-[#E6E8E1] rounded-xl flex items-start gap-3">
                  <Clock className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-bold text-[#17251F]">Peer Feedback Window Closes</div>
                    <div className="text-[11px] text-[#747D75] mt-0.5">November 20, 2026</div>
                  </div>
                </div>
                <div className="p-3 bg-[#FAFBF8] border border-[#E6E8E1] rounded-xl flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 text-[#5876D8] shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-bold text-[#17251F]">Manager Review Sign-Off Deadline</div>
                    <div className="text-[11px] text-[#747D75] mt-0.5">November 25, 2026</div>
                  </div>
                </div>
                <div className="p-3 bg-[#FAFBF8] border border-[#E6E8E1] rounded-xl flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 text-[#2C5E1A] shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-bold text-[#17251F]">Final HR Release Gate</div>
                    <div className="text-[11px] text-[#747D75] mt-0.5">November 30, 2026</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Attention Required</CardTitle>
                <span className="text-xs text-[#747D75]">{attentionEmployees.length} members</span>
              </CardHeader>
              <CardContent className="space-y-3">
                {attentionEmployees.map((emp: any) => (
                  <div key={emp.id} className="p-2.5 rounded-lg border border-[#E6E8E1] bg-[#FAFBF8] flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-[#17251F] text-white flex items-center justify-center text-[10px] font-semibold">
                        {emp.name[0]}
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-[#17251F]">{emp.name}</div>
                        <div className="text-[10px] text-[#747D75]">{emp.jobTitle}</div>
                      </div>
                    </div>
                    <Badge variant={emp.reviewStatus === 'Not Started' ? 'rose' : 'amber'}>
                      {emp.reviewStatus}
                    </Badge>
                  </div>
                ))}
              </CardContent>
              <CardFooter>
                <Link href="/employees" className="w-full flex items-center justify-between text-xs text-[#5876D8] hover:underline font-medium">
                  <span>View employee directory</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </CardFooter>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // ROLE 2: MANAGER DASHBOARD VIEW
  // =========================================================================
  if (activeRole === 'manager') {
    const teamTotal = backendData?.teamSummary?.totalReports ?? 4;
    const teamCompleted = backendData?.teamSummary?.completedReviews ?? 1;
    const teamPending = backendData?.teamSummary?.pendingReviews ?? 3;
    const teamCompletionRate = backendData?.teamSummary?.teamCompletionRate ?? 25;
    const teamAvgOkr = backendData?.teamSummary?.teamAvgOkr ?? 88;
    const teamFeedbackRate = backendData?.teamSummary?.teamFeedbackRate ?? 90;
    const directReports = backendData?.directReports || employees.filter(e => e.managerId === authUser?.employeeId || true).slice(0, 5);
    const actionQueue = backendData?.actionQueue || performanceReviews.filter(r => r.status === 'Draft' || r.status === 'Pending Approval');

    return (
      <div className="space-y-6 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#E6E8E1]">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-[#17251F]">
                Team Performance & Review Hub
              </h1>
              <Badge variant="blue">Manager Scoped</Badge>
              {dbConnected && <Badge variant="lime" dot>MongoDB Live</Badge>}
            </div>
            <p className="text-xs text-[#747D75] mt-1">
              Active Cycle: <span className="font-semibold text-[#17251F]">{activeCycle?.title}</span> • Direct Reports: {teamTotal}
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <Link href="/ai-review-studio">
              <Button variant="accent" size="sm" leftIcon={<Sparkles className="w-3.5 h-3.5 text-[#17251F]" />}>
                Synthesize Team Reviews
              </Button>
            </Link>
            <Link href="/manager-notes">
              <Button variant="secondary" size="sm">
                Add Observation
              </Button>
            </Link>
          </div>
        </div>

        {/* Manager Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Direct Reports"
            value={teamTotal}
            subtitle="Under your management"
            icon={<Users className="w-4 h-4 text-[#17251F]" />}
          />
          <StatCard
            title="Team Review Completion"
            value={`${teamCompletionRate}%`}
            subtitle={`${teamCompleted} of ${teamTotal} finalized`}
            change={`${teamPending} pending`}
            isPositive={teamCompletionRate >= 50}
            icon={<FileCheck2 className="w-4 h-4 text-[#2C5E1A]" />}
          />
          <StatCard
            title="Team OKR Velocity"
            value={`${teamAvgOkr}%`}
            subtitle="Across quarterly milestones"
            icon={<Target className="w-4 h-4 text-[#D97706]" />}
          />
          <StatCard
            title="Feedback Received"
            value={`${teamFeedbackRate}%`}
            subtitle="360° responses collected"
            icon={<MessageSquareQuote className="w-4 h-4 text-[#5876D8]" />}
          />
        </div>

        {/* Team Progress & Reports */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 space-y-6">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Direct Reports Review Funnel</CardTitle>
                  <CardDescription>
                    Status progression for team members awaiting evaluation and sign-off
                  </CardDescription>
                </div>
                <Badge variant="forest">Team Scoped</Badge>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {directReports.map((report: any) => (
                    <div
                      key={report.id}
                      className="p-3.5 rounded-xl border border-[#E6E8E1] bg-[#FAFBF8] flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-[#17251F] text-white flex items-center justify-center text-xs font-bold">
                          {report.name?.charAt(0) || 'E'}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-[#17251F]">{report.name}</div>
                          <div className="text-[11px] text-[#747D75]">
                            {report.jobTitle} • {report.employeeNumber || report.id}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <Badge variant={report.reviewStatus === 'Approved' || report.reviewStatus === 'Released' ? 'forest' : report.reviewStatus === 'Pending Approval' ? 'amber' : 'outline'}>
                          {report.reviewStatus}
                        </Badge>
                        <Link href="/ai-review-studio">
                          <Button size="sm" variant="secondary">Review</Button>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Manager Action Queue */}
            <Card>
              <CardHeader>
                <CardTitle>Manager Action Queue ({actionQueue.length})</CardTitle>
                <CardDescription>Reviews awaiting drafting, edits, or submission</CardDescription>
              </CardHeader>
              <CardContent>
                {actionQueue.length > 0 ? (
                  <div className="divide-y divide-[#E6E8E1]">
                    {actionQueue.map((rev: any) => (
                      <div key={rev.id} className="py-3 flex items-center justify-between first:pt-0 last:pb-0">
                        <div>
                          <div className="text-xs font-bold text-[#17251F]">{rev.employeeName}</div>
                          <div className="text-[11px] text-[#747D75]">Status: {rev.status}</div>
                        </div>
                        <Link href={`/reviews/${rev.id}`}>
                          <Button size="sm" variant="accent">Sign Off / Edit</Button>
                        </Link>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-6 text-center text-xs text-[#747D75]">All team reviews are on schedule!</div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-4 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Manager Tools</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Link href="/manager-notes" className="block">
                  <div className="p-3 bg-[#FAFBF8] border border-[#E6E8E1] rounded-xl hover:bg-white transition-all">
                    <div className="text-xs font-bold text-[#17251F]">Private Manager Notes</div>
                    <div className="text-[11px] text-[#747D75]">Log confidential observations</div>
                  </div>
                </Link>
                <Link href="/ai-review-studio" className="block">
                  <div className="p-3 bg-[#FAFBF8] border border-[#E6E8E1] rounded-xl hover:bg-white transition-all">
                    <div className="text-xs font-bold text-[#17251F]">AI Review Synthesizer</div>
                    <div className="text-[11px] text-[#747D75]">Generate evidence-based drafts</div>
                  </div>
                </Link>
                <Link href="/okrs" className="block">
                  <div className="p-3 bg-[#FAFBF8] border border-[#E6E8E1] rounded-xl hover:bg-white transition-all">
                    <div className="text-xs font-bold text-[#17251F]">Quarterly OKRs</div>
                    <div className="text-[11px] text-[#747D75]">Track team goal progress</div>
                  </div>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // ROLE 3: EMPLOYEE DASHBOARD VIEW
  // =========================================================================
  if (activeRole === 'employee') {
    const empReview = backendData?.personalReview;
    const reviewStatus = backendData?.reviewStatus || 'In Progress';
    const isSelfReflectionSubmitted = backendData?.selfReflectionStatus?.isSubmitted ?? false;
    const okrList = backendData?.okrSummary?.okrs || [];
    const avgOkr = backendData?.okrSummary?.averageProgress ?? 85;
    const assignedRequests = backendData?.peerReviewAssignments?.pendingRequests || [];

    return (
      <div className="space-y-6 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#E6E8E1]">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-[#17251F]">
                My Performance & Growth Workspace
              </h1>
              <Badge variant="forest">Personal</Badge>
              {dbConnected && <Badge variant="lime" dot>MongoDB Live</Badge>}
            </div>
            <p className="text-xs text-[#747D75] mt-1">
              Active Cycle: <span className="font-semibold text-[#17251F]">{activeCycle?.title}</span> • Period: {activeCycle?.period}
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <Link href="/self-reflections">
              <Button variant="accent" size="sm" leftIcon={<Sparkles className="w-3.5 h-3.5 text-[#17251F]" />}>
                {isSelfReflectionSubmitted ? 'View Self Reflection' : 'Complete Self Reflection'}
              </Button>
            </Link>
          </div>
        </div>

        {/* Top Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            title="My Review Status"
            value={reviewStatus}
            subtitle={empReview?.isReleased !== false ? 'Review finalized and released' : 'Review currently in manager calibration'}
            badgeLabel={reviewStatus}
            icon={<FileCheck2 className="w-4 h-4 text-[#2C5E1A]" />}
          />
          <StatCard
            title="Quarterly OKRs Progress"
            value={`${avgOkr}%`}
            subtitle={`${okrList.length} active objectives`}
            icon={<Target className="w-4 h-4 text-[#D97706]" />}
          />
          <StatCard
            title="Assigned Peer Reviews"
            value={assignedRequests.length}
            subtitle={`${assignedRequests.length} peer evaluations pending`}
            icon={<MessageSquareQuote className="w-4 h-4 text-[#5876D8]" />}
          />
        </div>

        {/* Employee Review Stage Card */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 space-y-6">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Annual Performance Review</CardTitle>
                  <CardDescription>
                    {activeCycle?.title} — Review Stage & Deliverables
                  </CardDescription>
                </div>
                <Badge variant={empReview?.status === 'Released' ? 'forest' : 'outline'}>
                  {empReview?.status || reviewStatus}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                {empReview?.status === 'Released' ? (
                  <div className="p-4 bg-[#EEF9D1] border border-[#D6EFA0] rounded-xl flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold text-[#2C5E1A]">Your Performance Review is Released!</div>
                      <div className="text-xs text-[#2C5E1A] mt-0.5">
                        Published by HR with full evidence grounding, manager recommendations, and competency ratings.
                      </div>
                    </div>
                    <Link href={`/reviews/${empReview.id}`}>
                      <Button variant="accent" size="sm">Inspect Review</Button>
                    </Link>
                  </div>
                ) : (
                  <div className="p-4 bg-[#FAFBF8] border border-[#E6E8E1] rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Lock className="w-5 h-5 text-[#747D75]" />
                      <div>
                        <div className="text-xs font-bold text-[#17251F]">Review In Calibration ({reviewStatus})</div>
                        <div className="text-[11px] text-[#747D75]">
                          Your manager is finalizing the empirical synthesis. It will be released after HR sign-off.
                        </div>
                      </div>
                    </div>
                    <Badge variant="amber">Confidential Draft</Badge>
                  </div>
                )}

                {/* Self Reflection Status */}
                <div className="p-3.5 bg-[#FAFBF8] border border-[#E6E8E1] rounded-xl flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-[#17251F]">Self-Reflection Input</div>
                    <div className="text-[11px] text-[#747D75]">
                      {isSelfReflectionSubmitted ? 'Submitted and incorporated into synthesis' : 'Pending submission — due soon'}
                    </div>
                  </div>
                  <Link href="/self-reflections">
                    <Button variant="secondary" size="sm">
                      {isSelfReflectionSubmitted ? 'Edit Reflection' : 'Submit Now'}
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>

            {/* OKR Summary Card */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>My Quarterly OKRs</CardTitle>
                  <Link href="/okrs" className="text-xs text-[#5876D8] hover:underline font-medium">
                    View OKR Board
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {okrList.length > 0 ? (
                  okrList.map((okr: any) => (
                    <div key={okr.id} className="p-3 bg-[#FAFBF8] border border-[#E6E8E1] rounded-xl space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-[#17251F]">{okr.objective}</span>
                        <span className="font-mono font-bold text-[#17251F]">{okr.overallProgress || okr.progress}%</span>
                      </div>
                      <ProgressBar value={okr.overallProgress || okr.progress} size="sm" colorScheme="forest" />
                    </div>
                  ))
                ) : (
                  <div className="py-4 text-center text-xs text-[#747D75]">No OKRs assigned for this quarter.</div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Peer Reviews Assigned to Me */}
          <div className="lg:col-span-4 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Peer Reviews For You</CardTitle>
                <Badge variant="blue">{assignedRequests.length} Tasks</Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                {assignedRequests.length > 0 ? (
                  assignedRequests.map((req: any) => (
                    <div key={req.id} className="p-3 bg-[#FAFBF8] border border-[#E6E8E1] rounded-xl space-y-2">
                      <div className="text-xs font-bold text-[#17251F]">{req.targetEmployeeName}</div>
                      <div className="text-[11px] text-[#747D75]">Role: {req.relationship} • Due: {req.dueDate}</div>
                      <Link href="/feedback">
                        <Button size="sm" variant="secondary" className="w-full">
                          Provide Feedback
                        </Button>
                      </Link>
                    </div>
                  ))
                ) : (
                  <div className="py-6 text-center text-xs text-[#747D75]">
                    You have completed all assigned peer reviews!
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // ROLE 4: PEER REVIEWER DASHBOARD VIEW
  // =========================================================================
  const peerAssigned = backendData?.summary?.totalAssigned ?? 2;
  const peerCompleted = backendData?.summary?.completedCount ?? 1;
  const peerPending = backendData?.summary?.pendingCount ?? 1;
  const peerRate = backendData?.summary?.completionRate ?? 50;
  const pendingAssignments = backendData?.pendingAssignments || [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#E6E8E1]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-[#17251F]">
              Peer Review Workbench
            </h1>
            <Badge variant="blue">Peer Reviewer</Badge>
            {dbConnected && <Badge variant="lime" dot>MongoDB Live</Badge>}
          </div>
          <p className="text-xs text-[#747D75] mt-1">
            Active Cycle: <span className="font-semibold text-[#17251F]">{activeCycle?.title}</span> • Assigned Reviews: {peerAssigned}
          </p>
        </div>

        <Link href="/feedback">
          <Button variant="accent" size="sm" leftIcon={<MessageSquareQuote className="w-3.5 h-3.5 text-[#17251F]" />}>
            Open Feedback Hub
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Assigned Reviews"
          value={peerAssigned}
          subtitle="Multi-rater 360 evaluations"
          icon={<Users className="w-4 h-4 text-[#17251F]" />}
        />
        <StatCard
          title="Completed Evaluations"
          value={peerCompleted}
          subtitle={`${peerRate}% completion rate`}
          change={`${peerPending} remaining`}
          isPositive={peerCompleted > 0}
          icon={<FileCheck2 className="w-4 h-4 text-[#2C5E1A]" />}
        />
        <StatCard
          title="Pending Evaluations"
          value={peerPending}
          subtitle="Due before calibration window closes"
          icon={<Clock className="w-4 h-4 text-[#D97706]" />}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pending Peer Review Assignments ({peerPending})</CardTitle>
          <CardDescription>Confidential multi-rater evaluations requested for your colleagues</CardDescription>
        </CardHeader>
        <CardContent>
          {pendingAssignments.length > 0 ? (
            <div className="divide-y divide-[#E6E8E1]">
              {pendingAssignments.map((req: any) => (
                <div key={req.id} className="py-3.5 flex items-center justify-between first:pt-0 last:pb-0">
                  <div>
                    <div className="text-xs font-bold text-[#17251F]">{req.targetEmployeeName}</div>
                    <div className="text-[11px] text-[#747D75]">
                      Relationship: {req.relationship} • Due: {req.dueDate}
                    </div>
                  </div>
                  <Link href="/feedback">
                    <Button size="sm" variant="accent">Complete Review</Button>
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-[#747D75]">
              All assigned 360 feedback reviews completed. Thank you for contributing to team calibration!
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
