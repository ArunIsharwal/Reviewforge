/**
 * ReviewForge - Milestone 8: Quarterly OKR Management Test Suite
 * Validates OKR and KeyResult models, live MongoDB persistence,
 * quantitative goal tracking across Q1-Q4, automatic progress and status calculation,
 * granular Key Result progress updating, role-based visibility scoping,
 * conflict and validation guards, deletion, and summary aggregation analytics.
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
import { OKR, seedInitialOKRs } from '../dist/models/OKR.js';

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

async function runMilestone8Tests() {
  console.log('\n=======================================================');
  console.log('   MILESTONE 8: QUARTERLY OKR MANAGEMENT TEST SUITE');
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
    await seedInitialOKRs();

    const initialOkrCount = await OKR.countDocuments({
      organizationId: 'org-reviewforge-default',
    });
    recordTest(
      'Database Seed: Initial Quarterly OKRs in MongoDB',
      'count >= 8',
      `count = ${initialOkrCount}`,
      initialOkrCount >= 8
    );

    const seededOkr2 = await OKR.findOne({ id: 'okr-002' });
    recordTest(
      'Database Seed: Core Q2 API Latency OKR exists with key results',
      'okr-002 found',
      seededOkr2 ? 'okr-002 found' : 'Not found',
      Boolean(seededOkr2 && seededOkr2.keyResults.length === 3)
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

    // Step 3: Test GET /api/v1/okrs Directory & RBAC Scoping
    console.log('\n📋 Step 3: Testing OKR Directory & Scoping...');
    const hrListRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/okrs',
      headers: { authorization: `Bearer ${hrToken}` },
    });
    const hrListData = await hrListRes.json();
    recordTest(
      'GET /okrs as HR Admin: Unrestricted org-wide listing',
      200,
      hrListRes.status,
      hrListRes.status === 200 && Array.isArray(hrListData.data) && hrListData.data.length >= 8
    );

    const empListRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/okrs',
      headers: { authorization: `Bearer ${empToken}` },
    });
    const empListData = await empListRes.json();
    recordTest(
      'GET /okrs as Employee: Accessible with self/department scoping',
      200,
      empListRes.status,
      empListRes.status === 200 && Array.isArray(empListData.data) && empListData.data.length > 0
    );

    const unauthGet = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/okrs',
    });
    recordTest(
      'GET /okrs without token: Rejected with HTTP 401',
      401,
      unauthGet.status,
      unauthGet.status === 401
    );

    // Step 4: Test Query Filters
    console.log('\n🔍 Step 4: Testing OKR Query Filters...');
    const filterEmpRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/okrs?employeeId=emp-002',
      headers: { authorization: `Bearer ${hrToken}` },
    });
    const filterEmpData = await filterEmpRes.json();
    const allEmpMatch = filterEmpData.data.every((o) => o.employeeId === 'emp-002');
    recordTest(
      'Filter OKRs by employeeId=emp-002',
      true,
      allEmpMatch,
      filterEmpRes.status === 200 && filterEmpData.data.length >= 4 && allEmpMatch
    );

    const filterQuarterRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/okrs?quarter=Q2',
      headers: { authorization: `Bearer ${hrToken}` },
    });
    const filterQuarterData = await filterQuarterRes.json();
    const allQMatch = filterQuarterData.data.every((o) => o.quarter === 'Q2');
    recordTest(
      'Filter OKRs by quarter=Q2',
      true,
      allQMatch,
      filterQuarterRes.status === 200 && allQMatch
    );

    const filterYearRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/okrs?year=2026',
      headers: { authorization: `Bearer ${hrToken}` },
    });
    const filterYearData = await filterYearRes.json();
    const allYearMatch = filterYearData.data.every((o) => o.year === 2026);
    recordTest(
      'Filter OKRs by year=2026',
      true,
      allYearMatch,
      filterYearRes.status === 200 && allYearMatch
    );

    const filterDeptRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/okrs?departmentId=dept-eng',
      headers: { authorization: `Bearer ${hrToken}` },
    });
    const filterDeptData = await filterDeptRes.json();
    const allDeptMatch = filterDeptData.data.every((o) => o.departmentId === 'dept-eng');
    recordTest(
      'Filter OKRs by departmentId=dept-eng',
      true,
      allDeptMatch,
      filterDeptRes.status === 200 && allDeptMatch
    );

    const filterStatusRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/okrs?status=Completed',
      headers: { authorization: `Bearer ${hrToken}` },
    });
    const filterStatusData = await filterStatusRes.json();
    const allStatusMatch = filterStatusData.data.every((o) => o.status === 'Completed');
    recordTest(
      'Filter OKRs by status=Completed',
      true,
      allStatusMatch,
      filterStatusRes.status === 200 && allStatusMatch
    );

    // Step 5: Test Single OKR Lookup
    console.log('\n🎯 Step 5: Testing Single OKR Lookup...');
    const singleOkrRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/okrs/okr-001',
      headers: { authorization: `Bearer ${hrToken}` },
    });
    const singleOkrData = await singleOkrRes.json();
    recordTest(
      'GET /okrs/okr-001: Returns single OKR document',
      'okr-001',
      singleOkrData.data?.id,
      singleOkrRes.status === 200 && singleOkrData.data?.id === 'okr-001'
    );

    const notFoundRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/okrs/okr-nonexistent',
      headers: { authorization: `Bearer ${hrToken}` },
    });
    recordTest(
      'GET /okrs/okr-nonexistent: Returns HTTP 404',
      404,
      notFoundRes.status,
      notFoundRes.status === 404
    );

    // Step 6: Test OKR Creation & Validations
    console.log('\n✍️ Step 6: Testing OKR Creation & Validation Guards...');
    const validCreateRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/okrs',
      headers: { authorization: `Bearer ${mgrToken}` },
      body: {
        employeeId: 'emp-002',
        quarter: 'Q4',
        year: 2026,
        objective: 'Implement Real-Time Review Synthesis Worker Cluster',
        departmentId: 'dept-eng',
        keyResults: [
          {
            title: 'Deploy 20 worker containers handling parallel review syntheses',
            targetValue: 20,
            actualValue: 18,
            unit: 'containers',
          },
          {
            title: 'Maintain zero drop rate on telemetry and audit events',
            targetValue: 100,
            actualValue: 95,
            unit: '% delivery',
          },
        ],
      },
    });
    const createdOkrData = await validCreateRes.json();
    recordTest(
      'POST /okrs as Manager: Creates quarterly OKR (HTTP 201)',
      201,
      validCreateRes.status,
      validCreateRes.status === 201 && Boolean(createdOkrData.data?.id)
    );

    const createdOkrId = createdOkrData.data?.id;
    const dbCreatedOkr = await OKR.findOne({ id: createdOkrId });
    recordTest(
      'Database Verification: Created OKR persisted in MongoDB with calculated progress',
      true,
      Boolean(dbCreatedOkr),
      Boolean(dbCreatedOkr && dbCreatedOkr.overallProgress >= 90 && dbCreatedOkr.status === 'Completed')
    );

    // Validation Guard: Invalid quarter
    const invalidQuarterRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/okrs',
      headers: { authorization: `Bearer ${mgrToken}` },
      body: {
        employeeId: 'emp-002',
        quarter: 'Q5', // Invalid
        year: 2026,
        objective: 'Valid objective with length',
        departmentId: 'dept-eng',
        keyResults: [{ title: 'Valid KR', targetValue: 10, actualValue: 5, unit: 'items' }],
      },
    });
    recordTest(
      'Validation Guard: Invalid quarter rejected (HTTP 400)',
      400,
      invalidQuarterRes.status,
      invalidQuarterRes.status === 400
    );

    // Validation Guard: Target value zero
    const zeroTargetRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/okrs',
      headers: { authorization: `Bearer ${mgrToken}` },
      body: {
        employeeId: 'emp-002',
        quarter: 'Q1',
        year: 2026,
        objective: 'Valid objective title here',
        departmentId: 'dept-eng',
        keyResults: [{ title: 'Zero target', targetValue: 0, actualValue: 0, unit: 'items' }],
      },
    });
    recordTest(
      'Validation Guard: Zero target value rejected (HTTP 400)',
      400,
      zeroTargetRes.status,
      zeroTargetRes.status === 400
    );

    // Validation Guard: Objective too short
    const shortObjRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/okrs',
      headers: { authorization: `Bearer ${mgrToken}` },
      body: {
        employeeId: 'emp-002',
        quarter: 'Q1',
        year: 2026,
        objective: 'Bad',
        departmentId: 'dept-eng',
        keyResults: [{ title: 'Valid KR', targetValue: 10, actualValue: 5, unit: 'items' }],
      },
    });
    recordTest(
      'Validation Guard: Objective < 5 chars rejected (HTTP 400)',
      400,
      shortObjRes.status,
      shortObjRes.status === 400
    );

    // Validation Guard: Empty key results array
    const emptyKrsRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/okrs',
      headers: { authorization: `Bearer ${mgrToken}` },
      body: {
        employeeId: 'emp-002',
        quarter: 'Q1',
        year: 2026,
        objective: 'Valid objective with sufficient length',
        departmentId: 'dept-eng',
        keyResults: [],
      },
    });
    recordTest(
      'Validation Guard: Empty Key Results array rejected (HTTP 400)',
      400,
      emptyKrsRes.status,
      emptyKrsRes.status === 400
    );

    // Validation Guard: Non-existent employee
    const nonExistentEmpRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/okrs',
      headers: { authorization: `Bearer ${mgrToken}` },
      body: {
        employeeId: 'emp-nonexistent',
        quarter: 'Q1',
        year: 2026,
        objective: 'Valid objective with sufficient length',
        departmentId: 'dept-eng',
        keyResults: [{ title: 'Valid KR', targetValue: 10, actualValue: 5, unit: 'items' }],
      },
    });
    recordTest(
      'Validation Guard: Non-existent employee rejected (HTTP 404)',
      404,
      nonExistentEmpRes.status,
      nonExistentEmpRes.status === 404
    );

    // RBAC Guard: Employee creating OKR for another employee
    const unauthorizedCreateRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/okrs',
      headers: { authorization: `Bearer ${empToken}` }, // Rahul emp-002
      body: {
        employeeId: 'emp-006', // Julian Mercer
        quarter: 'Q1',
        year: 2026,
        objective: 'Unauthorized OKR injection attempt',
        departmentId: 'dept-prod',
        keyResults: [{ title: 'Valid KR', targetValue: 10, actualValue: 5, unit: 'items' }],
      },
    });
    recordTest(
      'RBAC Guard: Employee cannot create OKR for another team member (HTTP 403)',
      403,
      unauthorizedCreateRes.status,
      unauthorizedCreateRes.status === 403
    );

    // Step 7: Test Key Result Progress & OKR Updates
    console.log('\n📈 Step 7: Testing Key Result Progress & OKR Updates...');
    // In okr-004 (Rahul Q4), kr-009 has targetValue: 4.5, actualValue: 5.2 (seconds)
    // Update actualValue to 4.2 (better latency -> completion increases)
    const updateKrRes = await dispatch(appInstance, {
      method: 'PATCH',
      url: '/api/v1/okrs/okr-004/key-results/kr-009',
      headers: { authorization: `Bearer ${empToken}` },
      body: { actualValue: 4.2 },
    });
    const updateKrData = await updateKrRes.json();
    recordTest(
      'PATCH /okrs/:id/key-results/:krId as Owner: Updates actual value (HTTP 200)',
      200,
      updateKrRes.status,
      updateKrRes.status === 200 && updateKrData.data?.keyResults.find((k) => k.id === 'kr-009')?.actualValue === 4.2
    );

    const dbUpdatedOkr = await OKR.findOne({ id: 'okr-004' });
    const updatedKr = dbUpdatedOkr?.keyResults.find((k) => k.id === 'kr-009');
    recordTest(
      'Database Verification: Key Result and overall progress recalculated in MongoDB',
      4.2,
      updatedKr?.actualValue,
      Boolean(updatedKr && updatedKr.actualValue === 4.2 && dbUpdatedOkr.overallProgress > 0)
    );

    // Updating non-existent Key Result
    const notFoundKrRes = await dispatch(appInstance, {
      method: 'PATCH',
      url: '/api/v1/okrs/okr-004/key-results/kr-nonexistent',
      headers: { authorization: `Bearer ${empToken}` },
      body: { actualValue: 10 },
    });
    recordTest(
      'PATCH with non-existent Key Result returns HTTP 404',
      404,
      notFoundKrRes.status,
      notFoundKrRes.status === 404
    );

    // Full OKR update by Manager
    const fullUpdateRes = await dispatch(appInstance, {
      method: 'PATCH',
      url: `/api/v1/okrs/${createdOkrId}`,
      headers: { authorization: `Bearer ${mgrToken}` },
      body: { objective: 'Updated: Scale Review Generation Worker Cluster to 50 nodes' },
    });
    const fullUpdateData = await fullUpdateRes.json();
    recordTest(
      'PATCH /okrs/:id as Manager: Updates objective text (HTTP 200)',
      200,
      fullUpdateRes.status,
      fullUpdateRes.status === 200 && fullUpdateData.data?.objective.startsWith('Updated:')
    );

    // RBAC Guard: Employee modifying another employee's OKR
    const unauthorizedUpdateRes = await dispatch(appInstance, {
      method: 'PATCH',
      url: '/api/v1/okrs/okr-006', // Julian Mercer's OKR
      headers: { authorization: `Bearer ${empToken}` }, // Rahul emp-002
      body: { objective: 'Tampered objective' },
    });
    recordTest(
      'RBAC Guard: Employee cannot update another employee OKR (HTTP 403)',
      403,
      unauthorizedUpdateRes.status,
      unauthorizedUpdateRes.status === 403
    );

    // Step 8: Test OKR Deletion & Scoping
    console.log('\n🗑️ Step 8: Testing OKR Deletion & Permissions...');
    // Employee attempting to delete OKR
    const unauthorizedDeleteRes = await dispatch(appInstance, {
      method: 'DELETE',
      url: `/api/v1/okrs/${createdOkrId}`,
      headers: { authorization: `Bearer ${empToken}` },
    });
    recordTest(
      'RBAC Guard: Employee cannot delete OKR (HTTP 403)',
      403,
      unauthorizedDeleteRes.status,
      unauthorizedDeleteRes.status === 403
    );

    // HR Admin deletes the created OKR
    const hrDeleteRes = await dispatch(appInstance, {
      method: 'DELETE',
      url: `/api/v1/okrs/${createdOkrId}`,
      headers: { authorization: `Bearer ${hrToken}` },
    });
    recordTest(
      'DELETE /okrs/:id as HR Admin: Deletes OKR (HTTP 200)',
      200,
      hrDeleteRes.status,
      hrDeleteRes.status === 200
    );

    const dbDeletedOkr = await OKR.findOne({ id: createdOkrId });
    recordTest(
      'Database Verification: Deleted OKR removed from MongoDB',
      null,
      dbDeletedOkr,
      dbDeletedOkr === null
    );

    // Step 9: Test OKR Summary & Aggregation Analytics
    console.log('\n📊 Step 9: Testing OKR Summary Analytics...');
    const summaryRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/okrs/summary/emp-002',
      headers: { authorization: `Bearer ${empToken}` },
    });
    const summaryPayload = await summaryRes.json();
    const summaryData = summaryPayload.data;
    const isSummaryValid =
      summaryRes.status === 200 &&
      summaryData &&
      summaryData.totalOkrs >= 4 &&
      summaryData.averageProgress > 0 &&
      summaryData.quarterProgress.Q1 > 0;
    recordTest(
      'GET /okrs/summary/:employeeId as Self: Computes correct quarterly breakdown (HTTP 200)',
      true,
      isSummaryValid,
      isSummaryValid
    );

    const unauthorizedSummary = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/okrs/summary/emp-006', // Julian
      headers: { authorization: `Bearer ${empToken}` }, // Rahul
    });
    recordTest(
      'RBAC Guard: Employee cannot view another employee OKR summary (HTTP 403)',
      403,
      unauthorizedSummary.status,
      unauthorizedSummary.status === 403
    );

    const hrSummaryRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/okrs/summary/emp-006',
      headers: { authorization: `Bearer ${hrToken}` },
    });
    recordTest(
      'GET /okrs/summary/:employeeId as HR Admin: Unrestricted access (HTTP 200)',
      200,
      hrSummaryRes.status,
      hrSummaryRes.status === 200
    );

    // Summary of Test Suite
    console.log('\n================================================================');
    console.log('📊 MILESTONE 8 QUARTERLY OKR MANAGEMENT TEST SUMMARY');
    console.log('================================================================');
    const passedTests = testResults.filter((t) => t.status === 'PASSED').length;
    const totalTests = testResults.length;
    console.log(`Total Automated Tests: ${totalTests}`);
    console.log(`Passed:                ${passedTests}`);
    console.log(`Failed:                ${totalTests - passedTests}`);
    console.log('================================================================\n');

    if (passedTests === totalTests) {
      console.log('🎉 ALL 30 MILESTONE 8 TESTS PASSED CLEANLY!\n');
    } else {
      console.error('❌ SOME TESTS FAILED! INVESTIGATE PRIOR TO APPROVAL.');
      process.exitCode = 1;
    }
  } catch (error) {
    console.error('💥 Fatal error executing Milestone 8 test suite:', error);
    process.exitCode = 1;
  } finally {
    await disconnectDatabase();
  }
}

void runMilestone8Tests();
