import { MongoClient, ServerApiVersion } from 'mongodb';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import ts from 'typescript';

const require = createRequire(import.meta.url);

function cleanEnvValue(raw) {
  let val = (raw || '').trim();
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1).trim();
  }
  return val;
}

function isPlaceholder(val) {
  return !val || val.includes('REPLACE_');
}

function parseAndLoadEnv(filename) {
  const envPath = path.resolve(process.cwd(), filename);
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const val = cleanEnvValue(trimmed.slice(eqIndex + 1));
    if (!isPlaceholder(val) && isPlaceholder(process.env[key])) {
      process.env[key] = val;
    } else if (!isPlaceholder(val) && filename === '.env.local' && process.env[key] !== val) {
      // Allow non-placeholder .env.local values to override .env cleanly
      process.env[key] = val;
    } else if (!process.env[key] && val) {
      process.env[key] = val;
    }
  }
}

// Load .env first, then .env.local (skipping REPLACE_ placeholders so real .env values stay intact)
parseAndLoadEnv('.env');
parseAndLoadEnv('.env.local');

function loadTsModule(relPath) {
  const fullPath = path.resolve(process.cwd(), relPath);
  const src = fs.readFileSync(fullPath, 'utf-8');
  const transpiled = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });
  const mod = { exports: {} };
  const fn = new Function('exports', 'require', 'module', transpiled.outputText);
  fn(mod.exports, id => (id === '@/types' ? {} : require(id)), mod);
  return mod.exports;
}

async function ensureIndexes(db) {
  await db.collection('organizations').createIndex({ slug: 1 }, { unique: true });
  await db.collection('users').createIndex({ organizationId: 1, email: 1 }, { unique: true });
  await db.collection('users').createIndex({ organizationId: 1, role: 1 });
  await db.collection('employees').createIndex({ organizationId: 1, id: 1 }, { unique: true });
  await db.collection('employees').createIndex({ organizationId: 1, departmentId: 1 });
  await db.collection('employees').createIndex({ organizationId: 1, reviewStatus: 1 });
  await db.collection('departments').createIndex({ organizationId: 1, id: 1 }, { unique: true });
  await db.collection('reviewCycles').createIndex({ organizationId: 1, id: 1 }, { unique: true });
  await db.collection('reviewCycles').createIndex({ organizationId: 1, status: 1 });
  await db.collection('okrs').createIndex({ organizationId: 1, employeeId: 1, quarter: 1, year: 1 });
  await db.collection('feedback').createIndex({ organizationId: 1, targetEmployeeId: 1, reviewCycleId: 1 });
  await db.collection('feedback').createIndex({ organizationId: 1, providerEmployeeId: 1 });
  await db.collection('feedbackRequests').createIndex({ organizationId: 1, reviewerEmployeeId: 1, status: 1 });
  await db.collection('feedbackRequests').createIndex({ organizationId: 1, targetEmployeeId: 1 });
  await db.collection('selfReflections').createIndex({ organizationId: 1, employeeId: 1, reviewCycleId: 1 });
  await db.collection('managerNotes').createIndex({ organizationId: 1, employeeId: 1 });
  await db.collection('managerNotes').createIndex({ organizationId: 1, managerId: 1 });
  await db.collection('performanceReviews').createIndex({ organizationId: 1, id: 1 }, { unique: true });
  await db.collection('performanceReviews').createIndex({ organizationId: 1, employeeId: 1, reviewCycleId: 1 });
  await db.collection('performanceReviews').createIndex({ organizationId: 1, status: 1 });
  await db.collection('auditLogs').createIndex({ organizationId: 1, timestamp: -1 });
  await db.collection('notifications').createIndex({ organizationId: 1, userId: 1, isRead: 1 });
  await db.collection('invitations').createIndex({ token: 1 }, { unique: true });
  await db.collection('invitations').createIndex({ organizationId: 1, email: 1 });
}

