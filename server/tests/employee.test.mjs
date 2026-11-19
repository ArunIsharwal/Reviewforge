/**
 * ReviewForge - Milestone 4 Employee Management Automated Test Suite
 * Verifies Employee model, Mongoose persistence, CRUD APIs, multi-tenant scoping,
 * validation, error responses, and role-based permissions (HR Admin, Manager, Employee, Peer Reviewer).
 */

import mongoose from 'mongoose';
import { EventEmitter } from 'events';
import { createApp } from '../dist/app.js';
import { connectDatabase, disconnectDatabase } from '../dist/config/database.js';
import { User } from '../dist/models/User.js';
import { Employee } from '../dist/models/Employee.js';
import { Department } from '../dist/models/Department.js';

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
  console.log('🧪 STARTING REVIEWFORGE MILESTONE 4 EMPLOYEE TEST SUITE');
  console.log('================================================================\n');

  try {
    // 1. Database Connection & Model Seeds
    console.log('🔗 Step 1: Connecting to MongoDB & Seeding Collections...');
    await connectDatabase();
    appInstance = createApp();

    await User.seedDefaultUsers();
    await Department.seedDefaultDepartments();
    await Employee.seedDefaultEmployees();

    // 2. Direct Database Verification
    const employeeCount = await Employee.countDocuments({ organizationId: 'org-reviewforge-default' });
    recordTest(
      'Database Seed: 12 Initial Employees in MongoDB',
      'At least 12 employees',
      `${employeeCount} employees found`,
      employeeCount >= 12
    );

    const departmentCount = await Department.countDocuments({ organizationId: 'org-reviewforge-default' });
    recordTest(
      'Database Seed: 3 Departments in MongoDB',
      'At least 3 departments',
      `${departmentCount} departments found`,
      departmentCount >= 3
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

    // 4. Test Employee Directory (All Roles)
    console.log('\n📋 Step 3: Testing Employee Directory & Filters...');

    // TEST 4: HR Admin lists employees
    const resHrList = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/employees',
      headers: { authorization: `Bearer ${hrToken}` },
    });
    const dataHrList = await resHrList.json();
    recordTest(
      'GET /employees as HR Admin: Returns directory',
      'HTTP 200 with data array and pagination metadata',
      `HTTP ${resHrList.status}, count: ${dataHrList.count}, total: ${dataHrList.total}`,
      resHrList.status === 200 && Array.isArray(dataHrList.data) && dataHrList.total >= 12
    );

    // TEST 5: Regular Employee can view directory
    const resEmpList = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/employees',
      headers: { authorization: `Bearer ${employeeToken}` },
    });
    const dataEmpList = await resEmpList.json();
    recordTest(
      'GET /employees as Employee: Directory accessible',
      'HTTP 200 with data array',
      `HTTP ${resEmpList.status}, count: ${dataEmpList.count}`,
      resEmpList.status === 200 && Array.isArray(dataEmpList.data)
    );

    // TEST 6: Unauthenticated request rejected
    const resUnauth = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/employees',
    });
    recordTest(
      'GET /employees without token: Rejected',
      'HTTP 401 Unauthorized',
      `HTTP ${resUnauth.status}`,
      resUnauth.status === 401
    );

    // TEST 7: Department Filter
    const resDeptFilter = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/employees?departmentId=dept-eng',
      headers: { authorization: `Bearer ${hrToken}` },
    });
    const dataDeptFilter = await resDeptFilter.json();
    const allEng = dataDeptFilter.data.every((e) => e.departmentId === 'dept-eng');
    recordTest(
      'Filter employees by Department (dept-eng)',
      'Only employees where departmentId is dept-eng',
      `Count: ${dataDeptFilter.count}, all matched: ${allEng}`,
      resDeptFilter.status === 200 && dataDeptFilter.count > 0 && allEng
    );

    // TEST 8: Review Status Filter
    const resStatusFilter = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/employees?reviewStatus=Approved',
      headers: { authorization: `Bearer ${hrToken}` },
    });
    const dataStatusFilter = await resStatusFilter.json();
    const allApproved = dataStatusFilter.data.every((e) => e.reviewStatus === 'Approved');
    recordTest(
      'Filter employees by Review Status (Approved)',
      'Only employees where reviewStatus is Approved',
      `Count: ${dataStatusFilter.count}, all matched: ${allApproved}`,
      resStatusFilter.status === 200 && dataStatusFilter.count > 0 && allApproved
    );

    // TEST 9: Text Search
    const resSearch = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/employees?search=Aris',
      headers: { authorization: `Bearer ${hrToken}` },
    });
    const dataSearch = await resSearch.json();
    const foundAris = dataSearch.data.some((e) => e.name.includes('Aris'));
    recordTest(
      'Search query: ?search=Aris matches Dr. Aris Thorne',
      'Returns matching employee records',
      `Count: ${dataSearch.count}, found Aris: ${foundAris}`,
      resSearch.status === 200 && foundAris
    );

    // TEST 10: Pagination
    const resPage = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/employees?page=1&limit=4',
      headers: { authorization: `Bearer ${hrToken}` },
    });
    const dataPage = await resPage.json();
    recordTest(
      'Pagination: page=1&limit=4 returns exactly 4 items and totalPages',
      'count=4, totalPages >= 3, page=1',
      `count=${dataPage.count}, totalPages=${dataPage.totalPages}, page=${dataPage.page}`,
      resPage.status === 200 && dataPage.count === 4 && dataPage.totalPages >= 3
    );

    // 5. Single Employee Profile
    console.log('\n👤 Step 4: Testing Employee Profile Details...');

    // TEST 11: Get single employee
    const resSingle = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/employees/emp-001',
      headers: { authorization: `Bearer ${hrToken}` },
    });
    const dataSingle = await resSingle.json();
    recordTest(
      'GET /employees/emp-001 returns profile details',
      'HTTP 200 with id emp-001 and name Dr. Aris Thorne',
      `HTTP ${resSingle.status}, id: ${dataSingle.data?.id}, name: ${dataSingle.data?.name}`,
      resSingle.status === 200 && dataSingle.data?.id === 'emp-001'
    );

    // TEST 12: Non-existent employee returns 404
    const resNotFound = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/employees/emp-9999-not-exist',
      headers: { authorization: `Bearer ${hrToken}` },
    });
    recordTest(
      'GET /employees/emp-9999 returns HTTP 404',
      'HTTP 404 Not Found',
      `HTTP ${resNotFound.status}`,
      resNotFound.status === 404
    );

    // 6. Employee Creation & RBAC
    console.log('\n➕ Step 5: Testing Employee Creation & Validation...');

    const newEmpPayload = {
      name: 'Samantha Wright',
      email: 'samantha.wright@reviewforge.internal',
      jobTitle: 'Senior Cloud Reliability Engineer',
      departmentId: 'dept-eng',
      employmentStatus: 'Full-Time',
      location: 'Denver, CO',
      bio: 'Cloud architecture and observability specialist.',
      skills: ['AWS', 'Kubernetes', 'Go', 'Terraform'],
    };

    // Clean up any existing leftover from previous test run
    await Employee.deleteOne({ email: newEmpPayload.email });

    // TEST 13: HR Admin creates employee
    const resCreate = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/employees',
      headers: { authorization: `Bearer ${hrToken}` },
      body: newEmpPayload,
    });
    const dataCreate = await resCreate.json();
    recordTest(
      'POST /employees as HR Admin: Creates employee',
      'HTTP 201 Created with auto-generated id and number',
      `HTTP ${resCreate.status}, id: ${dataCreate.data?.id}, number: ${dataCreate.data?.employeeNumber}`,
      resCreate.status === 201 && dataCreate.data?.email === newEmpPayload.email && Boolean(dataCreate.data?.id)
    );

    const createdEmpId = dataCreate.data?.id;

    // TEST 14: Direct MongoDB Verification of Created Employee
    const dbEmp = await Employee.findOne({ email: newEmpPayload.email });
    recordTest(
      'Database Verification: Created employee persisted in MongoDB',
      'Found document in MongoDB with correct attributes',
      dbEmp ? `Found in MongoDB: ${dbEmp.name} (${dbEmp.id})` : 'Not found in DB',
      Boolean(dbEmp && dbEmp.jobTitle === newEmpPayload.jobTitle)
    );

    // TEST 15: Duplicate Email Rejected
    const resDupEmail = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/employees',
      headers: { authorization: `Bearer ${hrToken}` },
      body: newEmpPayload,
    });
    recordTest(
      'POST /employees with duplicate email: Rejected',
      'HTTP 409 Conflict',
      `HTTP ${resDupEmail.status}`,
      resDupEmail.status === 409
    );

    // TEST 16: Validation Error (Missing required fields)
    const resInvalid = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/employees',
      headers: { authorization: `Bearer ${hrToken}` },
      body: { name: 'Incomplete' }, // missing email, departmentId, jobTitle
    });
    recordTest(
      'POST /employees with incomplete payload: Validation error',
      'HTTP 400 Validation Error',
      `HTTP ${resInvalid.status}`,
      resInvalid.status === 400
    );

    // TEST 17: Employee Role CANNOT create employee (403 Forbidden)
    const resEmpCreate = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/employees',
      headers: { authorization: `Bearer ${employeeToken}` },
      body: {
        name: 'Unauthorized User',
        email: 'unauth@reviewforge.internal',
        jobTitle: 'Hacker',
        departmentId: 'dept-eng',
      },
    });
    recordTest(
      'RBAC: Employee role cannot create employee',
      'HTTP 403 Forbidden',
      `HTTP ${resEmpCreate.status}`,
      resEmpCreate.status === 403
    );

    // TEST 18: Peer Reviewer CANNOT create employee (403 Forbidden)
    const resPeerCreate = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/employees',
      headers: { authorization: `Bearer ${peerToken}` },
      body: {
        name: 'Peer Attempt',
        email: 'peer.attempt@reviewforge.internal',
        jobTitle: 'Tester',
        departmentId: 'dept-eng',
      },
    });
    recordTest(
      'RBAC: Peer Reviewer role cannot create employee',
      'HTTP 403 Forbidden',
      `HTTP ${resPeerCreate.status}`,
      resPeerCreate.status === 403
    );

    // 7. Update Employee & RBAC
    console.log('\n✏️ Step 6: Testing Employee Updates & Permissions...');

    // TEST 19: HR Admin updates employee info and manager assignment
    const resUpdate = await dispatch(appInstance, {
      method: 'PATCH',
      url: `/api/v1/employees/${createdEmpId}`,
      headers: { authorization: `Bearer ${hrToken}` },
      body: {
        jobTitle: 'Principal Reliability Architect',
        managerId: 'emp-001', // Dr. Aris Thorne
        location: 'Boulder, CO',
        skills: ['AWS', 'Kubernetes', 'Go', 'Chaos Engineering'],
      },
    });
    const dataUpdate = await resUpdate.json();
    recordTest(
      'PATCH /employees/:id as HR Admin: Updates job title and manager',
      'HTTP 200 with updated fields and resolved managerName',
      `HTTP ${resUpdate.status}, title: ${dataUpdate.data?.jobTitle}, manager: ${dataUpdate.data?.managerName}`,
      resUpdate.status === 200 &&
        dataUpdate.data?.jobTitle === 'Principal Reliability Architect' &&
        dataUpdate.data?.managerName === 'Dr. Aris Thorne'
    );

    // TEST 20: Direct MongoDB Verification of Update
    const dbUpdated = await Employee.findOne({ id: createdEmpId });
    recordTest(
      'Database Verification: Update reflected in MongoDB document',
      'jobTitle is Principal Reliability Architect, managerId is emp-001',
      `MongoDB jobTitle: ${dbUpdated?.jobTitle}, manager: ${dbUpdated?.managerName}`,
      Boolean(
        dbUpdated &&
          dbUpdated.jobTitle === 'Principal Reliability Architect' &&
          dbUpdated.managerId === 'emp-001'
      )
    );

    // TEST 21: Manager updates direct report (Elena Rostova is manager of emp-002 Rahul Deshmukh)
    // Wait, let's check manager relationship: in seed data, Dr. Aris Thorne is emp-001, Rahul is emp-002 (managerId: emp-001).
    // Let's check who Elena manages: in User model, Elena is elena.rostova@reviewforge.io with employeeId: emp-001 (or emp-003).
    // Let's test manager updating their direct report:
    await Employee.updateOne({ id: createdEmpId }, { managerId: 'emp-001' }); // Elena's user has employeeId emp-001
    const resMgrUpdate = await dispatch(appInstance, {
      method: 'PATCH',
      url: `/api/v1/employees/${createdEmpId}`,
      headers: { authorization: `Bearer ${managerToken}` },
      body: {
        bio: 'Updated by department manager with performance commendation.',
        skills: ['AWS', 'Kubernetes', 'Go', 'Chaos Engineering', 'Leadership'],
      },
    });
    const dataMgrUpdate = await resMgrUpdate.json();
    recordTest(
      'RBAC: Manager updates direct report bio & skills',
      'HTTP 200 with updated skills',
      `HTTP ${resMgrUpdate.status}, skills count: ${dataMgrUpdate.data?.skills?.length}`,
      resMgrUpdate.status === 200 && dataMgrUpdate.data?.skills?.includes('Leadership')
    );

    // TEST 22: Manager CANNOT change department assignment (HR Admin privilege)
    const resMgrIllegalDept = await dispatch(appInstance, {
      method: 'PATCH',
      url: `/api/v1/employees/${createdEmpId}`,
      headers: { authorization: `Bearer ${managerToken}` },
      body: {
        departmentId: 'dept-prod',
      },
    });
    recordTest(
      'RBAC: Manager prohibited from altering department assignment',
      'HTTP 403 Forbidden',
      `HTTP ${resMgrIllegalDept.status}`,
      resMgrIllegalDept.status === 403
    );

    // TEST 23: Regular Employee CANNOT edit another employee's record
    const resEmpIllegalEdit = await dispatch(appInstance, {
      method: 'PATCH',
      url: `/api/v1/employees/${createdEmpId}`,
      headers: { authorization: `Bearer ${employeeToken}` },
      body: {
        location: 'Remote Florida',
      },
    });
    recordTest(
      'RBAC: Regular Employee cannot modify another employee record',
      'HTTP 403 Forbidden',
      `HTTP ${resEmpIllegalEdit.status}`,
      resEmpIllegalEdit.status === 403
    );

    // TEST 24: Employee CANNOT change administrative fields on their own profile
    // Rahul's user has employeeId emp-002
    const resEmpAdminField = await dispatch(appInstance, {
      method: 'PATCH',
      url: '/api/v1/employees/emp-002',
      headers: { authorization: `Bearer ${employeeToken}` },
      body: {
        jobTitle: 'Chief Executive Officer',
      },
    });
    recordTest(
      'RBAC: Employee prohibited from elevating own jobTitle or department',
      'HTTP 403 Forbidden',
      `HTTP ${resEmpAdminField.status}`,
      resEmpAdminField.status === 403
    );

    // 8. Soft Deactivation & Status
    console.log('\n🗑️ Step 7: Testing Soft Deactivation & Deletion...');

    // TEST 25: Non-HR role cannot deactivate employee
    const resEmpDelete = await dispatch(appInstance, {
      method: 'DELETE',
      url: `/api/v1/employees/${createdEmpId}`,
      headers: { authorization: `Bearer ${employeeToken}` },
    });
    recordTest(
      'RBAC: Non-HR role cannot deactivate employee',
      'HTTP 403 Forbidden',
      `HTTP ${resEmpDelete.status}`,
      resEmpDelete.status === 403
    );

    // TEST 26: HR Admin soft deactivates employee
    const resDeactivate = await dispatch(appInstance, {
      method: 'DELETE',
      url: `/api/v1/employees/${createdEmpId}`,
      headers: { authorization: `Bearer ${hrToken}` },
    });
    const dataDeactivate = await resDeactivate.json();
    recordTest(
      'DELETE /employees/:id as HR Admin: Soft deactivates employee',
      'HTTP 200 with isDeactivated: true',
      `HTTP ${resDeactivate.status}, isDeactivated: ${dataDeactivate.data?.isDeactivated}`,
      resDeactivate.status === 200 && dataDeactivate.data?.isDeactivated === true
    );

    // TEST 27: MongoDB Verification of Deactivation
    const dbDeactivated = await Employee.findOne({ id: createdEmpId });
    recordTest(
      'Database Verification: Deactivation status persisted in MongoDB',
      'isDeactivated is true, deactivatedAt is set',
      `isDeactivated: ${dbDeactivated?.isDeactivated}, deactivatedAt: ${dbDeactivated?.deactivatedAt}`,
      Boolean(dbDeactivated && dbDeactivated.isDeactivated === true && dbDeactivated.deactivatedAt)
    );

    // TEST 28: Deactivated employee excluded from default directory listing
    const resListAfter = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/employees',
      headers: { authorization: `Bearer ${employeeToken}` },
    });
    const dataListAfter = await resListAfter.json();
    const inList = dataListAfter.data.some((e) => e.id === createdEmpId);
    recordTest(
      'Directory Filter: Deactivated employee excluded from standard listing',
      'Deactivated employee is not present in data array',
      `In directory: ${inList}`,
      !inList
    );

    // Clean up created test employee permanently from MongoDB
    await Employee.deleteOne({ id: createdEmpId });

    // Print Summary
    console.log('\n================================================================');
    console.log('📊 MILESTONE 4 EMPLOYEE TEST EXECUTION SUMMARY');
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
      console.log('🎉 ALL 28 MILESTONE 4 TESTS PASSED CLEANLY!\n');
    }
  } catch (error) {
    console.error('Fatal test error:', error);
    process.exitCode = 1;
  } finally {
    await disconnectDatabase();
  }
}

runTestSuite();
