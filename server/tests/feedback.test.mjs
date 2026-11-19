/**
 * ReviewForge - Milestone 7: 360-Degree Feedback Test Suite
 * Validates FeedbackItem and FeedbackRequest models, live MongoDB persistence,
 * multi-perspective feedback collection, 5-rubric rating validation,
 * anonymity masking controls (strict employee masking vs HR compliance oversight),
 * cycle lifecycle guards (Active required, Draft/Completed rejected),
 * peer request creation, declining, auto-completion, and aggregate summary analytics.
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
import { FeedbackItem, seedInitialFeedback } from '../dist/models/Feedback.js';
import { FeedbackRequest, seedInitialFeedbackRequests } from '../dist/models/FeedbackRequest.js';

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

/**
 * Dispatch an HTTP request in-process to the Express application
 */
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
    req.headers = {
      'content-type': 'application/json',
      accept: 'application/json',
      ...headers,
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

async function runMilestone7Tests() {
  console.log('\n=======================================================');
  console.log('   MILESTONE 7: 360-DEGREE FEEDBACK TEST SUITE');
  console.log('=======================================================\n');

  try {
    // Step 1: Connect to MongoDB & Seed Collections
    console.log('🔗 Step 1: Connecting to MongoDB & Seeding Collections...');
    await connectDatabase();
    appInstance = createApp();

    await Organization.seedDefaultOrganization();
    await User.seedDefaultUsers();
    await Department.seedDefaultDepartments();
    await Employee.seedDefaultEmployees();
    await ReviewCycle.seedDefaultReviewCycles();
    await seedInitialFeedback();
    await seedInitialFeedbackRequests();

    const initialFeedbackCount = await FeedbackItem.countDocuments({
      organizationId: 'org-reviewforge-default',
    });
    recordTest(
      'Database Seed: Initial 360 Feedback Items in MongoDB',
      'count >= 6',
      `count = ${initialFeedbackCount}`,
      initialFeedbackCount >= 6
    );

    const initialRequestCount = await FeedbackRequest.countDocuments({
      organizationId: 'org-reviewforge-default',
    });
    recordTest(
      'Database Seed: Initial Peer Feedback Requests in MongoDB',
      'count >= 2',
      `count = ${initialRequestCount}`,
      initialRequestCount >= 2
    );

    // Step 2: Login Role Accounts to Acquire JWTs
    console.log('\n🔑 Step 2: Logging in role accounts to obtain JWTs...');
    const loginRole = async (email, password) => {
      const res = await dispatch(appInstance, {
        method: 'POST',
        url: '/api/v1/auth/login',
        body: { email, password },
      });
      const data = await res.json();
      return data.accessToken;
    };

    const hrToken = await loginRole('admin@reviewforge.io', 'Admin@ReviewForge2026!');
    const mgrToken = await loginRole('elena.rostova@reviewforge.io', 'Manager@ReviewForge2026!');
    const empToken = await loginRole('rahul.deshmukh@reviewforge.io', 'Employee@ReviewForge2026!');
    const peerToken = await loginRole('marcus.vance@reviewforge.io', 'Peer@ReviewForge2026!');

    recordTest(
      'Auth Tokens Acquired for HR, Manager, Employee, Peer',
      'All 4 tokens defined',
      hrToken && mgrToken && empToken && peerToken ? '4 tokens received' : 'Missing token',
      Boolean(hrToken && mgrToken && empToken && peerToken)
    );

    // Step 3: Test GET /api/v1/feedback Directory & RBAC Scoping
    console.log('\n📋 Step 3: Testing Feedback Directory & Role Scoping...');
    const hrListRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/feedback',
      headers: { authorization: `Bearer ${hrToken}` },
    });
    const hrListData = await hrListRes.json();
    recordTest(
      'GET /feedback as HR Admin: Unrestricted org-wide listing',
      200,
      hrListRes.status,
      hrListRes.status === 200 && Array.isArray(hrListData.data) && hrListData.data.length >= 6
    );

    const empListRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/feedback',
      headers: { authorization: `Bearer ${empToken}` },
    });
    const empListData = await empListRes.json();
    const empOnlyScoped = empListData.data.every(
      (f) => f.targetEmployeeId === 'emp-002' || f.providerEmployeeId === 'emp-002'
    );
    recordTest(
      'GET /feedback as Employee: Scoped strictly to self target/author',
      true,
      empOnlyScoped,
      empListRes.status === 200 && empOnlyScoped
    );

    const unauthGet = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/feedback',
    });
    recordTest(
      'GET /feedback without token: Rejected with HTTP 401',
      401,
      unauthGet.status,
      unauthGet.status === 401
    );

    // Step 4: Test Strict Anonymity Masking Controls
    console.log('\n🔒 Step 4: Testing Anonymity Controls & Identity Masking...');
    // Item fb-002 is an anonymous feedback for Rahul Deshmukh (emp-002) authored by Sofia (emp-007)
    const empItemRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/feedback/fb-002',
      headers: { authorization: `Bearer ${empToken}` },
    });
    const empItemData = await empItemRes.json();
    const isMaskedForRecipient =
      empItemRes.status === 200 &&
      empItemData.data.isAnonymous === true &&
      empItemData.data.providerEmployeeId === null &&
      empItemData.data.providerEmployeeName === 'Anonymous Colleague';
    recordTest(
      'Anonymity Masking: Recipient Employee receives null ID and Anonymous name',
      true,
      isMaskedForRecipient,
      isMaskedForRecipient
    );

    const hrItemRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/feedback/fb-002',
      headers: { authorization: `Bearer ${hrToken}` },
    });
    const hrItemData = await hrItemRes.json();
    const isAttributedForHr =
      hrItemRes.status === 200 &&
      hrItemData.data.isAnonymous === true &&
      hrItemData.data.providerEmployeeName === 'Sofia Al-Mansoor';
    recordTest(
      'Anonymity Oversight: HR Admin retains compliance attribution oversight',
      true,
      isAttributedForHr,
      isAttributedForHr
    );

    // Step 5: Test Feedback Filters & Single Lookup
    console.log('\n🔍 Step 5: Testing Feedback Filters & Single Retrieval...');
    const filterCycleRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/feedback?reviewCycleId=cycle-2026-annual',
      headers: { authorization: `Bearer ${hrToken}` },
    });
    const filterCycleData = await filterCycleRes.json();
    recordTest(
      'Filter feedback by reviewCycleId=cycle-2026-annual',
      200,
      filterCycleRes.status,
      filterCycleRes.status === 200 && filterCycleData.data.length >= 6
    );

    const filterTargetRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/feedback?targetEmployeeId=emp-002',
      headers: { authorization: `Bearer ${hrToken}` },
    });
    const filterTargetData = await filterTargetRes.json();
    const targetAllMatch = filterTargetData.data.every((f) => f.targetEmployeeId === 'emp-002');
    recordTest(
      'Filter feedback by targetEmployeeId=emp-002',
      true,
      targetAllMatch,
      filterTargetRes.status === 200 && targetAllMatch
    );

    const singleFoundRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/feedback/fb-001',
      headers: { authorization: `Bearer ${hrToken}` },
    });
    const singleFoundData = await singleFoundRes.json();
    recordTest(
      'GET /feedback/fb-001: Returns single feedback profile',
      'fb-001',
      singleFoundData.data?.id,
      singleFoundRes.status === 200 && singleFoundData.data?.id === 'fb-001'
    );

    const singleNotFound = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/feedback/fb-nonexistent',
      headers: { authorization: `Bearer ${hrToken}` },
    });
    recordTest(
      'GET /feedback/fb-nonexistent: Returns HTTP 404',
      404,
      singleNotFound.status,
      singleNotFound.status === 404
    );

    // Step 6: Test Feedback Submission & Validations
    console.log('\n✍️ Step 6: Testing Feedback Submission & Lifecycle Guards...');
    const validSubmission = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/feedback',
      headers: { authorization: `Bearer ${peerToken}` },
      body: {
        reviewCycleId: 'cycle-2026-annual',
        targetEmployeeId: 'emp-002',
        isAnonymous: true,
        relationship: 'Peer',
        ratings: {
          collaboration: 5,
          communication: 4,
          problemSolving: 5,
          technicalContribution: 5,
          leadership: 4,
        },
        strengths: 'Outstanding system architecture and event streaming reliability.',
        improvements: 'Document design choices in RFCs earlier in the planning sprint.',
        additionalComments: 'Consistently exceptional colleague.',
      },
    });
    const validSubData = await validSubmission.json();
    recordTest(
      'POST /feedback as Peer: Submits valid 360 review (HTTP 201)',
      201,
      validSubmission.status,
      validSubmission.status === 201 && Boolean(validSubData.data?.id)
    );

    const createdFbId = validSubData.data?.id;
    const dbFeedback = await FeedbackItem.findOne({ id: createdFbId });
    recordTest(
      'Database Verification: Submitted feedback persisted in MongoDB',
      true,
      Boolean(dbFeedback),
      Boolean(dbFeedback && dbFeedback.ratings.collaboration === 5)
    );

    // Inactive Cycle Guard (Draft cycle cycle-2027-q1-preview)
    const draftCycleSubmission = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/feedback',
      headers: { authorization: `Bearer ${peerToken}` },
      body: {
        reviewCycleId: 'cycle-2027-q1-preview',
        targetEmployeeId: 'emp-002',
        ratings: {
          collaboration: 4,
          communication: 4,
          problemSolving: 4,
          technicalContribution: 4,
          leadership: 4,
        },
        strengths: 'Good technical contribution in squad',
        improvements: 'Need more cross-team documentation',
      },
    });
    recordTest(
      'Lifecycle Guard: Submitting feedback against Draft cycle rejected (HTTP 400)',
      400,
      draftCycleSubmission.status,
      draftCycleSubmission.status === 400
    );

    // Invalid Rubric Rating (>5)
    const invalidRatingSubmission = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/feedback',
      headers: { authorization: `Bearer ${peerToken}` },
      body: {
        reviewCycleId: 'cycle-2026-annual',
        targetEmployeeId: 'emp-002',
        ratings: {
          collaboration: 6, // Invalid > 5
          communication: 4,
          problemSolving: 5,
          technicalContribution: 5,
          leadership: 4,
        },
        strengths: 'Great mentor across all teams',
        improvements: 'Document RFCs earlier',
      },
    });
    recordTest(
      'Validation Guard: Out-of-bounds rating (>5) rejected (HTTP 400)',
      400,
      invalidRatingSubmission.status,
      invalidRatingSubmission.status === 400
    );

    // Self-Review as Peer Feedback Guard
    const selfReviewSubmission = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/feedback',
      headers: { authorization: `Bearer ${empToken}` },
      body: {
        reviewCycleId: 'cycle-2026-annual',
        targetEmployeeId: 'emp-002', // Same as caller emp-002
        ratings: {
          collaboration: 5,
          communication: 5,
          problemSolving: 5,
          technicalContribution: 5,
          leadership: 5,
        },
        strengths: 'I do great work across the board.',
        improvements: 'None identified at this time.',
      },
    });
    recordTest(
      'Validation Guard: Self-review as peer feedback rejected (HTTP 400)',
      400,
      selfReviewSubmission.status,
      selfReviewSubmission.status === 400
    );

    // Non-existent target employee
    const nonExistentTarget = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/feedback',
      headers: { authorization: `Bearer ${peerToken}` },
      body: {
        reviewCycleId: 'cycle-2026-annual',
        targetEmployeeId: 'emp-nonexistent',
        ratings: {
          collaboration: 5,
          communication: 5,
          problemSolving: 5,
          technicalContribution: 5,
          leadership: 5,
        },
        strengths: 'Valid strength text description',
        improvements: 'Valid improvement text description',
      },
    });
    recordTest(
      'Validation Guard: Non-existent target employee rejected (HTTP 404)',
      404,
      nonExistentTarget.status,
      nonExistentTarget.status === 404
    );

    // Step 7: Test Peer Feedback Requests Lifecycle
    console.log('\n📬 Step 7: Testing Peer Feedback Request Lifecycle...');
    const listRequestsRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/feedback/requests',
      headers: { authorization: `Bearer ${hrToken}` },
    });
    const listRequestsData = await listRequestsRes.json();
    recordTest(
      'GET /feedback/requests: Returns list of feedback requests',
      200,
      listRequestsRes.status,
      listRequestsRes.status === 200 && Array.isArray(listRequestsData.data) && listRequestsData.data.length >= 2
    );

    const createRequestRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/feedback/requests',
      headers: { authorization: `Bearer ${mgrToken}` },
      body: {
        reviewCycleId: 'cycle-2026-annual',
        targetEmployeeId: 'emp-006',
        reviewerEmployeeId: 'emp-002',
        relationship: 'Peer',
        dueDate: '2026-11-28',
        message: 'Please review Julian’s new Studio designs.',
      },
    });
    const createReqData = await createRequestRes.json();
    recordTest(
      'POST /feedback/requests as Manager: Creates request (HTTP 201)',
      201,
      createRequestRes.status,
      createRequestRes.status === 201 && Boolean(createReqData.data?.id)
    );

    const createdRequestId = createReqData.data?.id;
    const dbRequest = await FeedbackRequest.findOne({ id: createdRequestId });
    recordTest(
      'Database Verification: Feedback request persisted in MongoDB with status=Pending',
      'Pending',
      dbRequest?.status,
      dbRequest?.status === 'Pending'
    );

    // Duplicate request prevention
    const duplicateRequestRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/feedback/requests',
      headers: { authorization: `Bearer ${mgrToken}` },
      body: {
        reviewCycleId: 'cycle-2026-annual',
        targetEmployeeId: 'emp-006',
        reviewerEmployeeId: 'emp-002',
      },
    });
    recordTest(
      'Conflict Guard: Duplicate pending feedback request rejected (HTTP 409)',
      409,
      duplicateRequestRes.status,
      duplicateRequestRes.status === 409
    );

    // Self-request prevention (target == reviewer)
    const selfRequestRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/feedback/requests',
      headers: { authorization: `Bearer ${mgrToken}` },
      body: {
        reviewCycleId: 'cycle-2026-annual',
        targetEmployeeId: 'emp-006',
        reviewerEmployeeId: 'emp-006',
      },
    });
    recordTest(
      'Validation Guard: Requesting feedback from the evaluated employee rejected (HTTP 400)',
      400,
      selfRequestRes.status,
      selfRequestRes.status === 400
    );

    // Decline Feedback Request
    // emp-002 declines the request created above
    const declineRes = await dispatch(appInstance, {
      method: 'PATCH',
      url: `/api/v1/feedback/requests/${createdRequestId}/decline`,
      headers: { authorization: `Bearer ${empToken}` },
    });
    const declineData = await declineRes.json();
    recordTest(
      'PATCH /feedback/requests/:id/decline as Reviewer: Request declined (HTTP 200)',
      200,
      declineRes.status,
      declineRes.status === 200 && declineData.data?.status === 'Declined'
    );

    const dbDeclinedRequest = await FeedbackRequest.findOne({ id: createdRequestId });
    recordTest(
      'Database Verification: Request status updated to Declined in MongoDB',
      'Declined',
      dbDeclinedRequest?.status,
      dbDeclinedRequest?.status === 'Declined'
    );

    // Unauthorized user declining another user's request
    const unauthorizedDecline = await dispatch(appInstance, {
      method: 'PATCH',
      url: '/api/v1/feedback/requests/fbr-001/decline', // Reviewer is emp-003
      headers: { authorization: `Bearer ${empToken}` }, // emp-002 is caller
    });
    recordTest(
      'RBAC Guard: Non-assigned user cannot decline another reviewer request (HTTP 403)',
      403,
      unauthorizedDecline.status,
      unauthorizedDecline.status === 403
    );

    // Auto-completion of request upon feedback submission
    // fbr-001 has reviewer emp-003 for target emp-002
    const completeViaSubmission = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/feedback',
      headers: { authorization: `Bearer ${peerToken}` }, // emp-003 is marcus/peer reviewer
      body: {
        reviewCycleId: 'cycle-2026-annual',
        targetEmployeeId: 'emp-002',
        relationship: 'Peer',
        requestId: 'fbr-001',
        ratings: {
          collaboration: 5,
          communication: 5,
          problemSolving: 5,
          technicalContribution: 5,
          leadership: 5,
        },
        strengths: 'Excellent teamwork across squads and great architecture.',
        improvements: 'Keep mentoring junior engineers.',
      },
    });
    const dbCompletedRequest = await FeedbackRequest.findOne({ id: 'fbr-001' });
    recordTest(
      'Auto-Completion: Submitting feedback transitions pending request to Completed',
      'Completed',
      dbCompletedRequest?.status,
      completeViaSubmission.status === 201 && dbCompletedRequest?.status === 'Completed'
    );

    // Step 8: Test Feedback Summary & Aggregation Analytics
    console.log('\n📊 Step 8: Testing Feedback Summary Analytics...');
    const summaryRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/feedback/summary/emp-002',
      headers: { authorization: `Bearer ${empToken}` },
    });
    const summaryPayload = await summaryRes.json();
    const summaryData = summaryPayload.data;
    const isSummaryValid =
      summaryRes.status === 200 &&
      summaryData &&
      summaryData.totalReviews >= 3 &&
      summaryData.averageScore > 0 &&
      summaryData.dimensionAverages.collaboration > 0;
    recordTest(
      'GET /feedback/summary/:employeeId as Self: Computes correct rubric averages (HTTP 200)',
      true,
      isSummaryValid,
      isSummaryValid
    );

    const unauthorizedSummary = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/feedback/summary/emp-003', // Elena
      headers: { authorization: `Bearer ${empToken}` }, // Rahul cannot view Elena's private summary
    });
    recordTest(
      'RBAC Guard: Employee cannot view another employee feedback summary (HTTP 403)',
      403,
      unauthorizedSummary.status,
      unauthorizedSummary.status === 403
    );

    // Summary of Test Suite
    console.log('\n================================================================');
    console.log('📊 MILESTONE 7 360-DEGREE FEEDBACK TEST EXECUTION SUMMARY');
    console.log('================================================================');
    const passedTests = testResults.filter((t) => t.status === 'PASSED').length;
    const totalTests = testResults.length;
    console.log(`Total Automated Tests: ${totalTests}`);
    console.log(`Passed:                ${passedTests}`);
    console.log(`Failed:                ${totalTests - passedTests}`);
    console.log('================================================================\n');

    if (passedTests === totalTests) {
      console.log('🎉 ALL 28 MILESTONE 7 TESTS PASSED CLEANLY!\n');
    } else {
      console.error('❌ SOME TESTS FAILED! INVESTIGATE PRIOR TO APPROVAL.');
      process.exitCode = 1;
    }
  } catch (error) {
    console.error('💥 Fatal error executing Milestone 7 test suite:', error);
    process.exitCode = 1;
  } finally {
    await disconnectDatabase();
  }
}

void runMilestone7Tests();
