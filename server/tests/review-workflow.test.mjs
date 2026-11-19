/**
 * ReviewForge - Milestone 11: Review Editing, Approval & Publishing Workflow Test Suite
 * Validates:
 * 1. Mongoose Models & MongoDB persistence (PerformanceReview workflow fields, workflowHistory)
 * 2. Strict Role-Based Access Control (403 for employee/peer_reviewer on workflow endpoints)
 * 3. Manager hierarchy scoping (managers can only submit/request changes/approve for direct reports)
 * 4. Final Publishing Gate: ONLY hr_admin can publish/release reviews to the employee portal (403 for managers)
 * 5. Publishing Gate precondition validation: Cannot publish unapproved reviews (Draft, Pending, Changes Requested) -> HTTP 400
 * 6. Multi-level State Machine Transitions:
 *    - Draft -> Pending Approval (Manager Submit)
 *    - Pending Approval -> Changes Requested (Approver Revisions with required notes)
 *    - Changes Requested -> Pending Approval (Manager Resubmit)
 *    - Pending Approval -> Approved (Manager / HR Sign-off)
 *    - Approved -> Released (HR Admin Final Publishing Gate)
 * 7. Employee reviewStatus synchronization in MongoDB Employee collection across each transition
 * 8. Review Visibility Scoping: Employees CANNOT view reviews until status === 'Released'
 * 9. Section Editing with Evidence Link Preservation (modifying text preserves linked citations)
 * 10. Print/PDF Export endpoint with full audit trail and citation summaries
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
import { PerformanceReview, seedInitialPerformanceReviews } from '../dist/models/PerformanceReview.js';

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
      for (const [k, v] of sp.entries()) {
        req.query[k] = v;
      }
    }
    const normalizedHeaders = {};
    for (const [k, v] of Object.entries(headers)) {
      normalizedHeaders[k.toLowerCase()] = v;
    }
    req.headers = {
      'content-type': 'application/json',
      accept: 'application/json',
      ...normalizedHeaders,
    };
    req.body = body || {};

    let statusCode = 200;
    const responseHeaders = {};
    let responseBody = '';

    const res = new EventEmitter();
    res.statusCode = 200;
    res.setHeader = (name, val) => {
      responseHeaders[name.toLowerCase()] = val;
      return res;
    };
    res.getHeader = (name) => responseHeaders[name.toLowerCase()];
    res.status = (code) => {
      statusCode = code;
      res.statusCode = code;
      return res;
    };
    res.json = (data) => {
      responseHeaders['content-type'] = 'application/json';
      responseBody = JSON.stringify(data);
      res.emit('finish');
      resolve({
        status: statusCode,
        headers: responseHeaders,
        json: async () => data,
        text: async () => responseBody,
      });
      return res;
    };
    res.send = (data) => {
      responseBody = typeof data === 'object' ? JSON.stringify(data) : String(data);
      res.emit('finish');
      resolve({
        status: statusCode,
        headers: responseHeaders,
        json: async () => (typeof data === 'object' ? data : JSON.parse(responseBody)),
        text: async () => responseBody,
      });
      return res;
    };
    res.end = (chunk) => {
      if (chunk) responseBody += chunk;
      res.emit('finish');
      resolve({
        status: statusCode,
        headers: responseHeaders,
        json: async () => (responseBody ? JSON.parse(responseBody) : {}),
        text: async () => responseBody,
      });
      return res;
    };

    app(req, res, (err) => {
      if (err) reject(err);
      else {
        resolve({
          status: 404,
          headers: responseHeaders,
          json: async () => ({ success: false, error: 'Not found' }),
          text: async () => 'Not found',
        });
      }
    });
  });
}

async function runMilestone11Tests() {
  console.log('\n================================================================');
  console.log('   MILESTONE 11: REVIEW EDITING, APPROVAL & PUBLISHING WORKFLOW');
  console.log('================================================================\n');

  try {
    // Step 1: Connect to Database & Prepare Seed State
    console.log('🔗 Step 1: Connecting to MongoDB & Initializing State...');
    await connectDatabase();
    appInstance = createApp();

    await seedInitialPerformanceReviews();

    // 1. Verify seeded review rev-001 exists
    const seedReview = await PerformanceReview.findOne({ id: 'rev-001' });
    recordTest(
      'Review Document Seeding Verification',
      'rev-001 exists in DB',
      seedReview ? `Found ID: ${seedReview.id}` : 'Missing',
      Boolean(seedReview)
    );

    // Reset review status to Draft for testing clean end-to-end state machine transitions
    seedReview.status = 'Draft';
    seedReview.approverName = '';
    seedReview.approvedAt = undefined;
    seedReview.releasedAt = undefined;
    seedReview.managerFeedbackNotes = '';
    seedReview.workflowHistory = [
      {
        action: 'Created',
        actorId: 'usr-admin',
        actorName: 'ReviewForge HR Admin',
        actorRole: 'hr_admin',
        timestamp: new Date().toISOString(),
        notes: 'Initial test setup draft',
      },
    ];
    await seedReview.save();

    // 2. Initial state verification
    recordTest(
      'Review Initial State Reset to Draft',
      'Draft',
      seedReview.status,
      seedReview.status === 'Draft'
    );

    // Step 2: Authenticate Users & Acquire JWT Tokens
    console.log('\n🔑 Step 2: Authenticating Users for RBAC Verification...');
    let adminToken = '';
    let managerToken = '';
    let employeeToken = '';
    let peerToken = '';

    // 3. HR Admin Auth
    const adminLoginRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/auth/login',
      body: { email: 'admin@reviewforge.io', password: 'Admin@ReviewForge2026!' },
    });
    const adminData = await adminLoginRes.json();
    adminToken = adminData.accessToken || '';
    recordTest('HR Admin Login', '200 OK + token', `${adminLoginRes.status} ${Boolean(adminToken)}`, adminLoginRes.status === 200 && !!adminToken);

    // 4. Manager Auth (Elena Rostova - emp-001)
    const mgrLoginRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/auth/login',
      body: { email: 'elena.rostova@reviewforge.io', password: 'Manager@ReviewForge2026!' },
    });
    const mgrData = await mgrLoginRes.json();
    managerToken = mgrData.accessToken || '';
    recordTest('Manager Login (Elena Rostova)', '200 OK + token', `${mgrLoginRes.status} ${Boolean(managerToken)}`, mgrLoginRes.status === 200 && !!managerToken);

    // 5. Employee Auth (Rahul Deshmukh - emp-002, reports to Elena)
    const empLoginRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/auth/login',
      body: { email: 'rahul.deshmukh@reviewforge.io', password: 'Employee@ReviewForge2026!' },
    });
    const empData = await empLoginRes.json();
    employeeToken = empData.accessToken || '';
    recordTest('Employee Login (Rahul Deshmukh)', '200 OK + token', `${empLoginRes.status} ${Boolean(employeeToken)}`, empLoginRes.status === 200 && !!employeeToken);

    // 6. Peer Reviewer Auth (Marcus Vance - emp-003)
    const peerLoginRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/auth/login',
      body: { email: 'marcus.vance@reviewforge.io', password: 'Peer@ReviewForge2026!' },
    });
    const peerData = await peerLoginRes.json();
    peerToken = peerData.accessToken || '';
    recordTest('Peer Reviewer Login (Marcus Vance)', '200 OK + token', `${peerLoginRes.status} ${Boolean(peerToken)}`, peerLoginRes.status === 200 && !!peerToken);

    // Step 3: RBAC & Security Boundaries
    console.log('\n🔒 Step 3: Testing Security Boundaries & Role-Based Access Controls...');

    // 7. Unauthenticated request to submit returns 401
    const unauthSubmitRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/reviews/rev-001/submit',
      body: {},
    });
    recordTest('RBAC: Unauthenticated submit rejected (401)', 401, unauthSubmitRes.status, unauthSubmitRes.status === 401);

    // 8. Employee cannot submit review for approval (403 Forbidden)
    const empSubmitRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/reviews/rev-001/submit',
      headers: { authorization: `Bearer ${employeeToken}` },
      body: {},
    });
    recordTest('RBAC: Employee submit forbidden (403)', 403, empSubmitRes.status, empSubmitRes.status === 403);

    // 9. Peer Reviewer cannot submit review for approval (403 Forbidden)
    const peerSubmitRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/reviews/rev-001/submit',
      headers: { authorization: `Bearer ${peerToken}` },
      body: {},
    });
    recordTest('RBAC: Peer reviewer submit forbidden (403)', 403, peerSubmitRes.status, peerSubmitRes.status === 403);

    // 10. Employee cannot approve review (403 Forbidden)
    const empApproveRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/reviews/rev-001/approve',
      headers: { authorization: `Bearer ${employeeToken}` },
      body: {},
    });
    recordTest('RBAC: Employee approve forbidden (403)', 403, empApproveRes.status, empApproveRes.status === 403);

    // 11. Employee cannot request changes (403 Forbidden)
    const empChangesRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/reviews/rev-001/request-changes',
      headers: { authorization: `Bearer ${employeeToken}` },
      body: { notes: 'Self revision attempt' },
    });
    recordTest('RBAC: Employee request-changes forbidden (403)', 403, empChangesRes.status, empChangesRes.status === 403);

    // 12. Manager cannot approve/submit review for non-direct report (emp-006 reports to Maya emp-005)
    // Create a temporary mock review for emp-006
    await PerformanceReview.updateOne(
      { id: 'rev-test-nonreport' },
      {
        $set: {
          id: 'rev-test-nonreport',
          organizationId: 'org-reviewforge-default',
          employeeId: 'emp-006',
          employeeName: 'Julian Mercer',
          jobTitle: 'Principal Product Designer',
          departmentName: 'Product & Design',
          reviewCycleId: 'cycle-2026-annual',
          reviewCycleTitle: 'FY2026 Annual Review',
          status: 'Draft',
          overallRating: 4.5,
          evidenceCoverageScore: 85,
          synthesisEngine: 'Google Gemini',
          sections: seedReview.sections,
        },
      },
      { upsert: true }
    );

    const mgrNonReportSubmitRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/reviews/rev-test-nonreport/submit',
      headers: { authorization: `Bearer ${managerToken}` },
      body: {},
    });
    recordTest('Manager Scoping: Cannot submit non-direct report review (403)', 403, mgrNonReportSubmitRes.status, mgrNonReportSubmitRes.status === 403);

    // 13. Manager cannot request changes on non-direct report (403)
    const mgrNonReportChangesRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/reviews/rev-test-nonreport/request-changes',
      headers: { authorization: `Bearer ${managerToken}` },
      body: { notes: 'Invalid manager scoping attempt' },
    });
    recordTest('Manager Scoping: Cannot request changes on non-direct report (403)', 403, mgrNonReportChangesRes.status, mgrNonReportChangesRes.status === 403);

    // 14. Manager cannot approve non-direct report (403)
    const mgrNonReportApproveRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/reviews/rev-test-nonreport/approve',
      headers: { authorization: `Bearer ${managerToken}` },
      body: {},
    });
    recordTest('Manager Scoping: Cannot approve non-direct report (403)', 403, mgrNonReportApproveRes.status, mgrNonReportApproveRes.status === 403);

    // 15. Final Publishing Gate: Manager blocked from publishing/releasing review (403 Forbidden)
    const mgrPublishRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/reviews/rev-001/publish',
      headers: { authorization: `Bearer ${managerToken}` },
      body: {},
    });
    recordTest('Publishing Gate: Manager role blocked from publishing review (403)', 403, mgrPublishRes.status, mgrPublishRes.status === 403);

    // Step 4: Validation & Precondition Checks
    console.log('\n🛡️ Step 4: Input Validation & Precondition Safeguards...');

    // 16. Non-existent review ID returns 404
    const notFoundReviewRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/reviews/rev-nonexistent-999/submit',
      headers: { authorization: `Bearer ${adminToken}` },
      body: {},
    });
    recordTest('Validation: Non-existent review ID returns 404', 404, notFoundReviewRes.status, notFoundReviewRes.status === 404);

    // 17. Request changes without notes returns 400
    const missingNotesRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/reviews/rev-001/request-changes',
      headers: { authorization: `Bearer ${adminToken}` },
      body: {},
    });
    recordTest('Validation: Request changes missing notes returns 400', 400, missingNotesRes.status, missingNotesRes.status === 400);

    // 18. Cannot approve Draft review directly without submitting (400 Bad Request)
    const directApproveDraftRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/reviews/rev-001/approve',
      headers: { authorization: `Bearer ${managerToken}` },
      body: {},
    });
    recordTest('Validation: Cannot approve unsubmitted Draft review (400)', 400, directApproveDraftRes.status, directApproveDraftRes.status === 400);

    // 19. Cannot publish unapproved Draft review (400 Bad Request)
    const publishDraftRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/reviews/rev-001/publish',
      headers: { authorization: `Bearer ${adminToken}` },
      body: {},
    });
    recordTest('Publishing Gate Precondition: Cannot publish unapproved review (400)', 400, publishDraftRes.status, publishDraftRes.status === 400);

    // Step 5: End-to-End Workflow State Machine Execution
    console.log('\n⚙️ Step 5: Executing Multi-Level Approval State Machine...');

    // 20. Transition 1: Manager submits Draft review -> Pending Approval
    const submitRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/reviews/rev-001/submit',
      headers: { authorization: `Bearer ${managerToken}` },
      body: { notes: 'Submitted for managerial calibration and secondary approval' },
    });
    const submitData = await submitRes.json();
    recordTest(
      'Transition 1: Manager submits review -> Pending Approval',
      '200 OK + status Pending Approval',
      `${submitRes.status} ${submitData.data?.status}`,
      submitRes.status === 200 && submitData.data?.status === 'Pending Approval'
    );

    // 21. Verify employee reviewStatus updated in MongoDB
    const empAfterSubmit = await Employee.findOne({ id: 'emp-002' });
    recordTest(
      'Employee Sync: reviewStatus updated to Pending Approval',
      'Pending Approval',
      empAfterSubmit?.reviewStatus,
      empAfterSubmit?.reviewStatus === 'Pending Approval'
    );

    // 22. Cannot submit an already Pending Approval review (400)
    const duplicateSubmitRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/reviews/rev-001/submit',
      headers: { authorization: `Bearer ${managerToken}` },
      body: {},
    });
    recordTest('Validation: Cannot resubmit already Pending review (400)', 400, duplicateSubmitRes.status, duplicateSubmitRes.status === 400);

    // 23. Transition 2: Approver requests changes -> Changes Requested
    const revisionNotes = 'Please adjust Section 6 to highlight cross-team mentoring milestones with junior frontend engineers.';
    const requestChangesRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/reviews/rev-001/request-changes',
      headers: { authorization: `Bearer ${adminToken}` },
      body: { notes: revisionNotes },
    });
    const reqChangesData = await requestChangesRes.json();
    recordTest(
      'Transition 2: Request revisions -> Changes Requested',
      '200 OK + status Changes Requested',
      `${requestChangesRes.status} ${reqChangesData.data?.status}`,
      requestChangesRes.status === 200 && reqChangesData.data?.status === 'Changes Requested'
    );

    // 24. Verify managerFeedbackNotes stored on review
    recordTest(
      'Revision Feedback: managerFeedbackNotes populated in DB',
      revisionNotes,
      reqChangesData.data?.managerFeedbackNotes,
      reqChangesData.data?.managerFeedbackNotes === revisionNotes
    );

    // 25. Verify employee reviewStatus updated to In Progress during revision
    const empDuringRevision = await Employee.findOne({ id: 'emp-002' });
    recordTest(
      'Employee Sync: reviewStatus reverted to In Progress during revision',
      'In Progress',
      empDuringRevision?.reviewStatus,
      empDuringRevision?.reviewStatus === 'In Progress'
    );

    // 26. Transition 3: Manager resubmits revised review -> Pending Approval
    const resubmitRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/reviews/rev-001/submit',
      headers: { authorization: `Bearer ${managerToken}` },
      body: { notes: 'Addressed feedback: expanded mentoring accomplishments in Section 6.' },
    });
    const resubmitData = await resubmitRes.json();
    recordTest(
      'Transition 3: Manager resubmits review -> Pending Approval',
      '200 OK + status Pending Approval',
      `${resubmitRes.status} ${resubmitData.data?.status}`,
      resubmitRes.status === 200 && resubmitData.data?.status === 'Pending Approval'
    );

    // 27. Transition 4: Manager/HR formally approves review -> Approved
    const approveRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/reviews/rev-001/approve',
      headers: { authorization: `Bearer ${managerToken}` },
      body: { notes: 'Calibration complete. All criteria verified against rubric.' },
    });
    const approveData = await approveRes.json();
    recordTest(
      'Transition 4: Manager approves review -> Approved',
      '200 OK + status Approved',
      `${approveRes.status} ${approveData.data?.status}`,
      approveRes.status === 200 && approveData.data?.status === 'Approved'
    );

    // 28. Verify approver metadata recorded
    const isApproverSet = Boolean(approveData.data?.approverName) && Boolean(approveData.data?.approvedAt);
    recordTest(
      'Approval Metadata: approverName and approvedAt recorded',
      'Approver details recorded',
      `Approver: ${approveData.data?.approverName}, Date: ${approveData.data?.approvedAt}`,
      isApproverSet
    );

    // 29. Verify employee reviewStatus updated to Approved
    const empAfterApproval = await Employee.findOne({ id: 'emp-002' });
    recordTest(
      'Employee Sync: reviewStatus updated to Approved',
      'Approved',
      empAfterApproval?.reviewStatus,
      empAfterApproval?.reviewStatus === 'Approved'
    );

    // 30. Scoping Gate Check: Employee STILL CANNOT see review while in Approved status
    const empViewApprovedRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/reviews?employeeId=emp-002',
      headers: { authorization: `Bearer ${employeeToken}` },
    });
    const empApprovedData = await empViewApprovedRes.json();
    recordTest(
      'Visibility Gate: Employee cannot view review while Approved (prior to Release)',
      'count === 0',
      `count: ${empApprovedData.count}`,
      empViewApprovedRes.status === 200 && empApprovedData.count === 0
    );

    // 31. Transition 5: Final Publishing Gate: HR Admin formally releases review -> Released
    const releaseRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/reviews/rev-001/publish',
      headers: { authorization: `Bearer ${adminToken}` },
      body: {},
    });
    const releaseData = await releaseRes.json();
    recordTest(
      'Transition 5: Final Publishing Gate: HR Admin publishes review -> Released',
      '200 OK + status Released',
      `${releaseRes.status} ${releaseData.data?.status}`,
      releaseRes.status === 200 && releaseData.data?.status === 'Released'
    );

    // 32. Verify releasedAt timestamp stored
    recordTest(
      'Release Metadata: releasedAt timestamp recorded',
      'releasedAt present',
      `${releaseData.data?.releasedAt}`,
      Boolean(releaseData.data?.releasedAt)
    );

    // 33. Verify employee reviewStatus updated to Released in MongoDB
    const empAfterRelease = await Employee.findOne({ id: 'emp-002' });
    recordTest(
      'Employee Sync: reviewStatus updated to Released in Employee collection',
      'Released',
      empAfterRelease?.reviewStatus,
      empAfterRelease?.reviewStatus === 'Released'
    );

    // 34. Employee Portal Visibility: Employee can NOW view the published review
    const empViewReleasedRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/reviews?employeeId=emp-002',
      headers: { authorization: `Bearer ${employeeToken}` },
    });
    const empReleasedData = await empViewReleasedRes.json();
    recordTest(
      'Visibility Gate: Employee CAN view review after Release',
      'count === 1 and status Released',
      `count: ${empReleasedData.count}, status: ${empReleasedData.data?.[0]?.status}`,
      empViewReleasedRes.status === 200 &&
        empReleasedData.count === 1 &&
        empReleasedData.data?.[0]?.status === 'Released'
    );

    // 35. Complete Workflow Audit Trail Verification
    const auditReview = await PerformanceReview.findOne({ id: 'rev-001' });
    const history = auditReview?.workflowHistory || [];
    const expectedActions = ['Created', 'Submitted', 'ChangesRequested', 'Submitted', 'Approved', 'Released'];
    const actualActions = history.map((h) => h.action);
    const hasAllSteps = expectedActions.every((act) => actualActions.includes(act));
    recordTest(
      'Audit Trail Integrity: Complete workflowHistory lifecycle recorded in DB',
      expectedActions.join(' -> '),
      actualActions.join(' -> '),
      hasAllSteps && history.length >= 6
    );

    // Step 6: Section Editing with Evidence Link Preservation
    console.log('\n✏️ Step 6: Testing Section Editing & Evidence Citation Preservation...');

    // 36. Reset rev-001 status to Draft to test section editing
    await PerformanceReview.updateOne({ id: 'rev-001' }, { $set: { status: 'Draft' } });

    // Count existing evidence citations in majorAchievements before edit
    const initialAchievements = auditReview?.sections?.majorAchievements;
    const initialEvidenceCount = initialAchievements?.evidenceRefs?.length || 0;

    const modifiedText = 'Rahul delivered extraordinary architectural leadership in FY2026, spearheading high-throughput messaging improvements.';
    const editSectionRes = await dispatch(appInstance, {
      method: 'PATCH',
      url: '/api/v1/reviews/rev-001/sections/majorAchievements',
      headers: { authorization: `Bearer ${managerToken}` },
      body: { content: modifiedText }, // omitted evidenceRefs to verify automatic preservation
    });
    const editSectionData = await editSectionRes.json();
    const updatedAchievements = editSectionData.data?.sections?.majorAchievements;
    const preservedEvidenceCount = updatedAchievements?.evidenceRefs?.length || 0;

    recordTest(
      'Section Editing: Modifies content successfully',
      modifiedText,
      updatedAchievements?.content,
      editSectionRes.status === 200 && updatedAchievements?.content === modifiedText
    );

    // 37. Verify evidence citations were preserved intact
    recordTest(
      'Evidence Preservation: All evidenceRefs retained intact during content edit',
      `${initialEvidenceCount} citations preserved`,
      `${preservedEvidenceCount} citations retained`,
      preservedEvidenceCount === initialEvidenceCount && preservedEvidenceCount > 0
    );

    // 38. Invalid section key returns 400
    const invalidSectionRes = await dispatch(appInstance, {
      method: 'PATCH',
      url: '/api/v1/reviews/rev-001/sections/invalidSectionName',
      headers: { authorization: `Bearer ${managerToken}` },
      body: { content: 'test content' },
    });
    recordTest('Section Editing Validation: Invalid section key returns 400', 400, invalidSectionRes.status, invalidSectionRes.status === 400);

    // 39. Re-release rev-001 and verify editing a released review is blocked (400)
    await PerformanceReview.updateOne({ id: 'rev-001' }, { $set: { status: 'Released' } });
    const editReleasedRes = await dispatch(appInstance, {
      method: 'PATCH',
      url: '/api/v1/reviews/rev-001/sections/majorAchievements',
      headers: { authorization: `Bearer ${managerToken}` },
      body: { content: 'Illegal edit attempt after release' },
    });
    recordTest('Section Editing Safeguard: Cannot edit released review (400)', 400, editReleasedRes.status, editReleasedRes.status === 400);

    // Step 7: Print-Ready Export Endpoint
    console.log('\n📄 Step 7: Testing Print-Ready PDF / Export Endpoint...');

    // 40. HR Admin accesses export endpoint
    const adminExportRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/reviews/rev-001/export',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const adminExportData = await adminExportRes.json();
    recordTest(
      'Export Endpoint: HR Admin retrieves print-ready document',
      '200 OK + export document',
      `${adminExportRes.status} ${Boolean(adminExportData.data?.review)}`,
      adminExportRes.status === 200 && Boolean(adminExportData.data?.review)
    );

    // 41. Verify export data contains auditSummary and totalCitations
    const exportSummary = adminExportData.data?.review?.auditSummary;
    recordTest(
      'Export Metadata: Contains citation auditSummary breakdown',
      'totalCitations > 0',
      `totalCitations: ${exportSummary?.totalCitations}`,
      Boolean(exportSummary?.totalCitations && exportSummary.totalCitations > 0)
    );

    // 42. Employee CAN export released review
    const empExportRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/reviews/rev-001/export',
      headers: { authorization: `Bearer ${employeeToken}` },
    });
    recordTest(
      'Export Scoping: Employee CAN export their own released review',
      '200 OK',
      `${empExportRes.status}`,
      empExportRes.status === 200
    );

    // 43. Employee CANNOT export another employee review (emp-003 Marcus)
    const empExportOtherRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/reviews/rev-002/export',
      headers: { authorization: `Bearer ${employeeToken}` },
    });
    recordTest(
      'Export Scoping: Employee CANNOT export other employee review (403)',
      403,
      empExportOtherRes.status,
      empExportOtherRes.status === 403
    );
  } catch (error) {
    console.error('Fatal error during Milestone 11 tests:', error);
    recordTest('Milestone 11 Execution', 'Complete test suite without crashes', error.message, false);
  } finally {
    await disconnectDatabase();
  }

  // Summary Report
  console.log('\n================================================================');
  console.log('   MILESTONE 11 TEST EXECUTION SUMMARY');
  console.log('================================================================');
  const passedCount = testResults.filter((r) => r.status === 'PASSED').length;
  const failedCount = testResults.filter((r) => r.status === 'FAILED').length;
  console.log(`Total Tests Run:  ${testResults.length}`);
  console.log(`Passed:           ${passedCount}`);
  console.log(`Failed:           ${failedCount}`);
  console.log(`Success Rate:     ${((passedCount / testResults.length) * 100).toFixed(1)}%`);
  console.log('================================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runMilestone11Tests();
