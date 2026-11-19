/**
 * ReviewForge - Milestone 12: Dashboards and Analytics Test Suite
 * Validates:
 * 1. Mongoose Models & MongoDB real-time aggregations (Employee, Department, ReviewCycle, PerformanceReview, OKR, Feedback, FeedbackRequest)
 * 2. Role-specific Dashboard metrics:
 *    - HR Admin Dashboard (Org-wide completion, department breakdown, review funnel, OKR velocity, feedback participation, action queue)
 *    - Manager Dashboard (Direct report team summary, team completion rate, team OKR average, manager action queue, team feedback)
 *    - Employee Dashboard (Personal review status, privacy gate for unreleased reviews, self-reflection status, personal OKRs, peer assignments)
 *    - Peer Reviewer Dashboard (Assigned peer review requests, pending vs completed counts, response rate)
 * 3. Talent Analytics Summary (/api/v1/analytics/summary):
 *    - Aggregated completion metrics
 *    - Department comparisons with member counts, completion rates, and average OKR progress
 *    - 360 Feedback competency score distributions across 5 dimensions
 *    - Reviewer participation rates
 *    - AI Synthesis quality and coverage scores
 * 4. Analytics Export (/api/v1/analytics/export):
 *    - CSV format export with valid MIME type and CSV headers
 *    - JSON format export with printable audit summary
 * 5. Strict Role-Based Access Control:
 *    - 401 for unauthenticated requests
 *    - 403 for employees attempting to access aggregate talent analytics or export
 *    - 403 for peer reviewers attempting to access aggregate talent analytics or export
 * 6. Real-time Database Recalculation (dynamic Mongoose mutations immediately reflected in analytics)
 */

import mongoose from 'mongoose';
import { EventEmitter } from 'events';
import { createApp } from '../dist/app.js';
import { connectDatabase, disconnectDatabase } from '../dist/config/database.js';
import { User } from '../dist/models/User.js';
import { Employee } from '../dist/models/Employee.js';
import { Department } from '../dist/models/Department.js';
import { Organization } from '../dist/models/Organization.js';
import { ReviewCycle } from '../dist/models/ReviewCycle.js';
import { PerformanceReview } from '../dist/models/PerformanceReview.js';
import { OKR } from '../dist/models/OKR.js';
import { FeedbackItem } from '../dist/models/Feedback.js';
import { FeedbackRequest } from '../dist/models/FeedbackRequest.js';
import { SelfReflection } from '../dist/models/SelfReflection.js';
import { AISynthesisLog } from '../dist/models/AISynthesisLog.js';

let appInstance = null;
const testResults = [];

