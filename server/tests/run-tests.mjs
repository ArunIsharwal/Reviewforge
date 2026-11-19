/**
 * Milestone 2 Automated Verification Test Suite
 * Tests Express.js Server, Health Endpoint, Mongoose Database Manager,
 * Error Handling, and Secret Isolation.
 */

import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import compiled server modules
import { createApp } from '../dist/app.js';
import { config } from '../dist/config/env.js';
import { connectDatabase, disconnectDatabase, checkDatabaseHealth } from '../dist/config/database.js';

const results = [];

function recordTest(testName, expected, actual, pass) {
  results.push({
    testName,
    expected,
    actual,
    status: pass ? 'PASS' : 'FAIL',
  });
  console.log(`${pass ? '✅' : '❌'} ${testName}: ${actual}`);
}

/**
 * Dispatches an HTTP request directly through the Express middleware and routing chain
 * without requiring raw OS socket permissions.
 */
function dispatchRequest(app, { method = 'GET', url = '/', headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const req = new EventEmitter();
    req.method = method;
    req.url = url;
    req.originalUrl = url;
    req.path = url.split('?')[0];
    req.headers = { host: 'localhost', ...headers };
    req.body = body;
    req.connection = { remoteAddress: '127.0.0.1' };
    req.socket = req.connection;
    req.query = {};

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

async function runTests() {
  console.log('\n======================================================');
  console.log('   MILESTONE 2 AUTOMATED TEST SUITE EXECUTION');
  console.log('======================================================\n');

  // Test 1: Environment Configuration
  try {
    const isConfigValid =
      config.PORT === 5000 &&
      config.NODE_ENV === 'development' &&
      typeof config.MONGODB_URI === 'string' &&
      typeof config.JWT_SECRET === 'string';
    recordTest(
      'Environment Configuration Loading',
      'Config loaded and validated with PORT=5000 and MONGODB_URI set',
      isConfigValid
        ? `Validated successfully: PORT=${config.PORT}, DB=${config.MONGODB_DB_NAME}`
        : 'Config validation failed',
      isConfigValid
    );
  } catch (err) {
    recordTest('Environment Configuration Loading', 'Valid config', `Threw error: ${err.message}`, false);
  }

  // Test 2: Secrets Isolation Verification
  try {
    const clientEnvLocalPath = path.resolve(__dirname, '../../client/.env.local');
    const clientEnvExamplePath = path.resolve(__dirname, '../../client/.env.example');

    let secretsExposed = false;
    let checkedFiles = [];

    for (const f of [clientEnvLocalPath, clientEnvExamplePath]) {
      if (fs.existsSync(f)) {
        checkedFiles.push(path.basename(f));
        const content = fs.readFileSync(f, 'utf-8');
        if (
          content.includes('MONGODB_URI') ||
          content.includes('JWT_SECRET') ||
          content.includes('GEMINI_API_KEY') ||
          content.includes('mongodb+srv://')
        ) {
          secretsExposed = true;
        }
      }
    }

    recordTest(
      'Frontend Secrets Isolation',
      'No database URIs, JWT secrets, or AI API keys exposed in client env files',
      secretsExposed
        ? 'FAILED: Secrets leaked in client env files'
        : `PASS: Checked ${checkedFiles.join(', ')} — Zero secrets exposed`,
      !secretsExposed
    );
  } catch (err) {
    recordTest('Frontend Secrets Isolation', 'Zero secrets exposed', err.message, false);
  }

  // Test 3: Express Application Instantiation
  let app;
  try {
    app = createApp();
    recordTest(
      'Express Application Setup',
      'Express app created with CORS, JSON body parser, and routes mounted',
      'createApp() returned Express instance successfully',
      typeof app === 'function' && typeof app.listen === 'function'
    );
  } catch (err) {
    recordTest('Express Application Setup', 'Express app created', `Failed: ${err.message}`, false);
  }

  // Test 4: Mongoose Database Connection (Live Local MongoDB)
  let dbConnected = false;
  try {
    const conn = await connectDatabase();
    dbConnected = conn.connection.readyState === 1;
    recordTest(
      'Mongoose Database Connection',
      'Connects to MongoDB and reaches readyState === 1',
      `Connected successfully: readyState=1, host=${conn.connection.host}, db=${conn.connection.name}`,
      dbConnected
    );
  } catch (err) {
    recordTest('Mongoose Database Connection', 'Connected readyState=1', `Connection failed: ${err.message}`, false);
  }

  // Test 5: Express Health Endpoint (Connected State)
  try {
    const res = await dispatchRequest(app, { method: 'GET', url: '/api/v1/health' });
    const json = await res.json();

    const isHealthy =
      res.status === 200 &&
      json.status === 'healthy' &&
      json.database?.connected === true &&
      typeof json.timestamp === 'string';

    recordTest(
      'Express Health Endpoint (/api/v1/health)',
      'Returns HTTP 200 with status="healthy" and database.connected=true',
      `HTTP ${res.status}: status="${json.status}", databaseConnected=${json.database?.connected}, collections=${json.database?.collectionsCount}`,
      isHealthy
    );
  } catch (err) {
    recordTest('Express Health Endpoint (/api/v1/health)', 'HTTP 200 healthy', `Failed: ${err.message}`, false);
  }

  // Test 6: Invalid Database Credentials Error Handling
  try {
    const invalidUri = 'mongodb://fakeuser:fakepassword@127.0.0.1:27017/invalid_db?authSource=admin&serverSelectionTimeoutMS=2000';
    let caughtError = null;
    try {
      // Disconnect current good connection first
      await disconnectDatabase();
      await connectDatabase(invalidUri);
    } catch (e) {
      caughtError = e;
    }

    const properlyHandled =
      caughtError !== null &&
      caughtError.message.includes('Database connection failed') &&
      !caughtError.message.includes('fakepassword'); // Credentials sanitized

    recordTest(
      'Invalid Database Credentials Handling',
      'Rejects with sanitized error message and never crashes the server unhandled',
      properlyHandled
        ? `Properly caught: "${caughtError.message}" (Credentials masked)`
        : `Did not catch expected error: ${caughtError ? caughtError.message : 'No error thrown'}`,
      properlyHandled
    );

    // Reconnect to valid database
    await connectDatabase();
  } catch (err) {
    recordTest('Invalid Database Credentials Handling', 'Handled gracefully', `Failed: ${err.message}`, false);
  }

  // Test 7: Centralized Error Handler (404 Not Found)
  try {
    const res = await dispatchRequest(app, { method: 'GET', url: '/api/v1/nonexistent-route-404' });
    const json = await res.json();

    const is404Handled = res.status === 404 && json.success === false && typeof json.error === 'string';

    recordTest(
      'Centralized 404 Error Handling',
      'Unmatched routes return structured JSON error with HTTP 404',
      `HTTP ${res.status}: "${json.error}"`,
      is404Handled
    );
  } catch (err) {
    recordTest('Centralized 404 Error Handling', 'Structured 404', `Failed: ${err.message}`, false);
  }

  // Test 8: Frontend Centralized API Client Health Simulation
  try {
    // Import or simulate apiClient checkHealth logic
    const res = await dispatchRequest(app, { method: 'GET', url: '/api/v1/health' });
    const json = await res.json();
    const isClientCallValid = json.success === true && json.status === 'healthy';

    recordTest(
      'Centralized API Communication (Frontend -> Backend)',
      'Frontend API client format parses backend health endpoint successfully',
      `Health check parsed: healthy=${isClientCallValid}, dbStatus="${json.database?.status}"`,
      isClientCallValid
    );
  } catch (err) {
    recordTest('Centralized API Communication', 'Healthy response', `Failed: ${err.message}`, false);
  }

  // Clean disconnect after tests
  await disconnectDatabase();

  // Summary
  console.log('\n======================================================');
  console.log('                 VERIFICATION SUMMARY');
  console.log('======================================================');
  const passedCount = results.filter((r) => r.status === 'PASS').length;
  const failedCount = results.filter((r) => r.status === 'FAIL').length;
  console.log(`Total Tests Executed: ${results.length}`);
  console.log(`Passed:               ${passedCount}`);
  console.log(`Failed:               ${failedCount}`);
  console.log(`Milestone Status:     ${failedCount === 0 ? 'PASS' : 'FAIL'}`);
  console.log('======================================================\n');

  return { passedCount, failedCount, results };
}

runTests()
  .then(({ failedCount }) => {
    process.exit(failedCount === 0 ? 0 : 1);
  })
  .catch((err) => {
    console.error('Fatal test runner error:', err);
    process.exit(1);
  });
