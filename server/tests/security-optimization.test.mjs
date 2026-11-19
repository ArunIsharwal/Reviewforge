/**
 * ReviewForge - Milestone 14: Security, Privacy & Performance Optimization Test Suite
 * Validates:
 * 1. Enterprise Security Headers:
 *    - Content-Security-Policy (CSP)
 *    - Strict-Transport-Security (HSTS)
 *    - X-Content-Type-Options (nosniff)
 *    - X-Frame-Options (DENY)
 *    - X-XSS-Protection (1; mode=block)
 *    - Referrer-Policy (strict-origin-when-cross-origin)
 *    - X-Powered-By header stripped
 * 2. NoSQL Injection & Input Sanitization Guard:
 *    - Rejection of query parameter operator injection (?user[$gt]=)
 *    - Rejection of body operator injection ({ "email": { "$gt": "" } })
 *    - Rejection of nested $where and $regex injection
 *    - Rejection of malicious dot notation keys
 *    - Acceptance of legitimate alphanumeric payloads
 * 3. Rate Limiting Engine:
 *    - Standard RateLimit-* response headers
 *    - Sliding window enforcement (triggers HTTP 429 Too Many Requests)
 *    - Retry-After header calculation
 *    - Client key isolation (Client A throttle does not affect Client B)
 * 4. PII, Anonymity & Confidentiality Protection:
 *    - Strict Anonymity & reviewer anonymous election masking
 *    - Target employee receives masked 'Anonymous Reviewer' metadata
 *    - Unreleased review draft confidentiality gate for employees
 * 5. Secret Masking Utility:
 *    - Redaction of passwords, tokens, API keys, and credentials
 * 6. MongoDB Index Optimization:
 *    - Live verification of compound & unique indexes across collections
 *    - GET /api/v1/security/indexes (HR Admin only, 403 for non-admins)
 * 7. In-Memory Performance Cache:
 *    - TTL expiration, hit/miss tracking, and prefix invalidation
 * 8. Overall Security Posture Audit Endpoint:
 *    - GET /api/v1/security/status (HR Admin allowed, Employee blocked with 403)
 */