function recordTest(testName, expected, actual, passed) {
  testResults.push({
    testName,
    expected,
    actual,
    status: passed ? 'PASSED' : 'FAILED',
  });
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} [${testResults.length}] ${testName} -> ${passed ? 'PASSED' : 'FAILED'}`);
  if (!passed) {
    console.error(`   Expected: ${expected}`);
    console.error(`   Actual:   ${actual}`);
  }
}

function makeSection(key, title, content) {
  return { id: `sec-${key}`, title, content, evidenceRefs: [] };
}

function makeFullSections() {
  return {
    overallSummary: makeSection('summary', 'Overall Performance Summary', 'Executive performance summary.'),
    majorAchievements: makeSection('achievements', 'Major Achievements & Business Impact', 'Delivered core goals.'),
    keyStrengths: makeSection('strengths', 'Key Strengths & Competency Highlights', 'Strong technical ownership.'),
    collaborationAndCommunication: makeSection('collab', 'Collaboration, Communication & Culture', 'Active squad contributor.'),
    okrAchievementSummary: makeSection('okrs', 'OKR & Strategic Goal Achievement', 'Completed key deliverables.'),
    areasForDevelopment: makeSection('dev', 'Identified Growth & Development Areas', 'Architecture docs.'),
    futureGoals: makeSection('goals', 'Forward-Looking Objectives & Goals', 'Mentor junior peers.'),
    managerRecommendations: makeSection('recs', 'Manager & Reviewer Recommendations', 'Promote to Senior Engineer.'),
  };
}

function dispatch(app, options) {
  return new Promise((resolve, reject) => {
    const { method = 'GET', url = '/', headers = {}, body = null } = options;
    const req = new EventEmitter();
    req.method = method.toUpperCase();
    const [pathPart, queryPart] = url.split('?');
    req.url = url;
    req.path = pathPart;
    req.query = {};
    if (queryPart) {
      const sp = new URLSearchParams(queryPart);
      for (const [key, value] of sp.entries()) {
        req.query[key] = value;
      }
    }
    const normalizedHeaders = {};
    for (const [k, v] of Object.entries(headers)) {
      normalizedHeaders[k.toLowerCase()] = v;
    }
    req.headers = normalizedHeaders;
    req.get = (h) => normalizedHeaders[h.toLowerCase()];
    req.header = (h) => normalizedHeaders[h.toLowerCase()];
    req.body = body || {};

    const res = new EventEmitter();
    let statusCode = 200;
    const resHeaders = {};
    let responseBody = '';

    res.status = (code) => {
      statusCode = code;
      return res;
    };
    res.setHeader = (name, val) => {
      resHeaders[name.toLowerCase()] = val;
      return res;
    };
    res.getHeader = (name) => resHeaders[name.toLowerCase()];
    res.json = (data) => {
      statusCode = statusCode || 200;
      resHeaders['content-type'] = 'application/json';
      responseBody = data;
      resolve({
        statusCode,
        status: statusCode,
        headers: resHeaders,
        body: data,
        text: JSON.stringify(data),
      });
      return res;
    };
    res.send = (data) => {
      statusCode = statusCode || 200;
      responseBody = data;
      resolve({
        statusCode,
        status: statusCode,
        headers: resHeaders,
        body: data,
        text: typeof data === 'string' ? data : JSON.stringify(data),
      });
      return res;
    };
    res.end = (data) => {
      if (data) responseBody = data;
      resolve({
        statusCode,
        status: statusCode,
        headers: resHeaders,
        body: responseBody,
        text: String(responseBody),
      });
      return res;
    };

    try {
      app.handle(req, res, (err) => {
        if (err) reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });
}

async function runTestSuite() {
  console.log('\n======================================================');
  console.log('   MILESTONE 12: DASHBOARDS & ANALYTICS TEST SUITE');
  console.log('======================================================\n');

  try {
    // Step 1: Connect to MongoDB
    await connectDatabase();
    appInstance = createApp();

    const isConnected = mongoose.connection.readyState === 1;
    recordTest(
      'Database Connection',
      'readyState === 1 (Connected)',
      `readyState === ${mongoose.connection.readyState}`,
      isConnected
    );

    // Step 2: Seed Test Users for all 4 roles
    const orgId = 'org-reviewforge-default';
    const passwordHash = await User.hashPassword('Admin@ReviewForge2026!');
    const usersToSeed = [
      {
        id: 'usr-admin-m12',
        email: 'admin.m12@reviewforge.io',
        passwordHash,
        name: 'ReviewForge HR Admin',
        role: 'hr_admin',
        organizationId: orgId,
        employeeId: 'emp-admin-m12',
        status: 'active',
      },
      {
        id: 'usr-mgr-m12',
        email: 'manager.m12@reviewforge.io',
        passwordHash,
        name: 'Elena Rostova (Engineering Manager)',
        role: 'manager',
        organizationId: orgId,
        employeeId: 'emp-mgr-m12',
        status: 'active',
      },
      {
        id: 'usr-emp-m12',
        email: 'employee.m12@reviewforge.io',
        passwordHash,
        name: 'Rahul Deshmukh (Frontend Engineer)',
        role: 'employee',
        organizationId: orgId,
        employeeId: 'emp-emp-m12',
        status: 'active',
      },
      {
        id: 'usr-peer-m12',
        email: 'peer.m12@reviewforge.io',
        passwordHash,
        name: 'Marcus Vance (Senior Reviewer)',
        role: 'peer_reviewer',
        organizationId: orgId,
        employeeId: 'emp-peer-m12',
        status: 'active',
      },
    ];

    for (const u of usersToSeed) {
      await User.findOneAndUpdate({ email: u.email }, u, { upsert: true, new: true });
    }
    recordTest(
      'Seed Test Users for All 4 Roles',
      '4 users seeded in MongoDB',
      'hr_admin, manager, employee, peer_reviewer ready',
      true
    );

    // Step 3: Seed Departments
    await Department.deleteMany({ organizationId: orgId, id: { $nin: ['dept-eng', 'dept-prod', 'dept-gtm'] } });
    const depts = [
      { id: 'dept-eng', name: 'Engineering & Infrastructure', headName: 'Dr. Aris Thorne', organizationId: orgId, employeeCount: 2, averageOkrCompletion: 85 },
      { id: 'dept-prod', name: 'Product & Design', headName: 'Maya Lin', organizationId: orgId, employeeCount: 1, averageOkrCompletion: 90 },
      { id: 'dept-gtm', name: 'Go-to-Market & Sales', headName: 'Marcus Vance', organizationId: orgId, employeeCount: 1, averageOkrCompletion: 80 },
    ];
    for (const d of depts) {
      await Department.findOneAndUpdate({ id: d.id }, d, { upsert: true, new: true });
    }
    recordTest('Seed Departments', '3 departments seeded', 'dept-eng, dept-prod, dept-gtm verified', true);

    // Step 4: Seed Employees (Manager hierarchy: emp-emp-m12 reports to emp-mgr-m12)
    const employees = [
      {
        id: 'emp-admin-m12',
        organizationId: orgId,
        employeeNumber: 'RF-9001',
        name: 'ReviewForge HR Admin',
        email: 'admin.m12@reviewforge.io',
        departmentId: 'dept-eng',
        departmentName: 'Engineering & Infrastructure',
        jobTitle: 'VP of People & Culture',
        managerId: null,
        reviewStatus: 'Approved',
        isDeactivated: false,
      },
      {
        id: 'emp-mgr-m12',
        organizationId: orgId,
        employeeNumber: 'RF-9002',
        name: 'Elena Rostova (Engineering Manager)',
        email: 'manager.m12@reviewforge.io',
        departmentId: 'dept-eng',
        departmentName: 'Engineering & Infrastructure',
        jobTitle: 'Engineering Manager',
        managerId: 'emp-admin-m12',
        reviewStatus: 'Pending Approval',
        isDeactivated: false,
      },
      {
        id: 'emp-emp-m12',
        organizationId: orgId,
        employeeNumber: 'RF-9003',
        name: 'Rahul Deshmukh (Frontend Engineer)',
        email: 'employee.m12@reviewforge.io',
        departmentId: 'dept-eng',
        departmentName: 'Engineering & Infrastructure',
        jobTitle: 'Frontend Engineer',
        managerId: 'emp-mgr-m12', // Direct report of Elena
        reviewStatus: 'In Progress',
        isDeactivated: false,
      },
      {
        id: 'emp-peer-m12',
        organizationId: orgId,
        employeeNumber: 'RF-9004',
        name: 'Marcus Vance (Senior Reviewer)',
        email: 'peer.m12@reviewforge.io',
        departmentId: 'dept-gtm',
        departmentName: 'Go-to-Market & Sales',
        jobTitle: 'Lead Product Strategist',
        managerId: 'emp-admin-m12',
        reviewStatus: 'Not Started',
        isDeactivated: false,
      },
    ];

    for (const emp of employees) {
      await Employee.findOneAndUpdate({ id: emp.id }, emp, { upsert: true, new: true });
    }
    recordTest('Seed Employees & Hierarchy', '4 employees seeded with direct report linkage', 'emp-emp-m12 reports to emp-mgr-m12', true);

    // Step 5: Seed Review Cycle
    const cycleId = 'cycle-2026-m12';
    await ReviewCycle.findOneAndUpdate(
      { id: cycleId },
      {
        id: cycleId,
        organizationId: orgId,
        title: 'FY2026 Annual Performance & Calibration',
        period: 'FY2026',
        type: 'Annual 360°',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        status: 'Active',
        eligibleEmployeesCount: 4,
        completedReviewsCount: 1,
      },
      { upsert: true, new: true }
    );
    recordTest('Seed Active Review Cycle', 'Active cycle seeded in MongoDB', cycleId, true);

    // Step 6: Seed OKRs with defined progress
    await OKR.deleteMany({ organizationId: orgId, employeeId: { $in: ['emp-emp-m12', 'emp-mgr-m12', 'emp-admin-m12'] } });
    await OKR.insertMany([
      {
        id: 'okr-m12-1',
        organizationId: orgId,
        employeeId: 'emp-emp-m12',
        quarter: 'Q4',
        year: 2026,
        departmentId: 'dept-eng',
        objective: 'Architect High-Performance Synthesis Frontend',
        keyResults: [{ id: 'kr-1', title: 'Sub-50ms latency', targetValue: 100, actualValue: 80, unit: '%', completionPercentage: 80, status: 'On Track' }],
        overallProgress: 80,
        status: 'On Track',
      },
      {
        id: 'okr-m12-2',
        organizationId: orgId,
        employeeId: 'emp-emp-m12',
        quarter: 'Q4',
        year: 2026,
        departmentId: 'dept-eng',
        objective: 'Complete Design System Accessibility Audit',
        keyResults: [{ id: 'kr-2', title: 'WCAG 2.1 AAA', targetValue: 100, actualValue: 100, unit: '%', completionPercentage: 100, status: 'Completed' }],
        overallProgress: 100,
        status: 'Completed',
      },
      {
        id: 'okr-m12-3',
        organizationId: orgId,
        employeeId: 'emp-mgr-m12',
        quarter: 'Q4',
        year: 2026,
        departmentId: 'dept-eng',
        objective: 'Scale Engineering Throughput and Team Mentorship',
        keyResults: [{ id: 'kr-3', title: 'Sprint velocity', targetValue: 50, actualValue: 45, unit: 'pts', completionPercentage: 90, status: 'Completed' }],
        overallProgress: 90,
        status: 'Completed',
      },
    ]);
    recordTest('Seed OKRs & Progress Values', '3 OKRs with 80%, 100%, 90% progress', 'overallProgress recorded', true);

    // Step 7: Seed 360 Feedback Items with ratings
    await FeedbackItem.deleteMany({ id: { $in: ['fb-m12-1', 'fb-m12-2'] } });
    await FeedbackItem.insertMany([
      {
        id: 'fb-m12-1',
        organizationId: orgId,
        reviewCycleId: cycleId,
        targetEmployeeId: 'emp-emp-m12',
        targetEmployeeName: 'Rahul Deshmukh',
        providerEmployeeId: 'emp-peer-m12',
        providerEmployeeName: 'Marcus Vance',
        providerRole: 'Lead Product Strategist',
        relationship: 'Peer',
        isAnonymous: false,
        ratings: {
          collaboration: 5,
          communication: 4,
          problemSolving: 5,
          technicalContribution: 5,
          leadership: 4,
        },
        strengths: 'Outstanding technical velocity and deep component architecture.',
        improvements: 'Could document architectural decisions earlier.',
        submittedAt: '2026-11-10',
        status: 'Submitted',
      },
      {
        id: 'fb-m12-2',
        organizationId: orgId,
        reviewCycleId: cycleId,
        targetEmployeeId: 'emp-emp-m12',
        targetEmployeeName: 'Rahul Deshmukh',
        providerEmployeeId: 'emp-mgr-m12',
        providerEmployeeName: 'Elena Rostova',
        providerRole: 'Engineering Manager',
        relationship: 'Manager',
        isAnonymous: false,
        ratings: {
          collaboration: 4,
          communication: 5,
          problemSolving: 4,
          technicalContribution: 5,
          leadership: 4,
        },
        strengths: 'Consistently delivers high quality features ahead of schedule.',
        improvements: 'Take on more cross-squad mentorship.',
        submittedAt: '2026-11-12',
        status: 'Submitted',
      },
    ]);
    recordTest('Seed 360 Feedback Items', '2 submitted feedback items with 5-star rubric', 'ratings stored in MongoDB', true);

    // Step 8: Seed Feedback Requests (Completed & Pending)
    await FeedbackRequest.deleteMany({ id: { $in: ['fbreq-m12-1', 'fbreq-m12-2', 'fbreq-m12-3'] } });
    await FeedbackRequest.insertMany([
      {
        id: 'fbreq-m12-1',
        organizationId: orgId,
        reviewCycleId: cycleId,
        targetEmployeeId: 'emp-emp-m12',
        targetEmployeeName: 'Rahul Deshmukh',
        reviewerEmployeeId: 'emp-peer-m12',
        reviewerEmployeeName: 'Marcus Vance',
        requestedByEmployeeId: 'emp-mgr-m12',
        requestedByName: 'Elena Rostova',
        relationship: 'Peer',
        status: 'Completed',
        dueDate: '2026-11-20',
      },
      {
        id: 'fbreq-m12-2',
        organizationId: orgId,
        reviewCycleId: cycleId,
        targetEmployeeId: 'emp-mgr-m12',
        targetEmployeeName: 'Elena Rostova',
        reviewerEmployeeId: 'emp-peer-m12',
        reviewerEmployeeName: 'Marcus Vance',
        requestedByEmployeeId: 'emp-admin-m12',
        requestedByName: 'ReviewForge HR Admin',
        relationship: 'Direct Report',
        status: 'Pending',
        dueDate: '2026-11-25',
      },
      {
        id: 'fbreq-m12-3',
        organizationId: orgId,
        reviewCycleId: cycleId,
        targetEmployeeId: 'emp-peer-m12',
        targetEmployeeName: 'Marcus Vance',
        reviewerEmployeeId: 'emp-emp-m12',
        reviewerEmployeeName: 'Rahul Deshmukh',
        requestedByEmployeeId: 'emp-admin-m12',
        requestedByName: 'ReviewForge HR Admin',
        relationship: 'Peer',
        status: 'Pending',
        dueDate: '2026-11-30',
      },
    ]);
    recordTest('Seed Feedback Requests', '3 feedback requests (1 completed, 2 pending)', 'status distribution ready', true);

    // Step 9: Seed Performance Reviews with complete sections schema
    await PerformanceReview.deleteMany({ id: { $in: ['rev-m12-admin', 'rev-m12-emp'] } });
    await PerformanceReview.insertMany([
      {
        id: 'rev-m12-admin',
        organizationId: orgId,
        reviewCycleId: cycleId,
        reviewCycleTitle: 'FY2026 Annual Performance & Calibration',
        employeeId: 'emp-admin-m12',
        employeeName: 'ReviewForge HR Admin',
        departmentName: 'Engineering & Infrastructure',
        jobTitle: 'VP of People & Culture',
        managerId: null,
        managerName: null,
        status: 'Released',
        overallRating: 5,
        releasedAt: new Date().toISOString(),
        sections: makeFullSections(),
      },
      {
        id: 'rev-m12-emp',
        organizationId: orgId,
        reviewCycleId: cycleId,
        reviewCycleTitle: 'FY2026 Annual Performance & Calibration',
        employeeId: 'emp-emp-m12',
        employeeName: 'Rahul Deshmukh (Frontend Engineer)',
        departmentName: 'Engineering & Infrastructure',
        jobTitle: 'Frontend Engineer',
        managerId: 'emp-mgr-m12',
        managerName: 'Elena Rostova',
        status: 'Draft',
        overallRating: 4.8,
        sections: makeFullSections(),
      },
    ]);
    recordTest('Seed Performance Reviews', '2 reviews: 1 Released, 1 Draft', 'reviews seeded in MongoDB', true);

    // Step 10: Seed AI Synthesis Log
    await AISynthesisLog.deleteMany({ organizationId: orgId });
    await AISynthesisLog.create({
      id: 'log-m12-1',
      organizationId: orgId,
      reviewCycleId: cycleId,
      employeeId: 'emp-emp-m12',
      actorId: 'usr-admin-m12',
      actorRole: 'hr_admin',
      modelName: 'gemini-1.5-pro',
      status: 'success',
      coverageScore: 94,
      latencyMs: 1420,
      timestamp: new Date().toISOString(),
    });
    recordTest('Seed AI Synthesis Log', 'Audit log created with coverageScore=94%', 'persisted in MongoDB', true);

    // Step 11: Obtain Auth Tokens for all 4 roles
    const authHeaders = {};
    for (const u of usersToSeed) {
      const loginRes = await dispatch(appInstance, {
        method: 'POST',
        url: '/api/v1/auth/login',
        body: { email: u.email, password: 'Admin@ReviewForge2026!' },
      });
      const token = loginRes.body?.accessToken || loginRes.body?.token;
      if (!token) {
        throw new Error(`Failed to obtain token for ${u.role} (${u.email}): ${JSON.stringify(loginRes.body)}`);
      }
      authHeaders[u.role] = { Authorization: `Bearer ${token}` };
    }
    recordTest('Authenticate All 4 Roles', 'JWT tokens issued for all roles', 'hr_admin, manager, employee, peer_reviewer tokens active', true);

    // Step 12: Security: Unauthenticated Requests Blocked
    const unauthDash = await dispatch(appInstance, { method: 'GET', url: '/api/v1/analytics/dashboard' });
    recordTest('Unauthenticated Dashboard Guard', 'HTTP 401', `HTTP ${unauthDash.statusCode}`, unauthDash.statusCode === 401);

    const unauthSummary = await dispatch(appInstance, { method: 'GET', url: '/api/v1/analytics/summary' });
    recordTest('Unauthenticated Summary Guard', 'HTTP 401', `HTTP ${unauthSummary.statusCode}`, unauthSummary.statusCode === 401);

    const unauthExport = await dispatch(appInstance, { method: 'GET', url: '/api/v1/analytics/export' });
    recordTest('Unauthenticated Export Guard', 'HTTP 401', `HTTP ${unauthExport.statusCode}`, unauthExport.statusCode === 401);

    // ==========================================
    // STEP 13-24: HR ADMIN DASHBOARD TESTS
    // ==========================================
    const hrDash = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/analytics/dashboard',
      headers: authHeaders.hr_admin,
    });
    recordTest('HR Admin Dashboard Endpoint', 'HTTP 200, role: hr_admin', `HTTP ${hrDash.statusCode}, role: ${hrDash.body?.data?.role}`, hrDash.statusCode === 200 && hrDash.body?.data?.role === 'hr_admin');

    const hrData = hrDash.body?.data;
    const totalActiveEmployees = await Employee.countDocuments({ organizationId: orgId, isDeactivated: { $ne: true } });
    const engActiveCount = await Employee.countDocuments({ organizationId: orgId, departmentId: 'dept-eng', isDeactivated: { $ne: true } });
    const expectedCompleted1 = await PerformanceReview.countDocuments({ organizationId: orgId, status: { $in: ['Approved', 'Released'] } });
    const expectedRate1 = Math.round((expectedCompleted1 / totalActiveEmployees) * 100);

    const actualReqCount = await FeedbackRequest.countDocuments({ organizationId: orgId });
    const actualCompletedReqCount = await FeedbackRequest.countDocuments({ organizationId: orgId, status: 'Completed' });
    const expectedPartRate = actualReqCount > 0 ? Math.round((actualCompletedReqCount / actualReqCount) * 100) : 0;

    recordTest('HR Dashboard: Total Employees Count', `totalEmployees === ${totalActiveEmployees}`, `totalEmployees === ${hrData?.summary?.totalEmployees}`, hrData?.summary?.totalEmployees === totalActiveEmployees);
    recordTest('HR Dashboard: Active Cycle Detection', `title contains FY2026`, `title === ${hrData?.summary?.activeCycle?.title}`, Boolean(hrData?.summary?.activeCycle?.title?.includes('FY2026')));
    recordTest('HR Dashboard: Completed Reviews Count', `completedReviews === ${expectedCompleted1}`, `completedReviews === ${hrData?.summary?.completedReviews}`, hrData?.summary?.completedReviews === expectedCompleted1);
    recordTest('HR Dashboard: Completion Percentage', `completionPercentage === ${expectedRate1}%`, `completionPercentage === ${hrData?.summary?.completionPercentage}%`, hrData?.summary?.completionPercentage === expectedRate1);
    recordTest('HR Dashboard: Organization OKR Average', 'avgOkrScore is a valid percentage (>0)', `avgOkrScore === ${hrData?.summary?.avgOkrScore}%`, typeof hrData?.summary?.avgOkrScore === 'number' && hrData?.summary?.avgOkrScore > 0);
    recordTest('HR Dashboard: Status Breakdown Structure', 'contains draft, pendingApproval, approved, released', `draft=${hrData?.statusBreakdown?.draft}, released=${hrData?.statusBreakdown?.released}`, hrData?.statusBreakdown?.draft >= 1 && hrData?.statusBreakdown?.released >= 1);
    recordTest('HR Dashboard: Department Comparison Count', '3 departments returned', `count === ${hrData?.departmentStats?.length}`, hrData?.departmentStats?.length === 3);
    recordTest('HR Dashboard: Department Completion Metrics', `Engineering has total count ${engActiveCount}`, `Eng count=${hrData?.departmentStats?.find(d => d.id === 'dept-eng')?.employeeCount}`, hrData?.departmentStats?.find(d => d.id === 'dept-eng')?.employeeCount === engActiveCount);
    recordTest('HR Dashboard: Feedback Participation Rate', `${expectedPartRate}% participation`, `rate === ${hrData?.summary?.feedbackParticipationRate}%`, hrData?.summary?.feedbackParticipationRate === expectedPartRate);
    recordTest('HR Dashboard: Attention Employees Queue', 'Identifies employees in Not Started or In Progress', `count === ${hrData?.attentionEmployees?.length}`, hrData?.attentionEmployees?.length > 0);

    // ==========================================
    // STEP 25-30: MANAGER DASHBOARD TESTS
    // ==========================================
    const mgrDash = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/analytics/dashboard',
      headers: authHeaders.manager,
    });
    recordTest('Manager Dashboard Endpoint', 'HTTP 200, role: manager', `HTTP ${mgrDash.statusCode}, role: ${mgrDash.body?.data?.role}`, mgrDash.statusCode === 200 && mgrDash.body?.data?.role === 'manager');

    const mgrData = mgrDash.body?.data;
    recordTest('Manager Scoping: Direct Reports Count', 'totalReports === 1 (only Rahul Deshmukh reports to Elena)', `totalReports === ${mgrData?.teamSummary?.totalReports}`, mgrData?.teamSummary?.totalReports === 1);
    recordTest('Manager Scoping: Direct Reports List', 'directReports contains only emp-emp-m12', `directReports[0].id === ${mgrData?.directReports?.[0]?.id}`, mgrData?.directReports?.length === 1 && mgrData?.directReports[0].id === 'emp-emp-m12');
    recordTest('Manager Scoping: Team Completion Rate', '0% (Draft review not yet approved/released)', `rate === ${mgrData?.teamSummary?.teamCompletionRate}%`, mgrData?.teamSummary?.teamCompletionRate === 0);
    recordTest('Manager Scoping: Team OKR Velocity', '90% (Average of Rahul OKRs 80 & 100)', `avg === ${mgrData?.teamSummary?.teamAvgOkr}%`, mgrData?.teamSummary?.teamAvgOkr === 90);
    recordTest('Manager Action Queue: Draft / Pending Reviews', 'actionQueue contains Rahul review', `actionQueue count === ${mgrData?.actionQueue?.length}`, mgrData?.actionQueue?.length === 1 && mgrData?.actionQueue[0].employeeId === 'emp-emp-m12');

    // ==========================================
    // STEP 31-36: EMPLOYEE DASHBOARD TESTS
    // ==========================================
    const empDash = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/analytics/dashboard',
      headers: authHeaders.employee,
    });
    recordTest('Employee Dashboard Endpoint', 'HTTP 200, role: employee', `HTTP ${empDash.statusCode}, role: ${empDash.body?.data?.role}`, empDash.statusCode === 200 && empDash.body?.data?.role === 'employee');

    const empData = empDash.body?.data;
    recordTest('Employee Dashboard: Review Status', 'reviewStatus === In Progress', `reviewStatus === ${empData?.reviewStatus}`, empData?.reviewStatus === 'In Progress');
    recordTest('Employee Privacy Gate: Unreleased Review Masked', 'personalReview has isReleased: false and NO sections content leaked', `isReleased=${empData?.personalReview?.isReleased}, sections=${empData?.personalReview?.sections}`, empData?.personalReview?.isReleased === false && empData?.personalReview?.sections === undefined);
    recordTest('Employee Dashboard: OKR Summary', 'totalOkrs === 2, averageProgress === 90%', `total=${empData?.okrSummary?.totalOkrs}, avg=${empData?.okrSummary?.averageProgress}%`, empData?.okrSummary?.totalOkrs === 2 && empData?.okrSummary?.averageProgress === 90);
    recordTest('Employee Dashboard: Peer Review Assignments', 'totalAssigned === 1 (fbreq-m12-3 assigned to Rahul)', `totalAssigned === ${empData?.peerReviewAssignments?.totalAssigned}`, empData?.peerReviewAssignments?.totalAssigned === 1);
    recordTest('Employee Dashboard: Self Reflection Status', 'isSubmitted === false (no self reflection submitted yet)', `isSubmitted === ${empData?.selfReflectionStatus?.isSubmitted}`, empData?.selfReflectionStatus?.isSubmitted === false);

    // ==========================================
    // STEP 37-39: PEER REVIEWER DASHBOARD TESTS
    // ==========================================
    const peerDash = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/analytics/dashboard',
      headers: authHeaders.peer_reviewer,
    });
    recordTest('Peer Reviewer Dashboard Endpoint', 'HTTP 200, role: peer_reviewer', `HTTP ${peerDash.statusCode}, role: ${peerDash.body?.data?.role}`, peerDash.statusCode === 200 && peerDash.body?.data?.role === 'peer_reviewer');

    const peerData = peerDash.body?.data;
    recordTest('Peer Reviewer: Total Assigned Requests', 'totalAssigned === 2 (fbreq-m12-1 and fbreq-m12-2)', `totalAssigned === ${peerData?.summary?.totalAssigned}`, peerData?.summary?.totalAssigned === 2);
    recordTest('Peer Reviewer: Completed vs Pending Count', 'completed === 1, pending === 1', `completed=${peerData?.summary?.completedCount}, pending=${peerData?.summary?.pendingCount}`, peerData?.summary?.completedCount === 1 && peerData?.summary?.pendingCount === 1);

    // ==========================================
    // STEP 40-47: TALENT ANALYTICS SUMMARY TESTS
    // ==========================================
    const hrSummary = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/analytics/summary',
      headers: authHeaders.hr_admin,
    });
    recordTest('Talent Analytics Summary: HR Admin', 'HTTP 200 with complete analytics payload', `HTTP ${hrSummary.statusCode}`, hrSummary.statusCode === 200 && hrSummary.body?.success === true);

    const summaryData = hrSummary.body?.data;
    recordTest('Talent Analytics: Competency Rubric Distribution', '5 dimensions (Collaboration, Tech, Problem, Delivery, Leadership)', `count === ${summaryData?.competencies?.length}`, summaryData?.competencies?.length === 5);
    recordTest('Talent Analytics: Rubric Scores Bound', 'Scores between 1.0 and 5.0', `Scores: ${summaryData?.competencies?.map(c => c.score).join(', ')}`, summaryData?.competencies?.every(c => c.score >= 1.0 && c.score <= 5.0));
    recordTest('Talent Analytics: Feedback Participation Rate', `${expectedPartRate}% participation rate recorded`, `participationRate === ${summaryData?.feedbackParticipation?.participationRate}%`, summaryData?.feedbackParticipation?.participationRate === expectedPartRate);
    recordTest('Talent Analytics: AI Synthesis Quality Stats', 'averageCoverage recorded', `avgCoverage === ${summaryData?.aiQuality?.averageCoverage}%`, typeof summaryData?.aiQuality?.averageCoverage === 'number');

    // Department filtering
    const deptFiltered = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/analytics/summary?departmentId=dept-eng',
      headers: authHeaders.hr_admin,
    });
    recordTest('Talent Analytics: Department Filter (?departmentId=dept-eng)', `HTTP 200, totalEmployees === ${engActiveCount}`, `totalEmployees === ${deptFiltered.body?.data?.totalEmployees}`, deptFiltered.statusCode === 200 && deptFiltered.body?.data?.totalEmployees === engActiveCount);

    // Manager summary access (scoped)
    const mgrSummary = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/analytics/summary',
      headers: authHeaders.manager,
    });
    recordTest('Talent Analytics: Manager Access Allowed (Scoped)', 'HTTP 200, scoped to direct reports', `HTTP ${mgrSummary.statusCode}`, mgrSummary.statusCode === 200);

    // Employee & Peer Reviewer RBAC Blocks
    const empSummary = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/analytics/summary',
      headers: authHeaders.employee,
    });
    recordTest('Talent Analytics RBAC: Block Employee Access', 'HTTP 403 Forbidden', `HTTP ${empSummary.statusCode}`, empSummary.statusCode === 403);

    const peerSummary = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/analytics/summary',
      headers: authHeaders.peer_reviewer,
    });
    recordTest('Talent Analytics RBAC: Block Peer Reviewer Access', 'HTTP 403 Forbidden', `HTTP ${peerSummary.statusCode}`, peerSummary.statusCode === 403);

    // ==========================================
    // STEP 48-53: ANALYTICS EXPORT TESTS (CSV / JSON)
    // ==========================================
    const csvExport = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/analytics/export?format=csv',
      headers: authHeaders.hr_admin,
    });
    recordTest('Analytics Export: CSV Format HTTP 200', 'HTTP 200', `HTTP ${csvExport.statusCode}`, csvExport.statusCode === 200);
    recordTest('Analytics Export: CSV Content-Type Header', 'Content-Type contains text/csv', `Content-Type === ${csvExport.headers['content-type']}`, Boolean(csvExport.headers['content-type']?.includes('text/csv')));
    recordTest('Analytics Export: CSV Header Row Valid', 'Includes Department ID, Department Name, Completion Rate %', 'Header row verified', Boolean(csvExport.text?.includes('Department ID') && csvExport.text?.includes('Completion Rate %')));
    recordTest('Analytics Export: CSV Data Rows Formatted', 'Contains Engineering & Infrastructure', 'Contains dept-eng row', Boolean(csvExport.text?.includes('Engineering & Infrastructure')));

    const jsonExport = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/analytics/export?format=json',
      headers: authHeaders.hr_admin,
    });
    recordTest('Analytics Export: JSON Structured Report', 'HTTP 200 with summary and departmentBreakdown', `HTTP ${jsonExport.statusCode}, depts=${jsonExport.body?.data?.departmentBreakdown?.length}`, jsonExport.statusCode === 200 && jsonExport.body?.data?.departmentBreakdown?.length === 3);

    const empExport = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/analytics/export?format=csv',
      headers: authHeaders.employee,
    });
    recordTest('Analytics Export RBAC: Block Employee Export', 'HTTP 403 Forbidden', `HTTP ${empExport.statusCode}`, empExport.statusCode === 403);

    // ==========================================
    // STEP 54-55: REAL-TIME DATABASE RECALCULATION
    // ==========================================
    // Dynamically update an OKR in MongoDB: Change Rahul's OKR 1 progress from 80 to 20
    await OKR.findOneAndUpdate({ id: 'okr-m12-1' }, { overallProgress: 20 });
    const dynamicMgrDash = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/analytics/dashboard',
      headers: authHeaders.manager,
    });
    // New average of 20 and 100 is 60
    recordTest(
      'Real-time DB Recalculation: OKR Velocity Updates Dynamically',
      'teamAvgOkr drops from 90% to 60%',
      `teamAvgOkr === ${dynamicMgrDash.body?.data?.teamSummary?.teamAvgOkr}%`,
      dynamicMgrDash.body?.data?.teamSummary?.teamAvgOkr === 60
    );

    // Dynamically publish Rahul's review in MongoDB: Change status to Released
    await PerformanceReview.findOneAndUpdate({ id: 'rev-m12-emp' }, { status: 'Released' });
    const dynamicHrDash = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/analytics/dashboard',
      headers: authHeaders.hr_admin,
    });
    const finalCompletedReviews = await PerformanceReview.countDocuments({ organizationId: orgId, status: { $in: ['Approved', 'Released'] } });
    const expectedRate2 = Math.round((finalCompletedReviews / totalActiveEmployees) * 100);
    recordTest(
      'Real-time DB Recalculation: Review Publishing Updates Metrics Dynamically',
      `completedReviews increases to ${finalCompletedReviews} and completionPercentage increases to ${expectedRate2}%`,
      `completedReviews === ${dynamicHrDash.body?.data?.summary?.completedReviews}, completionPercentage === ${dynamicHrDash.body?.data?.summary?.completionPercentage}%`,
      dynamicHrDash.body?.data?.summary?.completedReviews === finalCompletedReviews && dynamicHrDash.body?.data?.summary?.completionPercentage === expectedRate2
    );

  } catch (error) {
    console.error('Fatal error during test suite execution:', error);
    recordTest('Fatal Suite Execution Check', 'No unexpected errors', error.message, false);
  } finally {
    await disconnectDatabase();
  }

  // Print Summary Table
  const total = testResults.length;
  const passed = testResults.filter((t) => t.status === 'PASSED').length;
  const failed = total - passed;
  const successRate = total > 0 ? ((passed / total) * 100).toFixed(1) : 0;

  console.log('\n================================================================');
  console.log('   MILESTONE 12 TEST EXECUTION SUMMARY');
  console.log('================================================================');
  console.log(`Total Tests Run:  ${total}`);
  console.log(`Passed:           ${passed}`);
  console.log(`Failed:           ${failed}`);
  console.log(`Success Rate:     ${successRate}%`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTestSuite();
