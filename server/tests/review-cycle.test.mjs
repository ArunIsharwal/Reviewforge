/**
 * ReviewForge - Milestone 6 Review Cycle Management Test Suite
 * Verifies ReviewCycle model, live MongoDB persistence, evaluation lifecycle,
 * status transitions (Draft -> Active -> Completed), filtering, auto-eligibility computation,
 * date validation, deletion, and role-based permissions (HR Admin, Manager, Employee, Peer Reviewer).
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
          status: res.statusCode,
          headers: responseHeaders,
          json: async () => ({}),
          text: async () => '',
        });
      }
    });
  });
}

async function runTestSuite() {
  console.log('================================================================');
  console.log('🧪 STARTING REVIEWFORGE MILESTONE 6 REVIEW CYCLE TEST SUITE');
  console.log('================================================================\n');

  try {
    // 1. Database Connection & Seed Models
    console.log('🔗 Step 1: Connecting to MongoDB & Seeding Collections...');
    await connectDatabase();
    appInstance = createApp();

    await Organization.seedDefaultOrganization();
    await User.seedDefaultUsers();
    await Department.seedDefaultDepartments();
    await Employee.seedDefaultEmployees();
    await ReviewCycle.seedDefaultReviewCycles();

    // 2. Direct Database Verifications
    const cycleCount = await ReviewCycle.countDocuments({ organizationId: 'org-reviewforge-default' });
    recordTest(
      'Database Seed: 3 Initial Review Cycles in MongoDB',
      'At least 3 review cycles',
      `${cycleCount} cycles found`,
      cycleCount >= 3
    );

    const activeCycle = await ReviewCycle.findOne({ id: 'cycle-2026-annual' });
    recordTest(
      'Database Seed: Annual 360° Review Cycle exists and is Active',
      'status is Active, eligibleEmployeesCount >= 12',
      `status: ${activeCycle?.status}, eligible: ${activeCycle?.eligibleEmployeesCount}`,
      Boolean(activeCycle && activeCycle.status === 'Active' && activeCycle.eligibleEmployeesCount >= 12)
    );

    // 3. Acquire Role JWT Tokens
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
    const managerToken = await loginRole('elena.rostova@reviewforge.io', 'Manager@ReviewForge2026!');
    const employeeToken = await loginRole('rahul.deshmukh@reviewforge.io', 'Employee@ReviewForge2026!');
    const peerToken = await loginRole('marcus.vance@reviewforge.io', 'Peer@ReviewForge2026!');

    recordTest(
      'Auth Tokens Acquired for HR, Manager, Employee, Peer',
      'All 4 tokens defined',
      hrToken && managerToken && employeeToken && peerToken ? '4 tokens received' : 'Missing token',
      Boolean(hrToken && managerToken && employeeToken && peerToken)
    );

    // 4. Test Review Cycle Directory & Filters
    console.log('\n📅 Step 3: Testing Review Cycle Directory & Filters...');

    // TEST 4: HR Admin lists all review cycles
    const resHrList = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/review-cycles',
      headers: { authorization: `Bearer ${hrToken}` },
    });
    const dataHrList = await resHrList.json();
    recordTest(
      'GET /review-cycles as HR Admin: Lists review cycles',
      'HTTP 200 with data array',
      `HTTP ${resHrList.status}, count: ${dataHrList.count}`,
      resHrList.status === 200 && Array.isArray(dataHrList.data) && dataHrList.count >= 3
    );

    // TEST 5: Employee can view review cycles
    const resEmpList = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/review-cycles',
      headers: { authorization: `Bearer ${employeeToken}` },
    });
    recordTest(
      'GET /review-cycles as Employee: Accessible',
      'HTTP 200 with data array',
      `HTTP ${resEmpList.status}`,
      resEmpList.status === 200
    );

    // TEST 6: Unauthenticated request rejected
    const resUnauth = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/review-cycles',
    });
    recordTest(
      'GET /review-cycles without token: Rejected',
      'HTTP 401 Unauthorized',
      `HTTP ${resUnauth.status}`,
      resUnauth.status === 401
    );

    // TEST 7: Filter by Status (Active)
    const resFilterActive = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/review-cycles?status=Active',
      headers: { authorization: `Bearer ${hrToken}` },
    });
    const dataFilterActive = await resFilterActive.json();
    const allActive = dataFilterActive.data.every((c) => c.status === 'Active');
    recordTest(
      'Filter review cycles by status=Active',
      'Only cycles where status is Active',
      `count: ${dataFilterActive.count}, allActive: ${allActive}`,
      resFilterActive.status === 200 && dataFilterActive.count > 0 && allActive
    );

    // TEST 8: Filter by Period (FY2026)
    const resFilterPeriod = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/review-cycles?period=FY2026',
      headers: { authorization: `Bearer ${hrToken}` },
    });
    const dataFilterPeriod = await resFilterPeriod.json();
    const allFY2026 = dataFilterPeriod.data.every((c) => c.period === 'FY2026');
    recordTest(
      'Filter review cycles by period=FY2026',
      'Only cycles where period is FY2026',
      `count: ${dataFilterPeriod.count}, all matched: ${allFY2026}`,
      resFilterPeriod.status === 200 && dataFilterPeriod.count > 0 && allFY2026
    );

    // TEST 9: Text Search
    const resSearch = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/review-cycles?search=Calibration',
      headers: { authorization: `Bearer ${hrToken}` },
    });
    const dataSearch = await resSearch.json();
    const foundCalibration = dataSearch.data.some((c) => c.title.includes('Calibration'));
    recordTest(
      'Search query: ?search=Calibration matches Mid-Year Calibration Cycle',
      'Returns matching review cycles',
      `count: ${dataSearch.count}, foundCalibration: ${foundCalibration}`,
      resSearch.status === 200 && foundCalibration
    );

    // TEST 10: Single Review Cycle details
    const resSingle = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/review-cycles/cycle-2026-annual',
      headers: { authorization: `Bearer ${hrToken}` },
    });
    const dataSingle = await resSingle.json();
    recordTest(
      'GET /review-cycles/cycle-2026-annual: Returns profile details',
      'HTTP 200 with id cycle-2026-annual',
      `HTTP ${resSingle.status}, title: ${dataSingle.data?.title}`,
      resSingle.status === 200 && dataSingle.data?.id === 'cycle-2026-annual'
    );

    // TEST 11: Non-existent cycle returns 404
    const resNotFound = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/review-cycles/cycle-nonexistent',
      headers: { authorization: `Bearer ${hrToken}` },
    });
    recordTest(
      'GET /review-cycles/cycle-nonexistent returns HTTP 404',
      'HTTP 404 Not Found',
      `HTTP ${resNotFound.status}`,
      resNotFound.status === 404
    );

    // 5. Review Cycle Creation & Validation
    console.log('\n➕ Step 4: Testing Review Cycle Creation & Validation...');

    const newCyclePayload = {
      title: 'FY2026 Q4 Engineering Calibration Cycle',
      period: 'Q4 2026',
      type: 'Quarterly Check-in',
      startDate: '2026-11-01',
      endDate: '2026-12-15',
      status: 'Draft',
      description: 'End-of-year engineering calibration and peer feedback cycle.',
    };

    // Clean up if already exists
    await ReviewCycle.deleteOne({ title: newCyclePayload.title });

    // TEST 12: HR Admin creates review cycle
    const resCreate = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/review-cycles',
      headers: { authorization: `Bearer ${hrToken}` },
      body: newCyclePayload,
    });
    const dataCreate = await resCreate.json();
    recordTest(
      'POST /review-cycles as HR Admin: Creates cycle with auto-calculated eligible count',
      'HTTP 201 with generated id and eligibleEmployeesCount >= 12',
      `HTTP ${resCreate.status}, id: ${dataCreate.data?.id}, eligible: ${dataCreate.data?.eligibleEmployeesCount}`,
      resCreate.status === 201 && dataCreate.data?.eligibleEmployeesCount >= 12
    );

    const createdCycleId = dataCreate.data?.id;

    // TEST 13: Direct MongoDB Verification of Created Cycle
    const dbCycle = await ReviewCycle.findOne({ id: createdCycleId });
    recordTest(
      'Database Verification: Review cycle persisted in MongoDB',
      'Found document in MongoDB with status Draft',
      dbCycle ? `Found: ${dbCycle.title} (${dbCycle.status})` : 'Not found',
      Boolean(dbCycle && dbCycle.status === 'Draft' && dbCycle.period === 'Q4 2026')
    );

    // TEST 14: Validation Guard: End date cannot precede start date
    const resInvalidDates = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/review-cycles',
      headers: { authorization: `Bearer ${hrToken}` },
      body: {
        title: 'Invalid Date Cycle',
        period: 'FY2026',
        type: 'Annual 360°',
        startDate: '2026-12-01',
        endDate: '2026-11-01', // Precedes start date!
      },
    });
    recordTest(
      'Validation Guard: End date before start date rejected',
      'HTTP 400 Validation Error',
      `HTTP ${resInvalidDates.status}`,
      resInvalidDates.status === 400
    );

    // TEST 15: Validation Guard: Incomplete payload
    const resIncomplete = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/review-cycles',
      headers: { authorization: `Bearer ${hrToken}` },
      body: { title: 'No' }, // missing period, dates, type
    });
    recordTest(
      'Validation Guard: Incomplete payload rejected',
      'HTTP 400 Validation Error',
      `HTTP ${resIncomplete.status}`,
      resIncomplete.status === 400
    );

    // TEST 16: Duplicate Cycle ID Conflict
    const resDupId = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/review-cycles',
      headers: { authorization: `Bearer ${hrToken}` },
      body: {
        id: createdCycleId,
        title: 'Collision Cycle',
        period: 'FY2026',
        type: 'Annual 360°',
        startDate: '2026-11-01',
        endDate: '2026-12-01',
      },
    });
    recordTest(
      'Conflict Guard: Duplicate cycle ID rejected',
      'HTTP 409 Conflict',
      `HTTP ${resDupId.status}`,
      resDupId.status === 409
    );

    // TEST 17: Employee role CANNOT create review cycle (403 Forbidden)
    const resEmpCreate = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/review-cycles',
      headers: { authorization: `Bearer ${employeeToken}` },
      body: newCyclePayload,
    });
    recordTest(
      'RBAC: Employee role cannot create review cycle',
      'HTTP 403 Forbidden',
      `HTTP ${resEmpCreate.status}`,
      resEmpCreate.status === 403
    );

    // TEST 18: Manager role CANNOT create review cycle (403 Forbidden)
    const resMgrCreate = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/review-cycles',
      headers: { authorization: `Bearer ${managerToken}` },
      body: newCyclePayload,
    });
    recordTest(
      'RBAC: Manager role cannot create review cycle',
      'HTTP 403 Forbidden',
      `HTTP ${resMgrCreate.status}`,
      resMgrCreate.status === 403
    );

    // TEST 19: Peer Reviewer CANNOT create review cycle (403 Forbidden)
    const resPeerCreate = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/review-cycles',
      headers: { authorization: `Bearer ${peerToken}` },
      body: newCyclePayload,
    });
    recordTest(
      'RBAC: Peer Reviewer role cannot create review cycle',
      'HTTP 403 Forbidden',
      `HTTP ${resPeerCreate.status}`,
      resPeerCreate.status === 403
    );

    // 6. Review Cycle Updates & Status Transitions
    console.log('\n🔄 Step 5: Testing Status Transitions & Updates...');

    // TEST 20: HR Admin transitions Draft -> Active
    const resActivate = await dispatch(appInstance, {
      method: 'PATCH',
      url: `/api/v1/review-cycles/${createdCycleId}`,
      headers: { authorization: `Bearer ${hrToken}` },
      body: { status: 'Active' },
    });
    const dataActivate = await resActivate.json();
    recordTest(
      'Status Transition: Draft -> Active as HR Admin',
      'HTTP 200 with status: Active',
      `HTTP ${resActivate.status}, status: ${dataActivate.data?.status}`,
      resActivate.status === 200 && dataActivate.data?.status === 'Active'
    );

    // TEST 21: Direct MongoDB Verification of Active Status
    const dbActive = await ReviewCycle.findOne({ id: createdCycleId });
    recordTest(
      'Database Verification: Active status persisted in MongoDB',
      'status in MongoDB is Active',
      `status: ${dbActive?.status}`,
      dbActive?.status === 'Active'
    );

    // TEST 22: HR Admin transitions Active -> Completed
    const resComplete = await dispatch(appInstance, {
      method: 'PATCH',
      url: `/api/v1/review-cycles/${createdCycleId}`,
      headers: { authorization: `Bearer ${hrToken}` },
      body: { status: 'Completed', completedReviewsCount: 12 },
    });
    const dataComplete = await resComplete.json();
    recordTest(
      'Status Transition: Active -> Completed as HR Admin',
      'HTTP 200 with status: Completed and completedReviewsCount: 12',
      `HTTP ${resComplete.status}, status: ${dataComplete.data?.status}, completed: ${dataComplete.data?.completedReviewsCount}`,
      resComplete.status === 200 &&
        dataComplete.data?.status === 'Completed' &&
        dataComplete.data?.completedReviewsCount === 12
    );

    // TEST 23: Direct MongoDB Verification of Completed Status
    const dbCompleted = await ReviewCycle.findOne({ id: createdCycleId });
    recordTest(
      'Database Verification: Completed status persisted in MongoDB',
      'status in MongoDB is Completed',
      `status: ${dbCompleted?.status}, completed: ${dbCompleted?.completedReviewsCount}`,
      dbCompleted?.status === 'Completed' && dbCompleted?.completedReviewsCount === 12
    );

    // TEST 24: Invalid date update rejected
    const resBadDateUpdate = await dispatch(appInstance, {
      method: 'PATCH',
      url: `/api/v1/review-cycles/${createdCycleId}`,
      headers: { authorization: `Bearer ${hrToken}` },
      body: { startDate: '2027-01-01', endDate: '2026-01-01' },
    });
    recordTest(
      'Validation Guard: Invalid date update rejected',
      'HTTP 400 Validation Error',
      `HTTP ${resBadDateUpdate.status}`,
      resBadDateUpdate.status === 400
    );

    // TEST 25: Non-HR role CANNOT update review cycle
    const resEmpUpdate = await dispatch(appInstance, {
      method: 'PATCH',
      url: `/api/v1/review-cycles/${createdCycleId}`,
      headers: { authorization: `Bearer ${employeeToken}` },
      body: { title: 'Hacked Title' },
    });
    recordTest(
      'RBAC: Non-HR role cannot update review cycle',
      'HTTP 403 Forbidden',
      `HTTP ${resEmpUpdate.status}`,
      resEmpUpdate.status === 403
    );

    // 7. Review Cycle Deletion
    console.log('\n🗑️ Step 6: Testing Review Cycle Deletion & RBAC...');

    // TEST 26: Non-HR role CANNOT delete review cycle
    const resEmpDelete = await dispatch(appInstance, {
      method: 'DELETE',
      url: `/api/v1/review-cycles/${createdCycleId}`,
      headers: { authorization: `Bearer ${employeeToken}` },
    });
    recordTest(
      'RBAC: Non-HR role cannot delete review cycle',
      'HTTP 403 Forbidden',
      `HTTP ${resEmpDelete.status}`,
      resEmpDelete.status === 403
    );

    // TEST 27: HR Admin deletes review cycle
    const resDelete = await dispatch(appInstance, {
      method: 'DELETE',
      url: `/api/v1/review-cycles/${createdCycleId}`,
      headers: { authorization: `Bearer ${hrToken}` },
    });
    recordTest(
      'DELETE /review-cycles/:id as HR Admin: Deletes cycle',
      'HTTP 200 with success message',
      `HTTP ${resDelete.status}`,
      resDelete.status === 200
    );

    // TEST 28: Direct MongoDB Verification of Deletion
    const dbDeleted = await ReviewCycle.findOne({ id: createdCycleId });
    recordTest(
      'Database Verification: Deleted cycle removed from MongoDB',
      'Document should not exist in MongoDB',
      dbDeleted ? 'Still exists' : 'Null (Removed)',
      dbDeleted === null
    );

    // Print Summary
    console.log('\n================================================================');
    console.log('📊 MILESTONE 6 REVIEW CYCLE TEST EXECUTION SUMMARY');
    console.log('================================================================');
    const passedCount = testResults.filter((t) => t.status === 'PASSED').length;
    const failedCount = testResults.filter((t) => t.status === 'FAILED').length;
    console.log(`Total Automated Tests: ${testResults.length}`);
    console.log(`Passed:                ${passedCount}`);
    console.log(`Failed:                ${failedCount}`);
    console.log('================================================================\n');

    if (failedCount > 0) {
      console.error(`💥 ${failedCount} tests failed!`);
      process.exitCode = 1;
    } else {
      console.log('🎉 ALL 28 MILESTONE 6 TESTS PASSED CLEANLY!\n');
    }
  } catch (error) {
    console.error('Fatal test error:', error);
    process.exitCode = 1;
  } finally {
    await disconnectDatabase();
  }
}

runTestSuite();
