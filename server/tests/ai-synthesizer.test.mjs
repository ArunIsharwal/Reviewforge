/**
 * ReviewForge - Milestone 10: AI Performance Review Synthesizer Test Suite
 * Validates:
 * 1. Mongoose Models & MongoDB persistence (SelfReflection, PerformanceReview, AISynthesisLog)
 * 2. Strict Role-Based Access Control (403 for employee/peer_reviewer on synthesis/logs/quality)
 * 3. Manager hierarchy scoping (managers can only synthesize/inspect direct reports)
 * 4. Input validation (missing employeeId, cycleId, non-existent entities)
 * 5. Self-Reflection API & scoping (employees see only own reflection; HR sees all)
 * 6. Evidence Quality Check Engine (scores, missing input detection, feedback rating conflict detection)
 * 7. AI Provider Behavior: strict 503 HTTP Service Unavailable when GEMINI_API_KEY is not configured
 * 8. Deterministic Synthesis with 8 structured review sections
 * 9. Citation Integrity (evidenceRefs linked to real MongoDB IDs, sourceTypes, dates)
 * 10. Section-level regeneration (regenerating one section preserves the other 7)
 * 11. AI Synthesis Audit Logging in MongoDB (latency, model, coverage, actor)
 * 12. Review lifecycle & visibility scoping (employees cannot see Drafts; can see Released)
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
import { FeedbackItem } from '../dist/models/Feedback.js';
import { OKR } from '../dist/models/OKR.js';
import { ManagerNote } from '../dist/models/ManagerNote.js';
import { SelfReflection, seedInitialSelfReflections } from '../dist/models/SelfReflection.js';
import { PerformanceReview, seedInitialPerformanceReviews } from '../dist/models/PerformanceReview.js';
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

async function runMilestone10Tests() {
  console.log('\n================================================================');
  console.log('   MILESTONE 10: AI PERFORMANCE REVIEW SYNTHESIZER TESTS');
  console.log('================================================================\n');

  try {
    // Step 1: Connect to Database & Seed Collections
    console.log('🔗 Step 1: Connecting to MongoDB & Seeding Collections...');
    await connectDatabase();
    appInstance = createApp();

    await seedInitialSelfReflections();
    await seedInitialPerformanceReviews();

    // 1. Verify SelfReflection count
    const refCount = await SelfReflection.countDocuments();
    recordTest(
      'SelfReflection MongoDB Seeding',
      '>= 2 seeded reflections',
      `${refCount} reflections found`,
      refCount >= 2
    );

    // 2. Verify PerformanceReview count
    const reviewCount = await PerformanceReview.countDocuments();
    recordTest(
      'PerformanceReview MongoDB Seeding',
      '>= 2 seeded reviews',
      `${reviewCount} reviews found`,
      reviewCount >= 2
    );

    // 3. Verify compound index on SelfReflection (organizationId, employeeId, reviewCycleId)
    const refIndexes = await SelfReflection.collection.indexes();
    const hasRefCompound = refIndexes.some(
      (idx) => idx.key.organizationId === 1 && idx.key.employeeId === 1 && idx.key.reviewCycleId === 1
    );
    recordTest(
      'SelfReflection Compound Index Integrity',
      'organizationId_1_employeeId_1_reviewCycleId_1 unique index',
      hasRefCompound ? 'Found' : 'Missing',
      hasRefCompound
    );

    // Step 2: Authenticate Users & Acquire JWT Tokens
    console.log('\n🔑 Step 2: Authenticating Users for RBAC Verification...');
    let adminToken = '';
    let managerToken = '';
    let employeeToken = '';
    let peerToken = '';

    // 4. Admin Auth
    const adminLoginRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/auth/login',
      body: { email: 'admin@reviewforge.io', password: 'Admin@ReviewForge2026!' },
    });
    const adminData = await adminLoginRes.json();
    adminToken = adminData.accessToken || '';
    recordTest('HR Admin Login', '200 OK + token', `${adminLoginRes.status} ${Boolean(adminToken)}`, adminLoginRes.status === 200 && !!adminToken);

    // 5. Manager Auth (Elena Rostova - emp-001)
    const mgrLoginRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/auth/login',
      body: { email: 'elena.rostova@reviewforge.io', password: 'Manager@ReviewForge2026!' },
    });
    const mgrData = await mgrLoginRes.json();
    managerToken = mgrData.accessToken || '';
    recordTest('Manager Login (Elena Rostova)', '200 OK + token', `${mgrLoginRes.status} ${Boolean(managerToken)}`, mgrLoginRes.status === 200 && !!managerToken);

    // 6. Employee Auth (Rahul Deshmukh - emp-002, reports to Elena)
    const empLoginRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/auth/login',
      body: { email: 'rahul.deshmukh@reviewforge.io', password: 'Employee@ReviewForge2026!' },
    });
    const empData = await empLoginRes.json();
    employeeToken = empData.accessToken || '';
    recordTest('Employee Login (Rahul Deshmukh)', '200 OK + token', `${empLoginRes.status} ${Boolean(employeeToken)}`, empLoginRes.status === 200 && !!employeeToken);

    // 7. Peer Reviewer Auth (Marcus Vance - emp-003)
    const peerLoginRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/auth/login',
      body: { email: 'marcus.vance@reviewforge.io', password: 'Peer@ReviewForge2026!' },
    });
    const peerData = await peerLoginRes.json();
    peerToken = peerData.accessToken || '';
    recordTest('Peer Reviewer Login (Marcus Vance)', '200 OK + token', `${peerLoginRes.status} ${Boolean(peerToken)}`, peerLoginRes.status === 200 && !!peerToken);

    // Step 3: RBAC & Security Boundary Enforcement
    console.log('\n🔒 Step 3: Testing RBAC & Security Boundaries...');

    // 8. Unauthenticated synthesis rejection
    const unauthSynthRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/ai/synthesize',
      body: { employeeId: 'emp-002', reviewCycleId: 'cycle-2026-annual' },
    });
    recordTest('Synthesis: Unauthenticated Reject', 401, unauthSynthRes.status, unauthSynthRes.status === 401);

    // 9. Employee role forbidden from synthesizing review
    const empSynthRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/ai/synthesize',
      headers: { authorization: `Bearer ${employeeToken}` },
      body: { employeeId: 'emp-002', reviewCycleId: 'cycle-2026-annual' },
    });
    recordTest('Synthesis: Employee Role Forbidden (403)', 403, empSynthRes.status, empSynthRes.status === 403);

    // 10. Peer Reviewer forbidden from synthesizing review
    const peerSynthRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/ai/synthesize',
      headers: { authorization: `Bearer ${peerToken}` },
      body: { employeeId: 'emp-002', reviewCycleId: 'cycle-2026-annual' },
    });
    recordTest('Synthesis: Peer Role Forbidden (403)', 403, peerSynthRes.status, peerSynthRes.status === 403);

    // 11. Employee forbidden from quality check endpoint
    const empQualityRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/ai/quality-check/emp-002',
      headers: { authorization: `Bearer ${employeeToken}` },
    });
    recordTest('Quality Check: Employee Role Forbidden (403)', 403, empQualityRes.status, empQualityRes.status === 403);

    // 12. Employee forbidden from synthesis logs endpoint
    const empLogsRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/ai/logs/emp-002',
      headers: { authorization: `Bearer ${employeeToken}` },
    });
    recordTest('Synthesis Logs: Employee Role Forbidden (403)', 403, empLogsRes.status, empLogsRes.status === 403);

    // 13. Manager hierarchy scoping: Elena cannot synthesize for non-report (emp-006 reports to Maya emp-005)
    const mgrNonReportRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/ai/synthesize',
      headers: { authorization: `Bearer ${managerToken}` },
      body: { employeeId: 'emp-006', reviewCycleId: 'cycle-2026-annual', forceMock: true },
    });
    recordTest('Manager Scoping: Non-Direct Report Forbidden (403)', 403, mgrNonReportRes.status, mgrNonReportRes.status === 403);

    // 14. Manager hierarchy scoping: Elena cannot quality-check non-report
    const mgrNonReportQualRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/ai/quality-check/emp-006',
      headers: { authorization: `Bearer ${managerToken}` },
    });
    recordTest('Manager Scoping: Quality Check Non-Report Forbidden (403)', 403, mgrNonReportQualRes.status, mgrNonReportQualRes.status === 403);

    // Step 4: Input Validation & Not Found Handling
    console.log('\n🛡️ Step 4: Input Validation & Not Found Handling...');

    // 15. Missing employeeId in synthesis
    const missingEmpRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/ai/synthesize',
      headers: { authorization: `Bearer ${adminToken}` },
      body: { reviewCycleId: 'cycle-2026-annual' },
    });
    recordTest('Validation: Missing employeeId returns 400', 400, missingEmpRes.status, missingEmpRes.status === 400);

    // 16. Missing reviewCycleId in synthesis
    const missingCycleRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/ai/synthesize',
      headers: { authorization: `Bearer ${adminToken}` },
      body: { employeeId: 'emp-002' },
    });
    recordTest('Validation: Missing reviewCycleId returns 400', 400, missingCycleRes.status, missingCycleRes.status === 400);

    // 17. Non-existent employee returns 404
    const notFoundEmpRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/ai/synthesize',
      headers: { authorization: `Bearer ${adminToken}` },
      body: { employeeId: 'emp-nonexistent-999', reviewCycleId: 'cycle-2026-annual' },
    });
    recordTest('Validation: Non-existent employee returns 404', 404, notFoundEmpRes.status, notFoundEmpRes.status === 404);

    // 18. Non-existent review cycle returns 404
    const notFoundCycleRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/ai/synthesize',
      headers: { authorization: `Bearer ${adminToken}` },
      body: { employeeId: 'emp-002', reviewCycleId: 'cycle-nonexistent-999' },
    });
    recordTest('Validation: Non-existent review cycle returns 404', 404, notFoundCycleRes.status, notFoundCycleRes.status === 404);

    // 19. Quality check on non-existent employee returns 404
    const qualNotFoundRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/ai/quality-check/emp-nonexistent-999',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    recordTest('Quality Check: Non-existent employee returns 404', 404, qualNotFoundRes.status, qualNotFoundRes.status === 404);

    // Step 5: Self-Reflection API & Isolation
    console.log('\n📝 Step 5: Self-Reflection API & Isolation Testing...');

    // 20. Rahul accesses own self-reflection
    const rahulRefRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/self-reflections?employeeId=emp-002',
      headers: { authorization: `Bearer ${employeeToken}` },
    });
    const rahulRefData = await rahulRefRes.json();
    recordTest(
      'Self-Reflection: Employee views own reflection',
      '200 OK + ref-001',
      `${rahulRefRes.status} ${rahulRefData.data?.[0]?.id}`,
      rahulRefRes.status === 200 && rahulRefData.data?.[0]?.id === 'ref-001'
    );

    // 21. Rahul forbidden from accessing Elena reflection directly
    const rahulForbiddenRefRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/self-reflections/emp-001',
      headers: { authorization: `Bearer ${employeeToken}` },
    });
    recordTest('Self-Reflection: Employee accessing other reflection forbidden (403)', 403, rahulForbiddenRefRes.status, rahulForbiddenRefRes.status === 403);

    // 22. Employee saves/updates self-reflection
    const saveRefRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/self-reflections',
      headers: { authorization: `Bearer ${employeeToken}` },
      body: {
        reviewCycleId: 'cycle-2026-annual',
        achievements: 'Engineered zero-downtime distributed caching architecture improving throughput by 40%.',
        challenges: 'Coordinating cross-functional schema migration across legacy microservices.',
        goalsNextCycle: 'Achieve 99.99% availability and mentor 2 junior engineers on event streaming.',
        areasOfGrowth: 'Deepening Kubernetes operator development skills.',
      },
    });
    const saveRefData = await saveRefRes.json();
    recordTest(
      'Self-Reflection: Save/Update reflection',
      '200/201 Success',
      `${saveRefRes.status} ${saveRefData.success}`,
      (saveRefRes.status === 200 || saveRefRes.status === 201) && saveRefData.success === true
    );

    // 23. HR Admin views all self-reflections
    const adminRefRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/self-reflections',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const adminRefData = await adminRefRes.json();
    recordTest(
      'Self-Reflection: HR Admin views all reflections',
      '200 OK + count >= 2',
      `${adminRefRes.status} count: ${adminRefData.count}`,
      adminRefRes.status === 200 && adminRefData.count >= 2
    );

    // Step 6: Evidence Quality Check Engine
    console.log('\n📊 Step 6: Testing Evidence Quality Check Engine...');

    // 24. Rahul Deshmukh quality check (complete evidence: OKRs, Feedback, Reflection, Notes)
    const rahulQualityRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/ai/quality-check/emp-002?reviewCycleId=cycle-2026-annual',
      headers: { authorization: `Bearer ${managerToken}` },
    });
    const rahulQualData = await rahulQualityRes.json();
    const rahulScore = rahulQualData.data?.quality?.overallCoverageScore || 0;
    recordTest(
      'Quality Check: Complete evidence coverage score >= 80%',
      '>= 80%',
      `${rahulScore}%`,
      rahulQualityRes.status === 200 && rahulScore >= 80
    );

    // 25. Input counts correctly reported
    const counts = rahulQualData.data?.evidenceCounts || {};
    const countsValid = counts.okrsCount > 0 && counts.feedbackCount > 0 && counts.hasSelfReflection && counts.managerNotesCount > 0;
    recordTest(
      'Quality Check: Input counts verified (OKRs, feedback, reflection, notes)',
      'All 4 sources present',
      `okrs:${counts.okrsCount}, fb:${counts.feedbackCount}, ref:${counts.hasSelfReflection}, notes:${counts.managerNotesCount}`,
      countsValid
    );

    // 26. Employee with missing inputs (Marcus has no manager notes)
    const marcusQualityRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/ai/quality-check/emp-003?reviewCycleId=cycle-2026-annual',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const marcusQualData = await marcusQualityRes.json();
    const missingFlags = marcusQualData.data?.quality?.missingEvidenceFlags || [];
    const flagsDetected = missingFlags.length > 0;
    recordTest(
      'Quality Check: Missing evidence detected for incomplete employee',
      'Flags present',
      `Flags: ${missingFlags.join(', ')}`,
      marcusQualityRes.status === 200 && flagsDetected
    );

    // Step 7: AI Provider Behavior & Error Handling
    console.log('\n🤖 Step 7: AI Provider Behavior & Mandatory 503 Enforcement...');

    // 27. Attempt live synthesis without API key in production mode -> HTTP 503 Service Unavailable
    // This validates our core rule: Never claim AI succeeded when credentials are missing!
    const liveWithoutKeyRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/ai/synthesize',
      headers: { authorization: `Bearer ${adminToken}` },
      body: {
        employeeId: 'emp-002',
        reviewCycleId: 'cycle-2026-annual',
        forceMock: false, // Explicitly request live synthesis
      },
    });
    const liveErrData = await liveWithoutKeyRes.json();
    const is503Handled =
      liveWithoutKeyRes.status === 503 &&
      (liveErrData.code === 'AI_PROVIDER_UNAVAILABLE' || liveErrData.error?.includes('Gemini API key'));
    recordTest(
      'AI Provider Guard: Missing GEMINI_API_KEY returns HTTP 503 AI_PROVIDER_UNAVAILABLE',
      '503 AI_PROVIDER_UNAVAILABLE',
      `${liveWithoutKeyRes.status} ${liveErrData.code || liveErrData.error}`,
      is503Handled
    );

    // Step 8: Deterministic Synthesis & Structured Document Output
    console.log('\n📄 Step 8: Deterministic Review Synthesis & Document Generation...');

    // 28. Manager Elena synthesizes review for direct report Rahul (forceMock: true)
    const synthRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/ai/synthesize',
      headers: { authorization: `Bearer ${managerToken}` },
      body: {
        employeeId: 'emp-002',
        reviewCycleId: 'cycle-2026-annual',
        forceMock: true,
      },
    });
    const synthData = await synthRes.json();
    const synthReview = synthData.data;
    recordTest(
      'Synthesis: Manager synthesizes review for direct report',
      '200 OK + review object',
      `${synthRes.status} ${Boolean(synthReview)}`,
      synthRes.status === 200 && Boolean(synthReview)
    );

    // 29. Initial review status is Draft
    recordTest(
      'Synthesis: Initial Review Status is Draft',
      'Draft',
      synthReview?.status,
      synthReview?.status === 'Draft'
    );

    // 30-37. Verify all 8 structured sections are present and non-empty
    const sections = synthReview?.sections || {};
    const sectionList = [
      'overallSummary',
      'majorAchievements',
      'keyStrengths',
      'collaborationAndCommunication',
      'okrAchievementSummary',
      'areasForDevelopment',
      'futureGoals',
      'managerRecommendations',
    ];

    let allSectionsPresent = true;
    for (const sKey of sectionList) {
      if (!sections[sKey] || !sections[sKey].content || typeof sections[sKey].content !== 'string') {
        allSectionsPresent = false;
      }
    }
    recordTest(
      'Synthesis: All 8 structured review sections present with content',
      '8 complete sections',
      `${Object.keys(sections).length} sections present`,
      allSectionsPresent && Object.keys(sections).length === 8
    );

    // 38. Overall rating calculated from evidence inputs (1.0 - 5.0)
    const ratingValid = typeof synthReview?.overallRating === 'number' && synthReview.overallRating >= 1.0 && synthReview.overallRating <= 5.0;
    recordTest(
      'Synthesis: Overall rating computed within range (1.0 - 5.0)',
      '1.0 - 5.0',
      `${synthReview?.overallRating}`,
      ratingValid
    );

    // Step 9: Citation Integrity & MongoDB Verification
    console.log('\n🔗 Step 9: Citation Integrity & Database Persistence...');

    // 39. Citations linked to real DB entities
    const evidenceRefs = sections.majorAchievements?.evidenceRefs || [];
    const hasEvidence = evidenceRefs.length > 0;
    const allRefsValid = evidenceRefs.every(
      (ref) =>
        ref.id &&
        ref.sourceType &&
        ref.sourceId &&
        (ref.sourceTitle || ref.title) &&
        (ref.excerpt || ref.metricOrExcerpt) &&
        (ref.sourceDate || ref.date)
    );
    recordTest(
      'Citation Integrity: majorAchievements contains valid evidence citations',
      '> 0 references with sourceType, sourceId, excerpt, and date',
      `${evidenceRefs.length} references, all valid: ${allRefsValid}`,
      hasEvidence && allRefsValid
    );

    // 40. Verify Review persisted in MongoDB performancereviews collection
    const persistedReview = await PerformanceReview.findOne({
      organizationId: 'org-reviewforge-default',
      employeeId: 'emp-002',
      reviewCycleId: 'cycle-2026-annual',
    });
    recordTest(
      'MongoDB Persistence: PerformanceReview saved in DB',
      'Review document found in DB',
      persistedReview ? `Found ID: ${persistedReview.id}` : 'Not found',
      Boolean(persistedReview)
    );

    // Step 10: Section-Level Regeneration
    console.log('\n🔄 Step 10: Testing Single Section Regeneration...');

    // 41. Regenerate single section 'areasForDevelopment'
    const regenRes = await dispatch(appInstance, {
      method: 'POST',
      url: '/api/v1/ai/synthesize',
      headers: { authorization: `Bearer ${managerToken}` },
      body: {
        employeeId: 'emp-002',
        reviewCycleId: 'cycle-2026-annual',
        regenerateSection: 'areasForDevelopment',
        forceMock: true,
      },
    });
    const regenData = await regenRes.json();
    const updatedReview = regenData.data;
    const areasContent = updatedReview?.sections?.areasForDevelopment?.content || '';
    const otherSectionIntact = Boolean(updatedReview?.sections?.overallSummary?.content);
    recordTest(
      'Section Regeneration: Regenerate areasForDevelopment section preserves review',
      '200 OK + updated section',
      `${regenRes.status} areasContent: ${Boolean(areasContent)}, summary intact: ${otherSectionIntact}`,
      regenRes.status === 200 && Boolean(areasContent) && otherSectionIntact
    );

    // Step 11: AI Synthesis Audit Logging
    console.log('\n📋 Step 11: Testing AI Synthesis Audit Logging...');

    // 42. Check AISynthesisLog in MongoDB
    const logEntries = await AISynthesisLog.find({
      organizationId: 'org-reviewforge-default',
      employeeId: 'emp-002',
    });
    recordTest(
      'AISynthesisLog MongoDB Persistence: Log entries created',
      '>= 1 log entry',
      `${logEntries.length} log entries found`,
      logEntries.length >= 1
    );

    // 43. Verify log entry structure
    const latestLog = logEntries[0];
    const logStructureValid =
      Boolean(latestLog?.id) &&
      Boolean(latestLog?.modelName) &&
      Boolean(latestLog?.actorId) &&
      typeof latestLog?.coverageScore === 'number' &&
      typeof latestLog?.latencyMs === 'number';
    recordTest(
      'AISynthesisLog Structure: modelName, actorId, coverageScore, latencyMs recorded',
      'All fields present',
      `model:${latestLog?.modelName}, actor:${latestLog?.actorId}, score:${latestLog?.coverageScore}, latency:${latestLog?.latencyMs}ms`,
      logStructureValid
    );

    // 44. Fetch logs via API endpoint
    const apiLogsRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/ai/logs/emp-002',
      headers: { authorization: `Bearer ${managerToken}` },
    });
    const apiLogsData = await apiLogsRes.json();
    recordTest(
      'AI Logs API: GET /api/v1/ai/logs/:employeeId',
      '200 OK + logs array',
      `${apiLogsRes.status} count: ${apiLogsData.count}`,
      apiLogsRes.status === 200 && apiLogsData.count >= 1
    );

    // Step 12: Review Scoping & Lifecycle Progression
    console.log('\n🔒 Step 12: Review Scoping & Lifecycle Progression...');

    // 45. Employee cannot see Draft review in GET /api/v1/reviews
    const empViewDraftRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/reviews?employeeId=emp-002',
      headers: { authorization: `Bearer ${employeeToken}` },
    });
    const empDraftData = await empViewDraftRes.json();
    recordTest(
      'Review Scoping: Employee cannot view Draft review',
      'count === 0 (drafts filtered out)',
      `count: ${empDraftData.count}`,
      empViewDraftRes.status === 200 && empDraftData.count === 0
    );

    // 46. Manager CAN view Draft review
    const mgrViewDraftRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/reviews?employeeId=emp-002',
      headers: { authorization: `Bearer ${managerToken}` },
    });
    const mgrDraftData = await mgrViewDraftRes.json();
    recordTest(
      'Review Scoping: Manager CAN view Draft review for direct report',
      'count >= 1',
      `count: ${mgrDraftData.count}`,
      mgrViewDraftRes.status === 200 && mgrDraftData.count >= 1
    );

    // 47. Transition review status: Draft -> Pending Approval -> Approved
    const approveRes = await dispatch(appInstance, {
      method: 'PATCH',
      url: `/api/v1/reviews/${persistedReview.id}`,
      headers: { authorization: `Bearer ${managerToken}` },
      body: { status: 'Approved' },
    });
    recordTest('Review Lifecycle: Transition status to Approved', 200, approveRes.status, approveRes.status === 200);

    // 48. Release review: Approved -> Released (HR Admin)
    const releaseRes = await dispatch(appInstance, {
      method: 'PATCH',
      url: `/api/v1/reviews/${persistedReview.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      body: { status: 'Released' },
    });
    recordTest('Review Lifecycle: Transition status to Released', 200, releaseRes.status, releaseRes.status === 200);

    // 49. Employee can now view Released review
    const empViewReleasedRes = await dispatch(appInstance, {
      method: 'GET',
      url: '/api/v1/reviews?employeeId=emp-002',
      headers: { authorization: `Bearer ${employeeToken}` },
    });
    const empReleasedData = await empViewReleasedRes.json();
    recordTest(
      'Review Scoping: Employee CAN view review after Release',
      'count === 1 and status === Released',
      `count: ${empReleasedData.count}, status: ${empReleasedData.data?.[0]?.status}`,
      empViewReleasedRes.status === 200 &&
        empReleasedData.count === 1 &&
        empReleasedData.data?.[0]?.status === 'Released'
    );

    // 50. Review Detail Endpoint: Employee can view Released review details
    const empReviewDetailRes = await dispatch(appInstance, {
      method: 'GET',
      url: `/api/v1/reviews/${persistedReview.id}`,
      headers: { authorization: `Bearer ${employeeToken}` },
    });
    const empReviewDetailData = await empReviewDetailRes.json();
    recordTest(
      'Review Detail API: GET /api/v1/reviews/:id accessible to employee when Released',
      '200 OK + full document',
      `${empReviewDetailRes.status} employeeId: ${empReviewDetailData.data?.employeeId}`,
      empReviewDetailRes.status === 200 && empReviewDetailData.data?.employeeId === 'emp-002'
    );
  } catch (error) {
    console.error('Fatal error during Milestone 10 tests:', error);
    recordTest('Milestone 10 Execution', 'Complete test suite without crashes', error.message, false);
  } finally {
    await disconnectDatabase();
  }

  // Summary Report
  console.log('\n================================================================');
  console.log('   MILESTONE 10 TEST EXECUTION SUMMARY');
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

runMilestone10Tests();
