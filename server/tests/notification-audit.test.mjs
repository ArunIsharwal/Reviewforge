/**
 * ReviewForge - Milestone 13: Notifications and Audit Logs Test Suite
 * Validates:
 * 1. Mongoose Models & MongoDB persistence:
 *    - Notification collection: schemas, compound indexes, unread tracking
 *    - AuditLog collection: schemas, compound indexes, immutable security records
 * 2. Notification APIs:
 *    - Notification creation (POST /api/v1/notifications) with schema validation
 *    - User notification retrieval (GET /api/v1/notifications) with live unread counter
 *    - Unread filtering (?unreadOnly=true)
 *    - User isolation (User A cannot see User B's notifications)
 *    - Mark notification as read (PATCH /api/v1/notifications/:id/read)
 *    - Bulk mark all as read (POST /api/v1/notifications/mark-all-read)
 *    - Notification dismissal/deletion (DELETE /api/v1/notifications/:id)
 *    - Cross-user mutation security (HTTP 403 Forbidden on modifying other's notifications)
 *    - Organization notification preferences (GET & PUT /api/v1/notifications/preferences)
 * 3. Security Audit Trail APIs:
 *    - Audit log append (POST /api/v1/audit-logs) capturing actor context and client IP
 *    - Programmatic audit recorder helper (recordAuditEvent)
 *    - Audit log query & pagination (GET /api/v1/audit-logs)
 *    - Audit log filtering by action, actorRole, target
 * 4. Strict Security & Immutability Rules:
 *    - 401 for unauthenticated requests
 *    - 403 for managers, employees, and peer reviewers attempting to view system audit logs
 *    - 405 Method Not Allowed for PUT/PATCH/DELETE on audit logs (immutable records)
 */