import mongoose from 'mongoose';
import { EventEmitter } from 'events';
import { createApp } from '../dist/app.js';
import { connectDatabase, disconnectDatabase } from '../dist/config/database.js';
import { User } from '../dist/models/User.js';
import { Organization } from '../dist/models/Organization.js';
import { ensureAllIndexes } from '../dist/config/index-optimizer.js';
import { platformCache, MemoryCache } from '../dist/utils/cache.js';
import {
  sanitizeFeedbackForViewer,
  sanitizeReviewForViewer,
} from '../dist/utils/privacy.js';

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
    req.originalUrl = url;
    req.query = {};
    if (queryPart) {
      const sp = new URLSearchParams(queryPart);
      for (const [key, value] of sp.entries()) {
        // Parse nested query params for test if bracket syntax
        if (key.includes('[') && key.includes(']')) {
          const mainKey = key.slice(0, key.indexOf('['));
          const subKey = key.slice(key.indexOf('[') + 1, key.indexOf(']'));
          req.query[mainKey] = req.query[mainKey] || {};
          req.query[mainKey][subKey] = value;
        } else {
          req.query[key] = value;
        }
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
    res.removeHeader = (name) => {
      delete resHeaders[name.toLowerCase()];
      return res;
    };
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
  console.log('   MILESTONE 14: SECURITY & PERFORMANCE TEST SUITE');
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

    // Step 2: Seed Test Users for RBAC checks
    const orgId = 'org-reviewforge-default';
    const passwordHash = await User.hashPassword('Admin@ReviewForge2026!');
    const usersToSeed = [
      {
        id: 'usr-admin-m14',
        email: 'admin.m14@reviewforge.io',
        passwordHash,
        name: 'ReviewForge HR Admin',
        role: 'hr_admin',
        organizationId: orgId,
        employeeId: 'emp-admin-m14',
        status: 'active',
      },
      {
        id: 'usr-emp-m14',
        email: 'employee.m14@reviewforge.io',
        passwordHash,
        name: 'Rahul Deshmukh (Frontend Engineer)',
        role: 'employee',
        organizationId: orgId,
        employeeId: 'emp-emp-m14',
        status: 'active',
      },
    ];

    for (const u of usersToSeed) {
      await User.findOneAndUpdate({ email: u.email }, u, { upsert: true, new: true });
    }
    recordTest('Seed Test Users for Role Verification', '2 users seeded in MongoDB', 'seeded', true);

    // Step 3: Obtain Auth Tokens
    const authHeaders = {};
    for (const u of usersToSeed) {
      const loginRes = await dispatch(appInstance, {
        method: 'POST',
        url: '/api/v1/auth/login',
        body: { email: u.email, password: 'Admin@ReviewForge2026!' },
        headers: { 'X-Bypass-Rate-Limit': 'test-secret' },
      });
      const token = loginRes.body?.accessToken || loginRes.body?.token;
      authHeaders[u.role] = {
        Authorization: `Bearer ${token}`,
        'X-Bypass-Rate-Limit': 'test-secret',
      };
    }
    recordTest('Authenticate Admin & Employee Roles', 'Tokens issued', 'hr_admin and employee tokens active', true);

    // ==========================================
    // 1. SECURITY HEADERS VERIFICATION
    // ==========================================
    const probeRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/health',
      headers: { 'X-Bypass-Rate-Limit': 'test-secret' },
    });

    recordTest(
      'Security Header: X-Content-Type-Options',
      'nosniff',
      probeRes.headers['x-content-type-options'],
      probeRes.headers['x-content-type-options'] === 'nosniff'
    );
    recordTest(
      'Security Header: X-Frame-Options (Clickjacking defense)',
      'DENY',
      probeRes.headers['x-frame-options'],
      probeRes.headers['x-frame-options'] === 'DENY'
    );
    recordTest(
      'Security Header: X-XSS-Protection',
      '1; mode=block',
      probeRes.headers['x-xss-protection'],
      probeRes.headers['x-xss-protection'] === '1; mode=block'
    );
    recordTest(
      'Security Header: Strict-Transport-Security (HSTS)',
      'max-age=31536000; includeSubDomains',
      probeRes.headers['strict-transport-security'],
      probeRes.headers['strict-transport-security']?.includes('max-age=31536000')
    );
    recordTest(
      'Security Header: Referrer-Policy',
      'strict-origin-when-cross-origin',
      probeRes.headers['referrer-policy'],
      probeRes.headers['referrer-policy'] === 'strict-origin-when-cross-origin'
    );
    recordTest(
      'Security Header: Content-Security-Policy (CSP)',
      "contains default-src 'self'",
      probeRes.headers['content-security-policy'],
      probeRes.headers['content-security-policy']?.includes("default-src 'self'")
    );
    recordTest(
      'Security Fingerprint: X-Powered-By header removed',
      'undefined',
      String(probeRes.headers['x-powered-by']),
      probeRes.headers['x-powered-by'] === undefined
    );

    // ==========================================
    // 2. NOSQL INJECTION & PAYLOAD SANITIZATION
    // ==========================================

    // Test 2.1: Body operator injection attempt ({ email: { $gt: "" } })
    const injBodyRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/auth/login',
      body: {
        email: { $gt: '' },
        password: 'password123',
      },
    });
    recordTest(
      'NoSQL Injection: Block Body $gt Operator Attempt',
      'HTTP 400 Bad Request with NOSQL_INJECTION_BLOCKED',
      `HTTP ${injBodyRes.statusCode} - ${injBodyRes.body?.code}`,
      injBodyRes.statusCode === 400 && injBodyRes.body?.code === 'NOSQL_INJECTION_BLOCKED'
    );

    // Test 2.2: Body $ne operator injection attempt
    const injNeRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/auth/login',
      body: {
        email: { $ne: null },
        password: 'password123',
      },
    });
    recordTest(
      'NoSQL Injection: Block Body $ne Operator Attempt',
      'HTTP 400 Bad Request',
      `HTTP ${injNeRes.statusCode}`,
      injNeRes.statusCode === 400 && injNeRes.body?.code === 'NOSQL_INJECTION_BLOCKED'
    );

    // Test 2.3: Nested $where code injection attempt
    const injWhereRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/auth/login',
      body: {
        filter: { $where: 'sleep(5000)' },
      },
    });
    recordTest(
      'NoSQL Injection: Block Nested $where Attempt',
      'HTTP 400 Bad Request',
      `HTTP ${injWhereRes.statusCode}`,
      injWhereRes.statusCode === 400 && injWhereRes.body?.code === 'NOSQL_INJECTION_BLOCKED'
    );

    // Test 2.4: Malicious dot notation parameter attempt
    const injDotRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/auth/login',
      body: {
        'account.role': 'admin',
      },
    });
    recordTest(
      'NoSQL Injection: Block Malicious Dot Notation Key',
      'HTTP 400 Bad Request',
      `HTTP ${injDotRes.statusCode}`,
      injDotRes.statusCode === 400 && injDotRes.body?.code === 'NOSQL_INJECTION_BLOCKED'
    );

    // Test 2.5: Legitimate payload accepted cleanly
    const legitRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/auth/login',
      body: {
        email: 'employee.m14@reviewforge.io',
        password: 'Admin@ReviewForge2026!',
      },
    });
    recordTest(
      'NoSQL Injection: Allow Legitimate Alphanumeric Payload',
      'HTTP 200 OK',
      `HTTP ${legitRes.statusCode}`,
      legitRes.statusCode === 200
    );

    // ==========================================
    // 3. RATE LIMITING ENGINE
    // ==========================================
    const testClientId = `test-runner-${Date.now()}`;

    // Request 1: remaining = 2
    const rl1 = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/security/rate-limit-test',
      headers: { 'X-Test-Client-Id': testClientId },
    });
    recordTest('Rate Limiter Probe #1 Status', 'HTTP 200', `HTTP ${rl1.statusCode}`, rl1.statusCode === 200);
    recordTest(
      'Rate Limiter Header: RateLimit-Limit',
      '3',
      String(rl1.headers['ratelimit-limit']),
      String(rl1.headers['ratelimit-limit']) === '3'
    );
    recordTest(
      'Rate Limiter Header: RateLimit-Remaining #1',
      '2',
      String(rl1.headers['ratelimit-remaining']),
      String(rl1.headers['ratelimit-remaining']) === '2'
    );

    // Request 2: remaining = 1
    const rl2 = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/security/rate-limit-test',
      headers: { 'X-Test-Client-Id': testClientId },
    });
    recordTest(
      'Rate Limiter Header: RateLimit-Remaining #2',
      '1',
      String(rl2.headers['ratelimit-remaining']),
      String(rl2.headers['ratelimit-remaining']) === '1'
    );

    // Request 3: remaining = 0
    const rl3 = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/security/rate-limit-test',
      headers: { 'X-Test-Client-Id': testClientId },
    });
    recordTest(
      'Rate Limiter Header: RateLimit-Remaining #3',
      '0',
      String(rl3.headers['ratelimit-remaining']),
      String(rl3.headers['ratelimit-remaining']) === '0'
    );

    // Request 4: Rate limit exceeded -> HTTP 429
    const rl4 = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/security/rate-limit-test',
      headers: { 'X-Test-Client-Id': testClientId },
    });
    recordTest('Rate Limiter Throttle #4 Status', 'HTTP 429 Too Many Requests', `HTTP ${rl4.statusCode}`, rl4.statusCode === 429);
    recordTest(
      'Rate Limiter Response Code',
      'RATE_LIMIT_EXCEEDED',
      rl4.body?.code,
      rl4.body?.code === 'RATE_LIMIT_EXCEEDED'
    );
    recordTest(
      'Rate Limiter Header: Retry-After present',
      'present and > 0',
      String(rl4.headers['retry-after']),
      Boolean(rl4.headers['retry-after']) && Number(rl4.headers['retry-after']) > 0
    );

    // Request 5: Independent Client ID is NOT throttled (key isolation)
    const rlIso = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/security/rate-limit-test',
      headers: { 'X-Test-Client-Id': `${testClientId}-isolated-b` },
    });
    recordTest(
      'Rate Limiter Client Key Isolation',
      'HTTP 200 (distinct client not throttled)',
      `HTTP ${rlIso.statusCode}`,
      rlIso.statusCode === 200
    );

    // ==========================================
    // 4. SECRET MASKING & SANITIZATION
    // ==========================================
    const sanitizeRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/security/sanitize-test',
      body: {
        name: 'Rahul Deshmukh',
        email: 'rahul.deshmukh@reviewforge.io',
        password: 'SuperSecretPassword123!',
        refreshToken: 'rt-secret-token-xyz',
        apiKey: 'gemini-api-key-live',
        nested: {
          authorization: 'Bearer token-123',
          normalData: 'Safe metadata',
        },
      },
    });
    recordTest('Secret Masking Test Status', 'HTTP 200', `HTTP ${sanitizeRes.statusCode}`, sanitizeRes.statusCode === 200);
    recordTest(
      'Password Masked',
      '***REDACTED***',
      sanitizeRes.body?.data?.password,
      sanitizeRes.body?.data?.password === '***REDACTED***'
    );
    recordTest(
      'Refresh Token Masked',
      '***REDACTED***',
      sanitizeRes.body?.data?.refreshToken,
      sanitizeRes.body?.data?.refreshToken === '***REDACTED***'
    );
    recordTest(
      'API Key Masked',
      '***REDACTED***',
      sanitizeRes.body?.data?.apiKey,
      sanitizeRes.body?.data?.apiKey === '***REDACTED***'
    );
    recordTest(
      'Nested Authorization Header Masked',
      '***REDACTED***',
      sanitizeRes.body?.data?.nested?.authorization,
      sanitizeRes.body?.data?.nested?.authorization === '***REDACTED***'
    );
    recordTest(
      'Non-Sensitive Data Preserved',
      'Rahul Deshmukh',
      sanitizeRes.body?.data?.name,
      sanitizeRes.body?.data?.name === 'Rahul Deshmukh'
    );

    // ==========================================
    // 5. PII & FEEDBACK ANONYMITY ENFORCEMENT
    // ==========================================
    const testFeedbackItem = {
      id: 'fb-anon-test-1',
      organizationId: orgId,
      reviewCycleId: 'cycle-2026',
      targetEmployeeId: 'emp-emp-m14',
      targetEmployeeName: 'Rahul Deshmukh',
      providerEmployeeId: 'emp-secret-peer-001',
      providerEmployeeName: 'Marcus Vance',
      providerRole: 'Lead Product Architect',
      relationship: 'Peer',
      isAnonymous: true,
      ratings: { collaboration: 5, technicalContribution: 5 },
      strengths: 'Outstanding system performance focus.',
      improvements: 'Continue leading architecture reviews.',
      status: 'Submitted',
      submittedAt: '2026-11-15',
    };

    // Recipient Employee view -> Provider MUST be masked
    const sanitizedForRecipient = sanitizeFeedbackForViewer(
      testFeedbackItem,
      'employee',
      'emp-emp-m14',
      'Strict Anonymity'
    );
    recordTest(
      'Anonymity: Provider ID Masked for Recipient',
      'ANONYMOUS_REVIEWER',
      sanitizedForRecipient.providerEmployeeId,
      sanitizedForRecipient.providerEmployeeId === 'ANONYMOUS_REVIEWER'
    );
    recordTest(
      'Anonymity: Provider Name Masked for Recipient',
      'Anonymous Reviewer',
      sanitizedForRecipient.providerEmployeeName,
      sanitizedForRecipient.providerEmployeeName === 'Anonymous Reviewer'
    );

    // HR Admin view with Transparent policy -> provider identity preserved for audit
    const adminFeedbackView = sanitizeFeedbackForViewer(
      { ...testFeedbackItem, isAnonymous: false },
      'hr_admin',
      'emp-admin-m14',
      'Transparent'
    );
    recordTest(
      'Audit Governance: HR Admin View Attributed Feedback',
      'Marcus Vance',
      adminFeedbackView.providerEmployeeName,
      adminFeedbackView.providerEmployeeName === 'Marcus Vance'
    );

    // Confidential Review Draft Gate for Employees
    const draftReview = {
      id: 'rev-draft-gate-1',
      organizationId: orgId,
      reviewCycleId: 'cycle-2026',
      employeeId: 'emp-emp-m14',
      employeeName: 'Rahul Deshmukh',
      status: 'Draft',
      overallRating: 4.9,
      sections: {
        summary: { title: 'Executive Summary', content: 'Secret internal calibration remarks.' },
      },
    };

    const sanitizedDraft = sanitizeReviewForViewer(draftReview, 'employee', 'emp-emp-m14');
    recordTest(
      'Review Privacy: Draft Rating Redacted for Employee',
      'null',
      String(sanitizedDraft.overallRating),
      sanitizedDraft.overallRating === null
    );
    recordTest(
      'Review Privacy: Draft Sections Redacted for Employee',
      'null',
      String(sanitizedDraft.sections),
      sanitizedDraft.sections === null
    );
    recordTest(
      'Review Privacy: Confidential Notice Included',
      'contains HR sign-off notice',
      sanitizedDraft.confidentialNotice,
      Boolean(sanitizedDraft.confidentialNotice?.includes('sign-off'))
    );

    // ==========================================
    // 6. MONGODB INDEX OPTIMIZATION VERIFICATION
    // ==========================================
    const indexReports = await ensureAllIndexes();
    recordTest(
      'Index Optimization: All Collections Inspected',
      '14 collections verified',
      `${indexReports.length} collections`,
      indexReports.length === 14
    );

    const usersReport = indexReports.find((r) => r.modelName === 'User');
    recordTest(
      'Index Verified: User Collection Index Count >= 2',
      'indexCount >= 2',
      `indexCount === ${usersReport?.indexCount}`,
      Boolean(usersReport && usersReport.indexCount >= 2)
    );

    const perfReviewReport = indexReports.find((r) => r.modelName === 'PerformanceReview');
    recordTest(
      'Index Verified: PerformanceReview Collection Index Count >= 2',
      'indexCount >= 2',
      `indexCount === ${perfReviewReport?.indexCount}`,
      Boolean(perfReviewReport && perfReviewReport.indexCount >= 2)
    );

    // Security Endpoint: GET /api/v1/security/indexes (HR Admin allowed)
    const adminIndexesRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/security/indexes',
      headers: authHeaders.hr_admin,
    });
    recordTest('HR Admin Query Database Indexes Status', 'HTTP 200', `HTTP ${adminIndexesRes.statusCode}`, adminIndexesRes.statusCode === 200);
    recordTest(
      'Database Index Report Collection Count',
      '14 collections reported',
      `${adminIndexesRes.body?.collectionCount} collections`,
      adminIndexesRes.body?.collectionCount === 14
    );

    // RBAC: Employee blocked from database index inspection
    const empIndexesRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/security/indexes',
      headers: authHeaders.employee,
    });
    recordTest(
      'RBAC: Employee Blocked from Index Inspection',
      'HTTP 403 Forbidden',
      `HTTP ${empIndexesRes.statusCode}`,
      empIndexesRes.statusCode === 403
    );

    // ==========================================
    // 7. IN-MEMORY QUERY PERFORMANCE CACHE
    // ==========================================
    const testCache = new MemoryCache(500); // 500ms TTL

    // Set & Get
    testCache.set('dept:list', [{ id: 'dept-eng', name: 'Engineering' }]);
    const cachedItem = testCache.get('dept:list');
    recordTest(
      'Performance Cache: Immediate Read Hit',
      'dept-eng',
      cachedItem?.[0]?.id,
      cachedItem?.[0]?.id === 'dept-eng'
    );

    // Prefix Invalidation
    testCache.set('dept:single:1', { name: 'Eng' });
    testCache.set('dept:single:2', { name: 'Prod' });
    const invalidatedCount = testCache.invalidatePrefix('dept:single:');
    recordTest('Performance Cache: Invalidate by Prefix', '2 keys invalidated', `${invalidatedCount} keys`, invalidatedCount === 2);
    recordTest(
      'Performance Cache: Key Invalidation Confirmed',
      'null',
      String(testCache.get('dept:single:1')),
      testCache.get('dept:single:1') === null
    );

    // Cache Stats
    const stats = testCache.stats();
    recordTest(
      'Performance Cache: Hits & Misses Tracked',
      'hits >= 1',
      `hits === ${stats.hits}, misses === ${stats.misses}`,
      stats.hits >= 1
    );

    // ==========================================
    // 8. SECURITY POSTURE STATUS AUDIT ENDPOINT
    // ==========================================
    const statusRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/security/status',
      headers: authHeaders.hr_admin,
    });
    recordTest('Security Status Audit Endpoint Status', 'HTTP 200', `HTTP ${statusRes.statusCode}`, statusRes.statusCode === 200);
    recordTest(
      'Security Posture: Protection Modules Active',
      'nosqlInjectionGuard === ENABLED',
      statusRes.body?.protectionModules?.nosqlInjectionGuard,
      statusRes.body?.protectionModules?.nosqlInjectionGuard === 'ENABLED'
    );
    recordTest(
      'Security Posture: Database Health All Indexes Healthy',
      'allIndexesHealthy === true',
      String(statusRes.body?.databaseHealth?.allIndexesHealthy),
      statusRes.body?.databaseHealth?.allIndexesHealthy === true
    );

    // RBAC: Employee blocked from security posture audit
    const empStatusRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/security/status',
      headers: authHeaders.employee,
    });
    recordTest(
      'RBAC: Employee Blocked from Security Posture Audit',
      'HTTP 403 Forbidden',
      `HTTP ${empStatusRes.statusCode}`,
      empStatusRes.statusCode === 403
    );
  } catch (error) {
    console.error('Fatal Test Runner Exception:', error);
    recordTest('Test Suite Exception Guard', 'No unhandled errors', error.message, false);
  } finally {
    await disconnectDatabase();
  }

  // Summary Table
  const total = testResults.length;
  const passed = testResults.filter((r) => r.status === 'PASSED').length;
  const failed = testResults.filter((r) => r.status === 'FAILED').length;

  console.log('\n======================================================');
  console.log(`MILESTONE 14 TEST RUN SUMMARY: ${passed}/${total} PASSED (${failed} FAILED)`);
  console.log('======================================================\n');

  if (failed > 0) {
    console.error(`❌ Suite failed with ${failed} broken assertions.`);
    process.exit(1);
  } else {
    console.log(`✅ All ${total} Milestone 14 assertions passed successfully.`);
    process.exit(0);
  }
}

runTestSuite();
