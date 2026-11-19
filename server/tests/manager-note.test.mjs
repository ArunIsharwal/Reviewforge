/**
 * ReviewForge - Milestone 9: Manager Notes & Qualitative Assessments Test Suite
 * Validates ManagerNote model, live MongoDB persistence,
 * strict role-based confidentiality (403 Forbidden to employees/peer reviewers),
 * manager hierarchy scoping, full CRUD operations, validation guards,
 * search and category filtering, and aggregation analytics summary.
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
import { ManagerNote, seedInitialManagerNotes } from '../dist/models/ManagerNote.js';

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

async function runMilestone9Tests() {
  console.log('\n================================================================');
  console.log('   MILESTONE 9: MANAGER NOTES & QUALITATIVE ASSESSMENTS TESTS');
  console.log('================================================================\n');

  try {
    // Step 1: Connect to Database & Seed Collections
    console.log('🔗 Step 1: Connecting to MongoDB & Seeding Collections...');
    await connectDatabase();
    appInstance = createApp();

    await Organization.seedDefaultOrganization();
    await User.seedDefaultUsers();
    await Department.seedDefaultDepartments();
    await Employee.seedDefaultEmployees();
    await ReviewCycle.seedDefaultReviewCycles();
    await seedInitialManagerNotes();

    const initialNotesCount = await ManagerNote.countDocuments({
      organizationId: 'org-reviewforge-default',
    });
    recordTest(
      'Database Seed: Initial Manager Notes in MongoDB',
      'count >= 5',
      `count = ${initialNotesCount}`,
      initialNotesCount >= 5
    );

    const note1 = await ManagerNote.findOne({ id: 'note-001' });
    recordTest(
      'Database Seed: note-001 exists with isPrivateToManagers: true',
      'note-001 found with isPrivateToManagers: true',
      note1 ? `found (private=${note1.isPrivateToManagers})` : 'Not found',
      Boolean(note1 && note1.isPrivateToManagers === true)
    );

    // Step 2: Login Role Accounts
    console.log('\n🔑 Step 2: Authenticating test accounts to acquire role JWTs...');
    const loginRole = async (email, password) => {
      const res = await dispatch(appInstance, {
        method: 'POST',
        url: '/api/v1/auth/login',
        body: { email, password },
      });
      const data = await res.json();
      return data.accessToken;
    };

    const adminToken = await loginRole('admin@reviewforge.io', 'Admin@ReviewForge2026!');
    const managerToken = await loginRole('elena.rostova@reviewforge.io', 'Manager@ReviewForge2026!');
    const employeeToken = await loginRole('rahul.deshmukh@reviewforge.io', 'Employee@ReviewForge2026!');
    const peerToken = await loginRole('marcus.vance@reviewforge.io', 'Peer@ReviewForge2026!');

    recordTest('Auth: HR Admin JWT Acquired', 'string token', typeof adminToken === 'string' ? 'string token' : 'failed', Boolean(adminToken));
    recordTest('Auth: Manager JWT Acquired', 'string token', typeof managerToken === 'string' ? 'string token' : 'failed', Boolean(managerToken));
    recordTest('Auth: Employee JWT Acquired', 'string token', typeof employeeToken === 'string' ? 'string token' : 'failed', Boolean(employeeToken));
    recordTest('Auth: Peer Reviewer JWT Acquired', 'string token', typeof peerToken === 'string' ? 'string token' : 'failed', Boolean(peerToken));

    // Step 3: Strict Role-Based Privacy & Confidentiality Gates (Employee & Peer Rejected)
    console.log('\n🔒 Step 3: Testing strict role confidentiality (employee / peer access rejection)...');

    // Unauthenticated GET
    const unauthRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/manager-notes',
    });
    recordTest(
      'Privacy Gate: Unauthenticated access rejected with 401',
      'HTTP 401',
      `HTTP ${unauthRes.status}`,
      unauthRes.status === 401
    );

    // Employee GET /api/v1/manager-notes
    const empGetRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/manager-notes',
      headers: { Authorization: `Bearer ${employeeToken}` },
    });
    recordTest(
      'Privacy Gate: Employee cannot view manager notes directory (HTTP 403 Forbidden)',
      'HTTP 403',
      `HTTP ${empGetRes.status}`,
      empGetRes.status === 403
    );

    // Employee POST /api/v1/manager-notes
    const empPostRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/manager-notes',
      headers: { Authorization: `Bearer ${employeeToken}` },
      body: {
        employeeId: 'emp-003',
        title: 'Unauthorized Note Attempt',
        category: 'Achievement',
        description: 'Should never succeed from employee token',
      },
    });
    recordTest(
      'Privacy Gate: Employee cannot create manager note (HTTP 403 Forbidden)',
      'HTTP 403',
      `HTTP ${empPostRes.status}`,
      empPostRes.status === 403
    );

    // Employee GET single note
    const empGetSingleRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/manager-notes/note-001',
      headers: { Authorization: `Bearer ${employeeToken}` },
    });
    recordTest(
      'Privacy Gate: Employee cannot retrieve single manager note by ID (HTTP 403 Forbidden)',
      'HTTP 403',
      `HTTP ${empGetSingleRes.status}`,
      empGetSingleRes.status === 403
    );

    // Employee PUT note
    const empPutRes = await dispatch(appInstance, {
      method: 'PUT',
      url: '/api/v1/manager-notes/note-001',
      headers: { Authorization: `Bearer ${employeeToken}` },
      body: { title: 'Tampered note title' },
    });
    recordTest(
      'Privacy Gate: Employee cannot update manager note (HTTP 403 Forbidden)',
      'HTTP 403',
      `HTTP ${empPutRes.status}`,
      empPutRes.status === 403
    );

    // Employee DELETE note
    const empDelRes = await dispatch(appInstance, {
      method: 'DELETE',
      url: '/api/v1/manager-notes/note-001',
      headers: { Authorization: `Bearer ${employeeToken}` },
    });
    recordTest(
      'Privacy Gate: Employee cannot delete manager note (HTTP 403 Forbidden)',
      'HTTP 403',
      `HTTP ${empDelRes.status}`,
      empDelRes.status === 403
    );

    // Employee GET summary
    const empSummaryRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/manager-notes/summary/emp-002',
      headers: { Authorization: `Bearer ${employeeToken}` },
    });
    recordTest(
      'Privacy Gate: Employee cannot view manager notes summary (HTTP 403 Forbidden)',
      'HTTP 403',
      `HTTP ${empSummaryRes.status}`,
      empSummaryRes.status === 403
    );

    // Peer Reviewer GET /api/v1/manager-notes
    const peerGetRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/manager-notes',
      headers: { Authorization: `Bearer ${peerToken}` },
    });
    recordTest(
      'Privacy Gate: Peer Reviewer cannot access manager notes (HTTP 403 Forbidden)',
      'HTTP 403',
      `HTTP ${peerGetRes.status}`,
      peerGetRes.status === 403
    );

    // Step 4: HR Administrator Directory Access & Filtering
    console.log('\n📋 Step 4: Testing HR Administrator directory access & filters...');
    const adminNotesRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/manager-notes',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const adminNotesData = await adminNotesRes.json();
    recordTest(
      'HR Admin: List all manager notes succeeds (HTTP 200)',
      'HTTP 200 with data array',
      `HTTP ${adminNotesRes.status} (count=${adminNotesData.count})`,
      adminNotesRes.status === 200 && Array.isArray(adminNotesData.data) && adminNotesData.count >= 5
    );

    // Filter by category: Achievement
    const filterCatRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/manager-notes?category=Achievement',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const filterCatData = await filterCatRes.json();
    const allAchievements = filterCatData.data.every((n) => n.category === 'Achievement');
    recordTest(
      'Filter: Query by category=Achievement returns only Achievement notes',
      'All notes have category=Achievement',
      `Found ${filterCatData.data.length} notes (all match=${allAchievements})`,
      filterCatRes.status === 200 && filterCatData.data.length > 0 && allAchievements
    );

    // Filter by employeeId: emp-002 (Rahul Deshmukh)
    const filterEmpRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/manager-notes?employeeId=emp-002',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const filterEmpData = await filterEmpRes.json();
    const allEmp2 = filterEmpData.data.every((n) => n.employeeId === 'emp-002');
    recordTest(
      'Filter: Query by employeeId=emp-002 returns Rahul Deshmukh notes',
      'All notes have employeeId=emp-002',
      `Found ${filterEmpData.data.length} notes (all match=${allEmp2})`,
      filterEmpRes.status === 200 && filterEmpData.data.length >= 3 && allEmp2
    );

    // Search by title keyword
    const searchRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/manager-notes?search=Incident+Handling',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const searchData = await searchRes.json();
    recordTest(
      'Search: Query for "Incident Handling" finds note-001',
      'Found note-001',
      `Found ${searchData.data.length} note(s)`,
      searchRes.status === 200 && searchData.data.some((n) => n.id === 'note-001')
    );

    // Search by description keyword
    const searchDescRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/manager-notes?search=AWS+AZ',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const searchDescData = await searchDescRes.json();
    recordTest(
      'Search: Query description for "AWS AZ" finds note-001',
      'Found note-001',
      `Found ${searchDescData.data.length} note(s)`,
      searchDescRes.status === 200 && searchDescData.data.some((n) => n.id === 'note-001')
    );

    // Step 5: Single Note Retrieval & Not Found Guards
    console.log('\n🔍 Step 5: Testing single note retrieval...');
    const singleNoteRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/manager-notes/note-001',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const singleNoteData = await singleNoteRes.json();
    recordTest(
      'GET Note by ID: note-001 retrieved successfully',
      'HTTP 200 with matching note data',
      `HTTP ${singleNoteRes.status} (title="${singleNoteData.data?.title}")`,
      singleNoteRes.status === 200 && singleNoteData.data?.id === 'note-001'
    );

    const notFoundRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/manager-notes/note-non-existent-999',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    recordTest(
      'GET Note by ID: Non-existent ID returns HTTP 404',
      'HTTP 404',
      `HTTP ${notFoundRes.status}`,
      notFoundRes.status === 404
    );

    // Step 6: Manager Scoping & Hierarchy Authorization
    console.log('\n👥 Step 6: Testing manager hierarchy scoping...');
    // Elena Rostova (emp-001) manages Rahul Deshmukh (emp-002)
    const mgrNotesRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/manager-notes?employeeId=emp-002',
      headers: { Authorization: `Bearer ${managerToken}` },
    });
    const mgrNotesData = await mgrNotesRes.json();
    recordTest(
      'Manager Hierarchy: Manager can view notes for direct report (emp-002)',
      'HTTP 200 with direct report notes',
      `HTTP ${mgrNotesRes.status} (count=${mgrNotesData.count})`,
      mgrNotesRes.status === 200 && mgrNotesData.count >= 3
    );

    // Manager attempting to query notes for an employee who is not their direct report and whom they did not author notes for
    // emp-006 (Julian Mercer) reports to Sofia Al-Mansoor (emp-007)
    const mgrUnauthEmpRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/manager-notes?employeeId=emp-006',
      headers: { Authorization: `Bearer ${managerToken}` },
    });
    recordTest(
      'Manager Hierarchy: Manager cannot query notes for unmanaged employee (HTTP 403 Forbidden)',
      'HTTP 403',
      `HTTP ${mgrUnauthEmpRes.status}`,
      mgrUnauthEmpRes.status === 403
    );

    // Step 7: Validation Guards on Create
    console.log('\n🛡️ Step 7: Testing validation guards on note creation...');

    // Missing employeeId
    const missingEmpRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/manager-notes',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        title: 'Valid Title Here',
        category: 'Achievement',
        description: 'Valid long description for testing validation rules.',
      },
    });
    recordTest(
      'Validation Guard: Reject note with missing employeeId',
      'HTTP 400',
      `HTTP ${missingEmpRes.status}`,
      missingEmpRes.status === 400
    );

    // Non-existent employeeId
    const badEmpRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/manager-notes',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        employeeId: 'emp-does-not-exist-888',
        title: 'Valid Title Here',
        category: 'Achievement',
        description: 'Valid long description for testing validation rules.',
      },
    });
    recordTest(
      'Validation Guard: Reject note with non-existent employeeId',
      'HTTP 404',
      `HTTP ${badEmpRes.status}`,
      badEmpRes.status === 404
    );

    // Missing title
    const missingTitleRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/manager-notes',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        employeeId: 'emp-002',
        title: '  ',
        category: 'Achievement',
        description: 'Valid long description for testing validation rules.',
      },
    });
    recordTest(
      'Validation Guard: Reject note with blank title',
      'HTTP 400',
      `HTTP ${missingTitleRes.status}`,
      missingTitleRes.status === 400
    );

    // Title too short (< 3 chars)
    const shortTitleRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/manager-notes',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        employeeId: 'emp-002',
        title: 'AB',
        category: 'Achievement',
        description: 'Valid long description for testing validation rules.',
      },
    });
    recordTest(
      'Validation Guard: Reject note with short title (< 3 chars)',
      'HTTP 400',
      `HTTP ${shortTitleRes.status}`,
      shortTitleRes.status === 400
    );

    // Invalid category
    const badCatRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/manager-notes',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        employeeId: 'emp-002',
        title: 'Valid Title Here',
        category: 'InvalidCategoryXYZ',
        description: 'Valid long description for testing validation rules.',
      },
    });
    recordTest(
      'Validation Guard: Reject note with invalid category',
      'HTTP 400',
      `HTTP ${badCatRes.status}`,
      badCatRes.status === 400
    );

    // Short description (< 10 chars)
    const shortDescRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/manager-notes',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        employeeId: 'emp-002',
        title: 'Valid Title Here',
        category: 'Achievement',
        description: 'Too short',
      },
    });
    recordTest(
      'Validation Guard: Reject note with short description (< 10 chars)',
      'HTTP 400',
      `HTTP ${shortDescRes.status}`,
      shortDescRes.status === 400
    );

    // Manager creating note for self
    const selfNoteRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/manager-notes',
      headers: { Authorization: `Bearer ${managerToken}` },
      body: {
        employeeId: 'emp-001', // Elena's own employee ID
        title: 'Self-praise note',
        category: 'Achievement',
        description: 'Self-authored manager note on self should be blocked.',
      },
    });
    recordTest(
      'Validation Guard: Manager cannot create manager note for self (HTTP 400)',
      'HTTP 400',
      `HTTP ${selfNoteRes.status}`,
      selfNoteRes.status === 400
    );

    // Manager creating note for unmanaged employee
    const unmanagedCreateRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/manager-notes',
      headers: { Authorization: `Bearer ${managerToken}` },
      body: {
        employeeId: 'emp-006', // reports to emp-007, not emp-001
        title: 'Observation for unmanaged person',
        category: 'Collaboration',
        description: 'Observation for someone who does not report to manager.',
      },
    });
    recordTest(
      'Hierarchy Guard: Manager cannot create note for non-direct report (HTTP 403)',
      'HTTP 403',
      `HTTP ${unmanagedCreateRes.status}`,
      unmanagedCreateRes.status === 403
    );

    // Step 8: Create Valid Manager Note & Verify MongoDB Persistence
    console.log('\n✍️ Step 8: Creating valid manager notes and verifying DB persistence...');
    const validCreateRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/manager-notes',
      headers: { Authorization: `Bearer ${managerToken}` },
      body: {
        employeeId: 'emp-002', // Direct report of emp-001
        title: 'Q3 Architectural RFC on Multi-Region Replication',
        category: 'Leadership',
        description:
          'Rahul authored an exceptionally detailed RFC outlining deterministic read-after-write consistency across regions. Reviewed and approved by VP.',
        relatedProject: 'Multi-Region Replication Initiative',
        evidenceRef: 'RFC #104 (Approved by Arch Review Board)',
      },
    });
    const validCreateData = await validCreateRes.json();
    const createdNoteId = validCreateData.data?.id;
    recordTest(
      'Manager Note Creation: Manager creates valid note for direct report (HTTP 201)',
      'HTTP 201 with created note',
      `HTTP ${validCreateRes.status} (id=${createdNoteId})`,
      validCreateRes.status === 201 && Boolean(createdNoteId)
    );

    // Verify in MongoDB
    const dbNote = await ManagerNote.findOne({ id: createdNoteId });
    recordTest(
      'MongoDB Persistence: Created note verified directly in MongoDB',
      'Document exists with isPrivateToManagers: true',
      dbNote ? `Found in MongoDB (private=${dbNote.isPrivateToManagers})` : 'Not found',
      Boolean(dbNote && dbNote.title.includes('Multi-Region') && dbNote.isPrivateToManagers === true)
    );

    // Step 9: Update Note Operations
    console.log('\n📝 Step 9: Testing manager note update operations...');
    const updateRes = await dispatch(appInstance, {
      method: 'PUT',
      url: `/api/v1/manager-notes/${createdNoteId}`,
      headers: { Authorization: `Bearer ${managerToken}` },
      body: {
        title: 'Updated: Q3 Architectural RFC on Multi-Region Replication (Final)',
        category: 'Problem Solving',
        description:
          'Updated observation: RFC was formally accepted with commendations from executive engineering leadership.',
      },
    });
    const updateData = await updateRes.json();
    recordTest(
      'Update Note: Author manager updates note successfully (HTTP 200)',
      'HTTP 200 with updated fields',
      `HTTP ${updateRes.status} (category=${updateData.data?.category})`,
      updateRes.status === 200 && updateData.data?.category === 'Problem Solving'
    );

    // Update validation: short description
    const badUpdateRes = await dispatch(appInstance, {
      method: 'PUT',
      url: `/api/v1/manager-notes/${createdNoteId}`,
      headers: { Authorization: `Bearer ${managerToken}` },
      body: { description: 'Short' },
    });
    recordTest(
      'Update Validation: Reject update with short description',
      'HTTP 400',
      `HTTP ${badUpdateRes.status}`,
      badUpdateRes.status === 400
    );

    // HR Admin can update any note
    const adminUpdateRes = await dispatch(appInstance, {
      method: 'PUT',
      url: `/api/v1/manager-notes/${createdNoteId}`,
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { relatedProject: 'Global Infrastructure 2026' },
    });
    const adminUpdateData = await adminUpdateRes.json();
    recordTest(
      'HR Admin Update: HR Admin can update any manager note',
      'HTTP 200',
      `HTTP ${adminUpdateRes.status} (project=${adminUpdateData.data?.relatedProject})`,
      adminUpdateRes.status === 200 && adminUpdateData.data?.relatedProject === 'Global Infrastructure 2026'
    );

    // Step 10: Delete Note Operations & DB Deletion Verification
    console.log('\n🗑️ Step 10: Testing manager note deletion...');
    const deleteRes = await dispatch(appInstance, {
      method: 'DELETE',
      url: `/api/v1/manager-notes/${createdNoteId}`,
      headers: { Authorization: `Bearer ${managerToken}` },
    });
    recordTest(
      'Delete Note: Author deletes manager note successfully (HTTP 200)',
      'HTTP 200',
      `HTTP ${deleteRes.status}`,
      deleteRes.status === 200
    );

    // Verify deletion in MongoDB
    const checkDeleted = await ManagerNote.findOne({ id: createdNoteId });
    recordTest(
      'MongoDB Verification: Deleted note is removed from database',
      'null / not found',
      checkDeleted ? 'Still exists' : 'null (properly deleted)',
      checkDeleted === null
    );

    // Fetch deleted note returns 404
    const getDeletedRes = await dispatch(appInstance, {
      method: 'GET',
      url: `/api/v1/manager-notes/${createdNoteId}`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    recordTest(
      'Get Deleted Note: Returns HTTP 404',
      'HTTP 404',
      `HTTP ${getDeletedRes.status}`,
      getDeletedRes.status === 404
    );

    // Step 11: Summary Aggregation Analytics Endpoint
    console.log('\n📊 Step 11: Testing manager notes summary endpoint...');
    const summaryRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/manager-notes/summary/emp-002',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const summaryData = await summaryRes.json();
    const hasDist = Boolean(summaryData.data?.categoryDistribution);
    recordTest(
      'Summary Analytics: GET /summary/emp-002 returns structured metrics',
      'HTTP 200 with totalNotes & categoryDistribution',
      `HTTP ${summaryRes.status} (total=${summaryData.data?.totalNotes}, latest=${summaryData.data?.latestNoteDate})`,
      summaryRes.status === 200 && summaryData.data?.totalNotes >= 3 && hasDist
    );

    recordTest(
      'Summary Analytics: Evidence and project counts properly calculated',
      'evidenceLinkedCount >= 1',
      `evidenceCount = ${summaryData.data?.evidenceLinkedCount}`,
      summaryData.data?.evidenceLinkedCount >= 1
    );

  } catch (error) {
    console.error('💥 Test suite execution error:', error);
    recordTest('Milestone 9 Suite Execution', 'Clean execution without exception', error.message, false);
  } finally {
    await disconnectDatabase();
  }

  // Summary
  console.log('\n================================================================');
  console.log('             MILESTONE 9 TEST EXECUTION SUMMARY');
  console.log('================================================================');
  const total = testResults.length;
  const passed = testResults.filter((r) => r.status === 'PASSED').length;
  const failed = total - passed;
  console.log(`Total Tests Run:  ${total}`);
  console.log(`Tests Passed:     ${passed}`);
  console.log(`Tests Failed:     ${failed}`);
  console.log('================================================================\n');

  if (failed > 0) {
    console.error(`❌ ${failed} test(s) failed in Milestone 9 test suite.`);
    process.exit(1);
  } else {
    console.log(`🎉 All ${passed} tests passed with zero failures! Milestone 9 verified.`);
    process.exit(0);
  }
}

runMilestone9Tests();
