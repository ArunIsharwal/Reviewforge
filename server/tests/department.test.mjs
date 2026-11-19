/**
 * ReviewForge - Milestone 5 Organization & Department Management Test Suite
 * Verifies Department & Organization models, live MongoDB persistence,
 * CRUD operations, aggregated stats, deletion safeguards, cascading updates,
 * and role-based permissions (HR Admin, Manager, Employee, Peer Reviewer).
 */

import mongoose from 'mongoose';
import { EventEmitter } from 'events';
import { createApp } from '../dist/app.js';
import { connectDatabase, disconnectDatabase } from '../dist/config/database.js';
import { User } from '../dist/models/User.js';
import { Employee } from '../dist/models/Employee.js';
import { Department } from '../dist/models/Department.js';
import { Organization } from '../dist/models/Organization.js';

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
  console.log('🧪 STARTING REVIEWFORGE MILESTONE 5 DEPARTMENT & ORG TEST SUITE');
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

    // 2. Direct Database Verifications
    const org = await Organization.findOne({ id: 'org-reviewforge-default' });
    recordTest(
      'Database Seed: Default Organization exists in MongoDB',
      'Organization found with ratingScale and anonymityPolicy',
      org ? `Found: ${org.name} (${org.id})` : 'Not found',
      Boolean(org && org.settings?.ratingScale)
    );

    const deptCount = await Department.countDocuments({ organizationId: 'org-reviewforge-default' });
    recordTest(
      'Database Seed: 3 Initial Departments in MongoDB',
      'At least 3 departments',
      `${deptCount} departments found`,
      deptCount >= 3
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

    // 4. Test Department Directory & Aggregated Stats
    console.log('\n🏢 Step 3: Testing Department Directory & Statistics...');

    // TEST 4: HR Admin lists departments
    const resHrList = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/departments',
      headers: { authorization: `Bearer ${hrToken}` },
    });
    const dataHrList = await resHrList.json();
    recordTest(
      'GET /departments as HR Admin: Lists all departments',
      'HTTP 200 with data array and live calculated employeeCount',
      `HTTP ${resHrList.status}, count: ${dataHrList.count}`,
      resHrList.status === 200 && Array.isArray(dataHrList.data) && dataHrList.count >= 3
    );

    // TEST 5: Verify live employee counts computed from Employee collection
    const engDept = dataHrList.data.find((d) => d.id === 'dept-eng');
    const actualEngEmployees = await Employee.countDocuments({
      organizationId: 'org-reviewforge-default',
      departmentId: 'dept-eng',
      isDeactivated: { $ne: true },
    });
    recordTest(
      'Aggregated Stats: Department employeeCount matches Employee collection',
      `dept-eng employeeCount should equal ${actualEngEmployees}`,
      `Returned: ${engDept?.employeeCount}, actual in DB: ${actualEngEmployees}`,
      engDept?.employeeCount === actualEngEmployees
    );

    // TEST 6: Regular Employee can view departments
    const resEmpList = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/departments',
      headers: { authorization: `Bearer ${employeeToken}` },
    });
    recordTest(
      'GET /departments as Employee: Accessible',
      'HTTP 200 with data array',
      `HTTP ${resEmpList.status}`,
      resEmpList.status === 200
    );

    // TEST 7: Unauthenticated request rejected
    const resUnauth = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/departments',
    });
    recordTest(
      'GET /departments without token: Rejected',
      'HTTP 401 Unauthorized',
      `HTTP ${resUnauth.status}`,
      resUnauth.status === 401
    );

    // TEST 8: Single Department details with members list
    const resSingle = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/departments/dept-eng',
      headers: { authorization: `Bearer ${hrToken}` },
    });
    const dataSingle = await resSingle.json();
    recordTest(
      'GET /departments/dept-eng: Returns department and members array',
      'HTTP 200 with members array populated',
      `HTTP ${resSingle.status}, members count: ${dataSingle.data?.members?.length}`,
      resSingle.status === 200 && Array.isArray(dataSingle.data?.members) && dataSingle.data?.members.length > 0
    );

    // TEST 9: Non-existent department returns 404
    const resNotFound = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/departments/dept-nonexistent',
      headers: { authorization: `Bearer ${hrToken}` },
    });
    recordTest(
      'GET /departments/dept-nonexistent returns HTTP 404',
      'HTTP 404 Not Found',
      `HTTP ${resNotFound.status}`,
      resNotFound.status === 404
    );

    // 5. Department Creation & RBAC
    console.log('\n➕ Step 4: Testing Department Creation & Validation...');

    const newDeptPayload = {
      name: 'Information Security & Trust',
      code: 'SEC',
      headEmployeeId: 'emp-004', // Kenji Sato
      description: 'Enterprise zero-trust architecture, threat defense, and compliance audits.',
    };

    // Clean up if already exists from prior test
    await Department.deleteOne({ code: newDeptPayload.code });

    // TEST 10: HR Admin creates department
    const resCreate = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/departments',
      headers: { authorization: `Bearer ${hrToken}` },
      body: newDeptPayload,
    });
    const dataCreate = await resCreate.json();
    recordTest(
      'POST /departments as HR Admin: Creates department',
      'HTTP 201 with resolved headName',
      `HTTP ${resCreate.status}, code: ${dataCreate.data?.code}, headName: ${dataCreate.data?.headName}`,
      resCreate.status === 201 && dataCreate.data?.code === 'SEC' && dataCreate.data?.headName === 'Kenji Sato'
    );

    const createdDeptId = dataCreate.data?.id;

    // TEST 11: Direct MongoDB Verification of Created Department
    const dbDept = await Department.findOne({ code: 'SEC' });
    recordTest(
      'Database Verification: Created department persisted in MongoDB',
      'Found document in MongoDB with correct fields',
      dbDept ? `Found: ${dbDept.name} (${dbDept.id})` : 'Not found',
      Boolean(dbDept && dbDept.name === newDeptPayload.name)
    );

    // TEST 12: Duplicate department code rejected
    const resDupCode = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/departments',
      headers: { authorization: `Bearer ${hrToken}` },
      body: {
        name: 'Another Security Team',
        code: 'SEC',
        headEmployeeId: 'emp-001',
      },
    });
    recordTest(
      'POST /departments with duplicate code: Rejected',
      'HTTP 409 Conflict',
      `HTTP ${resDupCode.status}`,
      resDupCode.status === 409
    );

    // TEST 13: Duplicate department name rejected
    const resDupName = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/departments',
      headers: { authorization: `Bearer ${hrToken}` },
      body: {
        name: 'Information Security & Trust',
        code: 'SEC2',
        headEmployeeId: 'emp-001',
      },
    });
    recordTest(
      'POST /departments with duplicate name: Rejected',
      'HTTP 409 Conflict',
      `HTTP ${resDupName.status}`,
      resDupName.status === 409
    );

    // TEST 14: Validation error (Missing required fields)
    const resInvalid = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/departments',
      headers: { authorization: `Bearer ${hrToken}` },
      body: { name: 'X' }, // missing code and headEmployeeId
    });
    recordTest(
      'POST /departments with invalid payload: Validation error',
      'HTTP 400 Validation Error',
      `HTTP ${resInvalid.status}`,
      resInvalid.status === 400
    );

    // TEST 15: Employee role CANNOT create department (403 Forbidden)
    const resEmpCreate = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/departments',
      headers: { authorization: `Bearer ${employeeToken}` },
      body: {
        name: 'Employee Secret Club',
        code: 'CLUB',
        headEmployeeId: 'emp-002',
      },
    });
    recordTest(
      'RBAC: Employee cannot create department',
      'HTTP 403 Forbidden',
      `HTTP ${resEmpCreate.status}`,
      resEmpCreate.status === 403
    );

    // TEST 16: Manager role CANNOT create department (403 Forbidden)
    const resMgrCreate = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/departments',
      headers: { authorization: `Bearer ${managerToken}` },
      body: {
        name: 'Manager Division',
        code: 'MGRD',
        headEmployeeId: 'emp-003',
      },
    });
    recordTest(
      'RBAC: Manager cannot create department',
      'HTTP 403 Forbidden',
      `HTTP ${resMgrCreate.status}`,
      resMgrCreate.status === 403
    );

    // 6. Department Updates & Cascading Sync
    console.log('\n✏️ Step 5: Testing Department Updates & Cascading Sync...');

    // TEST 17: HR Admin updates department name and head
    const resUpdate = await dispatch(appInstance, {
      method: 'PATCH',
      url: `/api/v1/departments/${createdDeptId}`,
      headers: { authorization: `Bearer ${hrToken}` },
      body: {
        name: 'Cybersecurity & Cloud Defense',
        headEmployeeId: 'emp-001', // Dr. Aris Thorne
        description: 'Updated enterprise mission.',
      },
    });
    const dataUpdate = await resUpdate.json();
    recordTest(
      'PATCH /departments/:id as HR Admin: Updates name and head',
      'HTTP 200 with new name and resolved headName',
      `HTTP ${resUpdate.status}, name: ${dataUpdate.data?.name}, head: ${dataUpdate.data?.headName}`,
      resUpdate.status === 200 &&
        dataUpdate.data?.name === 'Cybersecurity & Cloud Defense' &&
        dataUpdate.data?.headName === 'Dr. Aris Thorne'
    );

    // TEST 18: Direct MongoDB Verification of Department Update
    const dbUpdatedDept = await Department.findOne({ id: createdDeptId });
    recordTest(
      'Database Verification: Department updates persisted in MongoDB',
      'name is Cybersecurity & Cloud Defense, headEmployeeId is emp-001',
      `name: ${dbUpdatedDept?.name}, head: ${dbUpdatedDept?.headName}`,
      Boolean(
        dbUpdatedDept &&
          dbUpdatedDept.name === 'Cybersecurity & Cloud Defense' &&
          dbUpdatedDept.headEmployeeId === 'emp-001'
      )
    );

    // TEST 19: Cascading update test
    // Assign a temporary test employee to this created department to verify cascade
    const cascadeEmpEmail = 'test.cascade@reviewforge.internal';
    await Employee.deleteOne({ email: cascadeEmpEmail });
    const tempCascadeEmp = await Employee.create({
      id: 'emp-cascade-test',
      organizationId: 'org-reviewforge-default',
      employeeNumber: 'RF-9999',
      name: 'Cascade Test Employee',
      email: cascadeEmpEmail,
      departmentId: createdDeptId,
      departmentName: 'Cybersecurity & Cloud Defense',
      jobTitle: 'Security Analyst',
      joinDate: '2024-01-01',
      employmentStatus: 'Full-Time',
      reviewStatus: 'Not Started',
    });

    // Now update department name again to verify cascade to employees
    await dispatch(appInstance, {
      method: 'PATCH',
      url: `/api/v1/departments/${createdDeptId}`,
      headers: { authorization: `Bearer ${hrToken}` },
      body: { name: 'Trust & Safety Division' },
    });

    const empAfterCascade = await Employee.findOne({ id: 'emp-cascade-test' });
    recordTest(
      'Cascading Update: Department name modification syncs to assigned employees',
      'Employee.departmentName updated to Trust & Safety Division',
      `Employee departmentName in MongoDB: ${empAfterCascade?.departmentName}`,
      empAfterCascade?.departmentName === 'Trust & Safety Division'
    );

    // TEST 20: Non-HR role CANNOT update department
    const resEmpUpdate = await dispatch(appInstance, {
      method: 'PATCH',
      url: `/api/v1/departments/${createdDeptId}`,
      headers: { authorization: `Bearer ${employeeToken}` },
      body: { name: 'Hacked Name' },
    });
    recordTest(
      'RBAC: Non-HR role cannot update department',
      'HTTP 403 Forbidden',
      `HTTP ${resEmpUpdate.status}`,
      resEmpUpdate.status === 403
    );

    // 7. Department Deletion & Safeguards
    console.log('\n🛡️ Step 6: Testing Deletion Safeguards...');

    // TEST 21: Prohibit deleting department with assigned active employees
    const resDeleteSafeguard = await dispatch(appInstance, {
      method: 'DELETE',
      url: `/api/v1/departments/${createdDeptId}`,
      headers: { authorization: `Bearer ${hrToken}` },
    });
    recordTest(
      'Deletion Safeguard: Rejects deleting department with active employees',
      'HTTP 409 Conflict with informative safeguard message',
      `HTTP ${resDeleteSafeguard.status}`,
      resDeleteSafeguard.status === 409
    );

    // Clean up temporary cascade employee so department becomes empty
    await Employee.deleteOne({ id: 'emp-cascade-test' });

    // TEST 22: Non-HR role CANNOT delete department
    const resEmpDelete = await dispatch(appInstance, {
      method: 'DELETE',
      url: `/api/v1/departments/${createdDeptId}`,
      headers: { authorization: `Bearer ${employeeToken}` },
    });
    recordTest(
      'RBAC: Non-HR role cannot delete department',
      'HTTP 403 Forbidden',
      `HTTP ${resEmpDelete.status}`,
      resEmpDelete.status === 403
    );

    // TEST 23: HR Admin deletes empty department
    const resDeleteSuccess = await dispatch(appInstance, {
      method: 'DELETE',
      url: `/api/v1/departments/${createdDeptId}`,
      headers: { authorization: `Bearer ${hrToken}` },
    });
    recordTest(
      'DELETE /departments/:id as HR Admin: Deletes empty department',
      'HTTP 200 with success message',
      `HTTP ${resDeleteSuccess.status}`,
      resDeleteSuccess.status === 200
    );

    // TEST 24: Direct MongoDB Verification of Deletion
    const dbDeletedDept = await Department.findOne({ id: createdDeptId });
    recordTest(
      'Database Verification: Deleted department removed from MongoDB',
      'Document should not exist in MongoDB',
      dbDeletedDept ? 'Still exists' : 'Null (Removed)',
      dbDeletedDept === null
    );

    // 8. Organization Profile & Settings
    console.log('\n⚙️ Step 7: Testing Organization Profile & Governance Settings...');

    // TEST 25: All authenticated roles can view organization profile
    const resOrg = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/organization',
      headers: { authorization: `Bearer ${employeeToken}` },
    });
    const dataOrg = await resOrg.json();
    recordTest(
      'GET /organization as Employee: Returns profile & settings',
      'HTTP 200 with organization entity',
      `HTTP ${resOrg.status}, name: ${dataOrg.data?.name}`,
      resOrg.status === 200 && Boolean(dataOrg.data?.settings)
    );

    // TEST 26: HR Admin updates organization settings
    const resUpdateSettings = await dispatch(appInstance, {
      method: 'PATCH',
      url: '/api/v1/organization/settings',
      headers: { authorization: `Bearer ${hrToken}` },
      body: {
        name: 'ReviewForge Global Enterprise',
        ratingScale: '1-4 Descriptive',
        anonymityPolicy: 'Strict Anonymity',
        requireDualManagerSignoff: true,
        notificationPreferences: {
          emailOnCycleStart: true,
          slackDigestWeekly: true,
        },
      },
    });
    const dataSettings = await resUpdateSettings.json();
    recordTest(
      'PATCH /organization/settings as HR Admin: Updates platform governance',
      'HTTP 200 with updated ratingScale and slackDigestWeekly',
      `HTTP ${resUpdateSettings.status}, ratingScale: ${dataSettings.data?.settings?.ratingScale}`,
      resUpdateSettings.status === 200 &&
        dataSettings.data?.settings?.ratingScale === '1-4 Descriptive' &&
        dataSettings.data?.settings?.notificationPreferences?.slackDigestWeekly === true
    );

    // TEST 27: Direct MongoDB Verification of Organization Settings
    const dbOrgUpdated = await Organization.findOne({ id: 'org-reviewforge-default' });
    recordTest(
      'Database Verification: Organization settings persisted in MongoDB',
      'ratingScale is 1-4 Descriptive, name is ReviewForge Global Enterprise',
      `name: ${dbOrgUpdated?.name}, ratingScale: ${dbOrgUpdated?.settings?.ratingScale}`,
      Boolean(
        dbOrgUpdated &&
          dbOrgUpdated.name === 'ReviewForge Global Enterprise' &&
          dbOrgUpdated.settings?.ratingScale === '1-4 Descriptive'
      )
    );

    // TEST 28: Non-HR role CANNOT update organization settings
    const resEmpSettings = await dispatch(appInstance, {
      method: 'PATCH',
      url: '/api/v1/organization/settings',
      headers: { authorization: `Bearer ${employeeToken}` },
      body: { name: 'Hacked Organization' },
    });
    recordTest(
      'RBAC: Employee cannot update organization settings',
      'HTTP 403 Forbidden',
      `HTTP ${resEmpSettings.status}`,
      resEmpSettings.status === 403
    );

    // Print Summary
    console.log('\n================================================================');
    console.log('📊 MILESTONE 5 DEPARTMENT & ORG TEST EXECUTION SUMMARY');
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
      console.log('🎉 ALL 28 MILESTONE 5 TESTS PASSED CLEANLY!\n');
    }
  } catch (error) {
    console.error('Fatal test error:', error);
    process.exitCode = 1;
  } finally {
    await disconnectDatabase();
  }
}

runTestSuite();