async function seedDatabase() {
  const mongoUri = cleanEnvValue(process.env.MONGODB_URI);
  const dbName = cleanEnvValue(process.env.MONGODB_DB_NAME) || 'reviewforge';

  if (
    !mongoUri ||
    isPlaceholder(mongoUri) ||
    (!mongoUri.startsWith('mongodb://') && !mongoUri.startsWith('mongodb+srv://'))
  ) {
    console.log('MongoDB Atlas URI is not configured or contains placeholder in .env / .env.local.');
    console.log('Skipping remote MongoDB seed. The application continues running in local demo mode.');
    process.exit(0);
  }

  console.log(`Connecting to MongoDB Atlas database "${dbName}"...`);
  const client = new MongoClient(mongoUri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
    connectTimeoutMS: 10000,
    serverSelectionTimeoutMS: 8000,
  });

  try {
    await client.connect();
    await client.db('admin').command({ ping: 1 });
    console.log('Connected successfully to MongoDB Atlas.');

    const db = client.db(dbName);
    await ensureIndexes(db);
    console.log('✓ Database indexes verified.');

    const { INITIAL_SETTINGS } = loadTsModule('src/lib/mock-data/settings.ts');
    const { INITIAL_DEPARTMENTS } = loadTsModule('src/lib/mock-data/departments.ts');
    const { INITIAL_EMPLOYEES } = loadTsModule('src/lib/mock-data/employees.ts');
    const { INITIAL_REVIEW_CYCLES } = loadTsModule('src/lib/mock-data/review-cycles.ts');
    const { INITIAL_OKRS } = loadTsModule('src/lib/mock-data/okrs.ts');
    const { INITIAL_FEEDBACK } = loadTsModule('src/lib/mock-data/feedback.ts');
    const { INITIAL_SELF_REFLECTIONS } = loadTsModule('src/lib/mock-data/self-reflections.ts');
    const { INITIAL_MANAGER_NOTES } = loadTsModule('src/lib/mock-data/manager-notes.ts');
    const { INITIAL_PERFORMANCE_REVIEWS } = loadTsModule('src/lib/mock-data/performance-reviews.ts');
    const { INITIAL_AUDIT_LOGS } = loadTsModule('src/lib/mock-data/audit-logs.ts');

    const orgId = 'org-reviewforge-default';
    const now = new Date().toISOString();

    // 1. Organization & Settings
    await db.collection('organizations').updateOne(
      { id: orgId },
      {
        $setOnInsert: {
          id: orgId,
          name: INITIAL_SETTINGS.name || 'ReviewForge Enterprise',
          slug: 'reviewforge',
          industry: INITIAL_SETTINGS.industry || 'Enterprise Software & Cloud Systems',
          createdAt: now,
          updatedAt: now,
          settings: INITIAL_SETTINGS,
        },
      },
      { upsert: true }
    );
    console.log('✓ Organization initialized.');

    // 2. Users (SEED_ADMIN_* from .env + standard demo test accounts)
    const seedAdminName = cleanEnvValue(process.env.SEED_ADMIN_NAME) || 'ReviewForge Admin';
    const seedAdminEmail = (cleanEnvValue(process.env.SEED_ADMIN_EMAIL) || 'admin@example.com').toLowerCase();
    const seedAdminPass = cleanEnvValue(process.env.SEED_ADMIN_PASSWORD) || 'Admin@ReviewForge2026!';

    const seedAdminHash = await bcrypt.hash(seedAdminPass, 10);
    const defaultAdminHash = await bcrypt.hash('Admin@ReviewForge2026!', 10);
    const demoPasswordHash = await bcrypt.hash('ReviewForgeDemo123!', 10);

    const users = [
      {
        id: 'usr-admin-seed',
        organizationId: orgId,
        name: seedAdminName,
        email: seedAdminEmail,
        passwordHash: seedAdminHash,
        role: 'hr_admin',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'usr-mgr-aris',
        organizationId: orgId,
        name: 'Dr. Aris Thorne',
        email: 'aris.thorne@reviewforge.internal',
        passwordHash: demoPasswordHash,
        role: 'manager',
        employeeId: 'emp-001',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'usr-mgr-1',
        organizationId: orgId,
        name: 'Elena Rostova',
        email: 'elena.rostova@reviewforge.io',
        passwordHash: demoPasswordHash,
        role: 'manager',
        employeeId: 'emp-003',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'usr-emp-1',
        organizationId: orgId,
        name: 'Rahul Deshmukh',
        email: 'rahul.deshmukh@reviewforge.io',
        passwordHash: demoPasswordHash,
        role: 'employee',
        employeeId: 'emp-002',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'usr-peer-1',
        organizationId: orgId,
        name: 'Marcus Vance',
        email: 'marcus.vance@reviewforge.io',
        passwordHash: demoPasswordHash,
        role: 'peer_reviewer',
        employeeId: 'emp-004',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
    ];

    if (seedAdminEmail !== 'admin@example.com') {
      users.push({
        id: 'usr-admin-demo',
        organizationId: orgId,
        name: 'ReviewForge Admin (Demo)',
        email: 'admin@example.com',
        passwordHash: defaultAdminHash,
        role: 'hr_admin',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      });
    }

    for (const u of users) {
      await db.collection('users').updateOne(
        { organizationId: orgId, email: u.email },
        { $set: u },
        { upsert: true }
      );
    }
    console.log(`✓ ${users.length} Users initialized (Admin: ${seedAdminEmail}).`);

    // Helper for idempotent collection upserts
    async function seedCollection(name, items, idKey = 'id') {
      for (const item of items) {
        const doc = { ...item, organizationId: orgId };
        await db.collection(name).updateOne(
          { organizationId: orgId, [idKey]: doc[idKey] },
          { $setOnInsert: doc },
          { upsert: true }
        );
      }
      console.log(`✓ ${name}: ensured ${items.length} records.`);
    }

    await seedCollection('departments', INITIAL_DEPARTMENTS);
    await seedCollection('employees', INITIAL_EMPLOYEES);
    await seedCollection('reviewCycles', INITIAL_REVIEW_CYCLES);
    await seedCollection('okrs', INITIAL_OKRS);
    await seedCollection('feedback', INITIAL_FEEDBACK);
    await seedCollection('selfReflections', INITIAL_SELF_REFLECTIONS);
    await seedCollection('managerNotes', INITIAL_MANAGER_NOTES);
    await seedCollection('performanceReviews', INITIAL_PERFORMANCE_REVIEWS);
    await seedCollection('auditLogs', INITIAL_AUDIT_LOGS);

    // 11. Feedback Requests
    const feedbackRequests = [
      {
        id: 'fbreq-001',
        reviewCycleId: 'cycle-2026-annual',
        targetEmployeeId: 'emp-002',
        targetEmployeeName: 'Rahul Deshmukh',
        reviewerEmployeeId: 'emp-003',
        reviewerName: 'Elena Rostova',
        requestedBy: 'Dr. Aris Thorne',
        status: 'Completed',
        dueDate: '2026-11-10',
        createdAt: now,
      },
      {
        id: 'fbreq-002',
        reviewCycleId: 'cycle-2026-annual',
        targetEmployeeId: 'emp-002',
        targetEmployeeName: 'Rahul Deshmukh',
        reviewerEmployeeId: 'emp-004',
        reviewerName: 'Marcus Vance',
        requestedBy: 'Dr. Aris Thorne',
        status: 'Pending',
        dueDate: '2026-11-20',
        createdAt: now,
      },
    ];
    await seedCollection('feedbackRequests', feedbackRequests);

    // 12. Notifications
    const notifications = [
      {
        id: 'notif-1',
        userId: 'usr-admin-seed',
        title: 'FY2026 Review Pending Calibration',
        message: "Rahul Deshmukh's FY2026 Annual Review draft is awaiting approval in the queue.",
        type: 'approval',
        link: '/approvals',
        isRead: false,
        createdAt: now,
      },
      {
        id: 'notif-2',
        userId: 'usr-mgr-aris',
        title: 'AI Synthesis Evidence Verified',
        message: '94% evidence coverage calculated across OKRs, peer feedback, and manager notes.',
        type: 'review',
        link: '/ai-review-studio',
        isRead: false,
        createdAt: now,
      },
    ];
    await seedCollection('notifications', notifications);

    console.log('\n======================================================');
    console.log('MongoDB Atlas Seed Completed Successfully!');
    console.log(`Database: ${dbName} | Seed Admin: ${seedAdminEmail}`);
    console.log('======================================================\n');
  } catch (error) {
    const rawMsg = error instanceof Error ? error.message : String(error);
    const safeMsg = rawMsg.replace(/mongodb(\+srv)?:\/\/[^@\s]+@/gi, 'mongodb$1://***:***@');
    console.error('MongoDB seed failed:', safeMsg);
    process.exit(1);
  } finally {
    await client.close();
  }
}

seedDatabase();