import mongoose from 'mongoose';
import { EventEmitter } from 'events';
import { createApp } from '../dist/app.js';
import { connectDatabase, disconnectDatabase } from '../dist/config/database.js';
import { User } from '../dist/models/User.js';
import { Organization } from '../dist/models/Organization.js';
import { Notification } from '../dist/models/Notification.js';
import { AuditLog } from '../dist/models/AuditLog.js';
import { recordAuditEvent } from '../dist/controllers/audit-log.controller.js';

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
    req.socket = { remoteAddress: '127.0.0.1' };
    req.connection = req.socket;

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
  console.log('   MILESTONE 13: NOTIFICATIONS & AUDIT LOGS TEST SUITE');
  console.log('======================================================\n');

  try {
    // Step 1: Connect to Database
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
        id: 'usr-admin-m13',
        email: 'admin.m13@reviewforge.io',
        passwordHash,
        name: 'ReviewForge HR Admin',
        role: 'hr_admin',
        organizationId: orgId,
        employeeId: 'emp-admin-m13',
        status: 'active',
      },
      {
        id: 'usr-mgr-m13',
        email: 'manager.m13@reviewforge.io',
        passwordHash,
        name: 'Elena Rostova (Engineering Manager)',
        role: 'manager',
        organizationId: orgId,
        employeeId: 'emp-mgr-m13',
        status: 'active',
      },
      {
        id: 'usr-emp-m13',
        email: 'employee.m13@reviewforge.io',
        passwordHash,
        name: 'Rahul Deshmukh (Frontend Engineer)',
        role: 'employee',
        organizationId: orgId,
        employeeId: 'emp-emp-m13',
        status: 'active',
      },
      {
        id: 'usr-peer-m13',
        email: 'peer.m13@reviewforge.io',
        passwordHash,
        name: 'Marcus Vance (Senior Reviewer)',
        role: 'peer_reviewer',
        organizationId: orgId,
        employeeId: 'emp-peer-m13',
        status: 'active',
      },
    ];

    for (const u of usersToSeed) {
      await User.findOneAndUpdate({ email: u.email }, u, { upsert: true, new: true });
    }
    recordTest('Seed Test Users for All 4 Roles', '4 users seeded in MongoDB', '4 users ready', true);

    // Step 3: Obtain Auth Tokens for all 4 roles
    const authHeaders = {};
    for (const u of usersToSeed) {
      const loginRes = await dispatch(appInstance, {
        method: 'POST',
        url: '/api/v1/auth/login',
        body: { email: u.email, password: 'Admin@ReviewForge2026!' },
      });
      const token = loginRes.body?.accessToken || loginRes.body?.token;
      if (!token) {
        throw new Error(`Failed to obtain token for ${u.role}: ${JSON.stringify(loginRes.body)}`);
      }
      authHeaders[u.role] = { Authorization: `Bearer ${token}` };
    }
    recordTest('Authenticate All 4 Roles', 'JWT tokens issued for all roles', '4 tokens active', true);

    // Step 4: Security: Unauthenticated Guards
    const unauthNotifs = await dispatch(appInstance, { method: 'GET', url: '/api/v1/notifications' });
    recordTest('Unauthenticated Notifications Guard', 'HTTP 401', `HTTP ${unauthNotifs.statusCode}`, unauthNotifs.statusCode === 401);

    const unauthAudit = await dispatch(appInstance, { method: 'GET', url: '/api/v1/audit-logs' });
    recordTest('Unauthenticated Audit Logs Guard', 'HTTP 401', `HTTP ${unauthAudit.statusCode}`, unauthAudit.statusCode === 401);

    // Step 5: Clean test notifications and seed baseline
    await Notification.deleteMany({ organizationId: orgId, userId: { $in: ['usr-admin-m13', 'usr-emp-m13', 'usr-mgr-m13', 'emp-emp-m13'] } });

    const seedNotifs = [
      {
        id: 'notif-m13-1',
        organizationId: orgId,
        userId: 'usr-admin-m13',
        title: 'Review Awaiting Sign-off',
        message: 'Annual review pending calibration approval.',
        type: 'approval',
        link: '/approvals',
        isRead: false,
      },
      {
        id: 'notif-m13-2',
        organizationId: orgId,
        userId: 'usr-admin-m13',
        title: 'Review Cycle Calibration',
        message: 'Calibration closes in 10 days.',
        type: 'cycle',
        link: '/review-cycles',
        isRead: true,
      },
      {
        id: 'notif-m13-3',
        organizationId: orgId,
        userId: 'usr-emp-m13',
        title: 'Feedback Request Assigned',
        message: 'Please complete feedback for Elena Rostova.',
        type: 'feedback',
        link: '/feedback',
        isRead: false,
      },
      {
        id: 'notif-m13-4',
        organizationId: orgId,
        userId: 'usr-emp-m13',
        title: 'Self-Reflection Open',
        message: 'Annual self-assessment deadline Nov 25.',
        type: 'cycle',
        link: '/self-reflections',
        isRead: false,
      },
    ];

    for (const sn of seedNotifs) {
      await Notification.create(sn);
    }
    recordTest('Seed Notification Fixtures', '4 notifications created in MongoDB', 'seeded in database', true);

    // Step 6: Query Notifications for HR Admin
    const adminNotifRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/notifications',
      headers: authHeaders.hr_admin,
    });
    recordTest('Admin Query Notifications Status', 'HTTP 200', `HTTP ${adminNotifRes.statusCode}`, adminNotifRes.statusCode === 200);
    recordTest(
      'Admin Notifications Count',
      'count === 2, unreadCount === 1',
      `count === ${adminNotifRes.body?.count}, unreadCount === ${adminNotifRes.body?.unreadCount}`,
      adminNotifRes.body?.count === 2 && adminNotifRes.body?.unreadCount === 1
    );

    // Step 7: Query Unread Only Filter
    const adminUnreadRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/notifications?unreadOnly=true',
      headers: authHeaders.hr_admin,
    });
    recordTest(
      'Filter Unread Only Notifications',
      'count === 1 and isRead === false',
      `count === ${adminUnreadRes.body?.count}`,
      adminUnreadRes.body?.count === 1 && adminUnreadRes.body?.data?.[0]?.isRead === false
    );

    // Step 8: User Isolation (Employee only sees own notifications)
    const empNotifRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/notifications',
      headers: authHeaders.employee,
    });
    recordTest('Employee Query Notifications Status', 'HTTP 200', `HTTP ${empNotifRes.statusCode}`, empNotifRes.statusCode === 200);
    recordTest(
      'Employee Notification Isolation',
      'count === 2, unreadCount === 2, only usr-emp-m13',
      `count === ${empNotifRes.body?.count}, unreadCount === ${empNotifRes.body?.unreadCount}`,
      empNotifRes.body?.count === 2 &&
        empNotifRes.body?.unreadCount === 2 &&
        empNotifRes.body?.data.every((n) => n.userId === 'usr-emp-m13' || n.userId === 'emp-emp-m13')
    );

    // Step 9: Create Notification (Admin broadcast to Employee)
    const createNotifRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/notifications',
      headers: authHeaders.hr_admin,
      body: {
        userId: 'usr-emp-m13',
        title: 'Review Published',
        message: 'Your FY2026 performance review has been published.',
        type: 'release',
        link: '/reviews',
      },
    });
    recordTest('Create Notification Status', 'HTTP 201', `HTTP ${createNotifRes.statusCode}`, createNotifRes.statusCode === 201);
    const createdNotifId = createNotifRes.body?.data?.id;
    recordTest('Create Notification ID', 'valid notification ID created', createdNotifId, Boolean(createdNotifId));

    // Verify in MongoDB directly
    const createdDoc = await Notification.findOne({ id: createdNotifId });
    recordTest(
      'MongoDB Notification Persistence',
      'Notification document exists in collection',
      `Found: ${createdDoc?.title}`,
      createdDoc !== null && createdDoc.type === 'release'
    );

    // Step 10: Validation on Notification Creation (Reject invalid payload)
    const invalidNotifRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/notifications',
      headers: authHeaders.hr_admin,
      body: {
        userId: '',
        title: 'X',
        message: 'hi',
      },
    });
    recordTest(
      'Reject Invalid Notification Payload',
      'HTTP 400 Bad Request',
      `HTTP ${invalidNotifRes.statusCode}`,
      invalidNotifRes.statusCode === 400
    );

    // Step 11: Mark Notification as Read (Owner Employee marks notif-m13-3)
    const markReadRes = await dispatch(appInstance, {
      method: 'PATCH',
      url: '/api/v1/notifications/notif-m13-3/read',
      headers: authHeaders.employee,
    });
    recordTest('Mark Notification Read Status', 'HTTP 200', `HTTP ${markReadRes.statusCode}`, markReadRes.statusCode === 200);
    recordTest(
      'Notification isRead Updated',
      'isRead === true',
      `isRead === ${markReadRes.body?.data?.isRead}`,
      markReadRes.body?.data?.isRead === true
    );

    // Verify in MongoDB
    const readDoc = await Notification.findOne({ id: 'notif-m13-3' });
    recordTest('MongoDB Verified isRead === true', 'true', String(readDoc?.isRead), readDoc?.isRead === true);

    // Step 12: Cross-User Security (Employee cannot mark Admin notification as read)
    const crossReadRes = await dispatch(appInstance, {
      method: 'PATCH',
      url: '/api/v1/notifications/notif-m13-1/read',
      headers: authHeaders.employee,
    });
    recordTest(
      'Prevent Cross-User Notification Read Mutation',
      'HTTP 403 Forbidden',
      `HTTP ${crossReadRes.statusCode}`,
      crossReadRes.statusCode === 403
    );

    // Step 13: Mark Non-Existent Notification
    const notFoundReadRes = await dispatch(appInstance, {
      method: 'PATCH',
      url: '/api/v1/notifications/notif-nonexistent-999/read',
      headers: authHeaders.employee,
    });
    recordTest(
      'Non-Existent Notification Returns 404',
      'HTTP 404',
      `HTTP ${notFoundReadRes.statusCode}`,
      notFoundReadRes.statusCode === 404
    );

    // Step 14: Bulk Mark All Read (Employee marks remaining unread notifications)
    const markAllRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/notifications/mark-all-read',
      headers: authHeaders.employee,
    });
    recordTest('Bulk Mark All Read Status', 'HTTP 200', `HTTP ${markAllRes.statusCode}`, markAllRes.statusCode === 200);

    // Verify employee unread count is now 0
    const empPostBulkRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/notifications',
      headers: authHeaders.employee,
    });
    recordTest(
      'Bulk Mark All Read Verified Unread Count 0',
      'unreadCount === 0',
      `unreadCount === ${empPostBulkRes.body?.unreadCount}`,
      empPostBulkRes.body?.unreadCount === 0
    );

    // Step 15: Delete / Dismiss Notification
    const delRes = await dispatch(appInstance, {
      method: 'DELETE',
      url: `/api/v1/notifications/${createdNotifId}`,
      headers: authHeaders.employee,
    });
    recordTest('Dismiss Notification Status', 'HTTP 200', `HTTP ${delRes.statusCode}`, delRes.statusCode === 200);

    // Verify document deleted from MongoDB
    const deletedDoc = await Notification.findOne({ id: createdNotifId });
    recordTest('MongoDB Deletion Verified', 'null (deleted)', String(deletedDoc), deletedDoc === null);

    // Step 16: Cross-User Delete Prevention (Employee cannot delete Admin notification)
    const crossDelRes = await dispatch(appInstance, {
      method: 'DELETE',
      url: '/api/v1/notifications/notif-m13-1',
      headers: authHeaders.employee,
    });
    recordTest(
      'Prevent Cross-User Notification Deletion',
      'HTTP 403 Forbidden',
      `HTTP ${crossDelRes.statusCode}`,
      crossDelRes.statusCode === 403
    );

    // Step 17: Notification Preferences (GET & PUT)
    const getPrefsRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/notifications/preferences',
      headers: authHeaders.employee,
    });
    recordTest('Get Notification Preferences Status', 'HTTP 200', `HTTP ${getPrefsRes.statusCode}`, getPrefsRes.statusCode === 200);
    recordTest(
      'Preferences Schema Contains Email Toggles',
      'emailOnCycleStart !== undefined',
      `emailOnCycleStart: ${getPrefsRes.body?.data?.emailOnCycleStart}`,
      getPrefsRes.body?.data?.emailOnCycleStart !== undefined
    );

    const updatePrefsRes = await dispatch(appInstance, {
      method: 'PUT',
      url: '/api/v1/notifications/preferences',
      headers: authHeaders.hr_admin,
      body: {
        emailOnCycleStart: true,
        emailOnFeedbackRequest: false,
        slackDigestWeekly: true,
      },
    });
    recordTest('Update Notification Preferences Status', 'HTTP 200', `HTTP ${updatePrefsRes.statusCode}`, updatePrefsRes.statusCode === 200);
    recordTest(
      'Preferences Successfully Updated',
      'emailOnFeedbackRequest === false, slackDigestWeekly === true',
      `emailOnFeedbackRequest: ${updatePrefsRes.body?.data?.emailOnFeedbackRequest}, slackDigestWeekly: ${updatePrefsRes.body?.data?.slackDigestWeekly}`,
      updatePrefsRes.body?.data?.emailOnFeedbackRequest === false && updatePrefsRes.body?.data?.slackDigestWeekly === true
    );

    // ==========================================
    // AUDIT LOG TESTS
    // ==========================================

    // Step 18: Seed Baseline Audit Logs
    await AuditLog.deleteMany({ organizationId: orgId });
    const seedAuditLogs = [
      {
        id: 'audit-m13-1',
        organizationId: orgId,
        actorId: 'usr-admin-m13',
        actorName: 'ReviewForge HR Admin',
        actorRole: 'hr_admin',
        action: 'POLICY_UPDATED',
        target: 'Global Governance',
        details: 'Configured Dual Manager Sign-off for FY2026',
        ipAddress: '127.0.0.1',
        timestamp: new Date().toISOString(),
      },
      {
        id: 'audit-m13-2',
        organizationId: orgId,
        actorId: 'usr-admin-m13',
        actorName: 'ReviewForge HR Admin',
        actorRole: 'hr_admin',
        action: 'REVIEW_CYCLE_CREATED',
        target: 'FY2026 Annual Performance Cycle',
        details: 'Review cycle launched with 4 eligible employees',
        ipAddress: '127.0.0.1',
        timestamp: new Date().toISOString(),
      },
      {
        id: 'audit-m13-3',
        organizationId: orgId,
        actorId: 'usr-mgr-m13',
        actorName: 'Elena Rostova',
        actorRole: 'manager',
        action: 'REVIEW_APPROVED',
        target: 'Rahul Deshmukh (FY2026)',
        details: 'Manager sign-off completed with overall rating 4.8',
        ipAddress: '127.0.0.1',
        timestamp: new Date().toISOString(),
      },
    ];

    for (const sal of seedAuditLogs) {
      await AuditLog.create(sal);
    }
    recordTest('Seed Audit Log Baseline Fixtures', '3 audit logs stored in MongoDB', 'seeded in database', true);

    // Step 19: Append Audit Log via API (POST /api/v1/audit-logs)
    const createAuditRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/audit-logs',
      headers: authHeaders.hr_admin,
      body: {
        action: 'REVIEW_PUBLISHED',
        target: 'Rahul Deshmukh (FY2026)',
        details: 'Review officially released to employee view by HR Admin',
      },
    });
    recordTest('Append Audit Log Status', 'HTTP 201', `HTTP ${createAuditRes.statusCode}`, createAuditRes.statusCode === 201);
    const newAuditId = createAuditRes.body?.data?.id;
    recordTest('Audit Log Actor Populated From Session', 'usr-admin-m13', createAuditRes.body?.data?.actorId, createAuditRes.body?.data?.actorId === 'usr-admin-m13');
    recordTest('Audit Log Role Populated From Session', 'hr_admin', createAuditRes.body?.data?.actorRole, createAuditRes.body?.data?.actorRole === 'hr_admin');

    // Verify in MongoDB
    const auditDoc = await AuditLog.findOne({ id: newAuditId });
    recordTest('MongoDB Audit Log Persistence', 'Audit log document exists', `Found: ${auditDoc?.action}`, auditDoc !== null && auditDoc.action === 'REVIEW_PUBLISHED');

    // Step 20: Programmatic Helper Verification (recordAuditEvent)
    const helperLog = await recordAuditEvent({
      organizationId: orgId,
      actorId: 'system-agent',
      actorName: 'ReviewForge AI Synthesizer',
      actorRole: 'system',
      action: 'AI_SYNTHESIS_COMPLETED',
      target: 'Elena Rostova (FY2026)',
      details: 'Automated synthesis completed using gemini-1.5-pro with 94% coverage',
      ipAddress: '10.0.0.1',
    });
    recordTest('Programmatic Audit Helper Execution', 'valid record returned', helperLog.id, Boolean(helperLog && helperLog.id));
    const helperDoc = await AuditLog.findOne({ id: helperLog.id });
    recordTest('MongoDB Helper Record Verified', 'AI_SYNTHESIS_COMPLETED', helperDoc?.action, helperDoc?.action === 'AI_SYNTHESIS_COMPLETED');

    // Step 21: Query Audit Trail as HR Admin (GET /api/v1/audit-logs)
    const adminAuditRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/audit-logs',
      headers: authHeaders.hr_admin,
    });
    recordTest('HR Admin Query Audit Logs Status', 'HTTP 200', `HTTP ${adminAuditRes.statusCode}`, adminAuditRes.statusCode === 200);
    recordTest(
      'Audit Logs Count Verified',
      'total >= 5',
      `total: ${adminAuditRes.body?.total}, count: ${adminAuditRes.body?.count}`,
      adminAuditRes.body?.total >= 5 && adminAuditRes.body?.count >= 5
    );

    // Step 22: STRICT RBAC SECURITY GATES: Non-Admins strictly forbidden
    const mgrAuditRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/audit-logs',
      headers: authHeaders.manager,
    });
    recordTest('Manager Forbidden from Audit Logs', 'HTTP 403 Forbidden', `HTTP ${mgrAuditRes.statusCode}`, mgrAuditRes.statusCode === 403);

    const empAuditRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/audit-logs',
      headers: authHeaders.employee,
    });
    recordTest('Employee Forbidden from Audit Logs', 'HTTP 403 Forbidden', `HTTP ${empAuditRes.statusCode}`, empAuditRes.statusCode === 403);

    const peerAuditRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/audit-logs',
      headers: authHeaders.peer_reviewer,
    });
    recordTest('Peer Reviewer Forbidden from Audit Logs', 'HTTP 403 Forbidden', `HTTP ${peerAuditRes.statusCode}`, peerAuditRes.statusCode === 403);

    // Step 23: Audit Log Filtering by Action
    const filterActionRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/audit-logs?action=REVIEW_APPROVED',
      headers: authHeaders.hr_admin,
    });
    recordTest('Filter Audit Logs by Action Status', 'HTTP 200', `HTTP ${filterActionRes.statusCode}`, filterActionRes.statusCode === 200);
    recordTest(
      'Filter Audit Logs by Action Result',
      'every log action === REVIEW_APPROVED',
      `count: ${filterActionRes.body?.count}`,
      filterActionRes.body?.count > 0 && filterActionRes.body?.data.every((l) => l.action === 'REVIEW_APPROVED')
    );

    // Step 24: Audit Log Filtering by Role
    const filterRoleRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/audit-logs?actorRole=manager',
      headers: authHeaders.hr_admin,
    });
    recordTest('Filter Audit Logs by Role Status', 'HTTP 200', `HTTP ${filterRoleRes.statusCode}`, filterRoleRes.statusCode === 200);
    recordTest(
      'Filter Audit Logs by Role Result',
      'every log actorRole === manager',
      `count: ${filterRoleRes.body?.count}`,
      filterRoleRes.body?.count > 0 && filterRoleRes.body?.data.every((l) => l.actorRole === 'manager')
    );

    // Step 25: Audit Log Filtering by Target Search
    const filterTargetRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/audit-logs?target=Rahul',
      headers: authHeaders.hr_admin,
    });
    recordTest('Filter Audit Logs by Target Regex Status', 'HTTP 200', `HTTP ${filterTargetRes.statusCode}`, filterTargetRes.statusCode === 200);
    recordTest(
      'Filter Audit Logs by Target Result',
      'every log target contains "Rahul"',
      `count: ${filterTargetRes.body?.count}`,
      filterTargetRes.body?.count > 0 && filterTargetRes.body?.data.every((l) => l.target.includes('Rahul'))
    );

    // Step 26: IMMUTABILITY PROTECTION GUARDS (HTTP 405 Method Not Allowed)
    const putAuditRes = await dispatch(appInstance, {
      method: 'PUT',
      url: `/api/v1/audit-logs/${newAuditId}`,
      headers: authHeaders.hr_admin,
      body: { details: 'Tampered details' },
    });
    recordTest(
      'Immutability: PUT Audit Log Blocked with 405',
      'HTTP 405 Method Not Allowed',
      `HTTP ${putAuditRes.statusCode}`,
      putAuditRes.statusCode === 405
    );

    const patchAuditRes = await dispatch(appInstance, {
      method: 'PATCH',
      url: `/api/v1/audit-logs/${newAuditId}`,
      headers: authHeaders.hr_admin,
      body: { details: 'Tampered details' },
    });
    recordTest(
      'Immutability: PATCH Audit Log Blocked with 405',
      'HTTP 405 Method Not Allowed',
      `HTTP ${patchAuditRes.statusCode}`,
      patchAuditRes.statusCode === 405
    );

    const deleteAuditRes = await dispatch(appInstance, {
      method: 'DELETE',
      url: `/api/v1/audit-logs/${newAuditId}`,
      headers: authHeaders.hr_admin,
    });
    recordTest(
      'Immutability: DELETE Single Audit Log Blocked with 405',
      'HTTP 405 Method Not Allowed',
      `HTTP ${deleteAuditRes.statusCode}`,
      deleteAuditRes.statusCode === 405
    );

    const deleteAllAuditRes = await dispatch(appInstance, {
      method: 'DELETE',
      url: '/api/v1/audit-logs',
      headers: authHeaders.hr_admin,
    });
    recordTest(
      'Immutability: DELETE Collection Audit Log Blocked with 405',
      'HTTP 405 Method Not Allowed',
      `HTTP ${deleteAllAuditRes.statusCode}`,
      deleteAllAuditRes.statusCode === 405
    );

    // Step 27: Verify original audit document intact after tamper attempts
    const intactAuditDoc = await AuditLog.findOne({ id: newAuditId });
    recordTest(
      'Audit Document Intact and Unmodified in MongoDB',
      'action === REVIEW_PUBLISHED',
      `action === ${intactAuditDoc?.action}, details === ${intactAuditDoc?.details}`,
      intactAuditDoc !== null && intactAuditDoc.details === 'Review officially released to employee view by HR Admin'
    );
  } catch (error) {
    console.error('Fatal Test Runner Exception:', error);
    recordTest('Test Suite Exception Guard', 'No unhandled errors', error.message, false);
  } finally {
    await disconnectDatabase();
  }

  // Print Summary Table
  const total = testResults.length;
  const passed = testResults.filter((r) => r.status === 'PASSED').length;
  const failed = testResults.filter((r) => r.status === 'FAILED').length;

  console.log('\n======================================================');
  console.log(`MILESTONE 13 TEST RUN SUMMARY: ${passed}/${total} PASSED (${failed} FAILED)`);
  console.log('======================================================\n');

  if (failed > 0) {
    console.error(`❌ Suite failed with ${failed} broken assertions.`);
    process.exit(1);
  } else {
    console.log(`✅ All ${total} Milestone 13 assertions passed successfully.`);
    process.exit(0);
  }
}

runTestSuite();
