import { MongoClient, Db, ServerApiVersion } from 'mongodb';
import { envConfig } from '@/lib/config/env';

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
  // eslint-disable-next-line no-var
  var _mongoIndexesInitialized: boolean | undefined;
}

let client: MongoClient | null = null;
let clientPromise: Promise<MongoClient> | null = null;
let lastConnectionError: string | null = null;

/**
 * Returns the cached MongoDB client promise if MONGODB_URI is configured.
 * Returns null if running in local/demo mode without MongoDB Atlas credentials.
 */
export function getMongoClientPromise(): Promise<MongoClient> | null {
  if (!envConfig.isMongoConfigured) {
    return null;
  }

  const uri = envConfig.mongoUri;
  const options = {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
    maxPoolSize: process.env.NODE_ENV === 'development' ? 10 : 15,
    minPoolSize: process.env.NODE_ENV === 'development' ? 1 : 2,
    connectTimeoutMS: 8000,
    serverSelectionTimeoutMS: 5000,
  };

  if (process.env.NODE_ENV === 'development') {
    if (!global._mongoClientPromise) {
      client = new MongoClient(uri, options);
      global._mongoClientPromise = client.connect().catch(err => {
        lastConnectionError = err instanceof Error ? err.message : String(err);
        global._mongoClientPromise = undefined;
        throw err;
      });
    }
    return global._mongoClientPromise;
  } else {
    if (!clientPromise) {
      client = new MongoClient(uri, options);
      clientPromise = client.connect().catch(err => {
        lastConnectionError = err instanceof Error ? err.message : String(err);
        clientPromise = null;
        throw err;
      });
    }
    return clientPromise;
  }
}

/**
 * Returns the active MongoDB database instance if configured, or null.
 */
export async function getMongoDb(): Promise<Db | null> {
  const promise = getMongoClientPromise();
  if (!promise) return null;

  try {
    const connectedClient = await promise;
    lastConnectionError = null;
    const db = connectedClient.db(envConfig.mongoDbName);
    if (!global._mongoIndexesInitialized) {
      global._mongoIndexesInitialized = true;
      initializeDatabaseIndexes(db).catch(err => {
        console.error('Deferred index initialization failed:', err);
      });
    }
    return db;
  } catch (error) {
    lastConnectionError = error instanceof Error ? error.message : 'Unknown connection error';
    console.error('Failed to connect to MongoDB Atlas:', error);
    return null;
  }
}

/**
 * Health check function for MongoDB Atlas connection status.
 */
export async function checkMongoHealth(): Promise<{
  connected: boolean;
  status: 'connected' | 'not_configured' | 'error';
  message: string;
  dbName: string;
  collectionsCount?: number;
}> {
  if (!envConfig.isMongoConfigured) {
    return {
      connected: false,
      status: 'not_configured',
      message: 'MongoDB Atlas is not configured. Running in local demo mode.',
      dbName: envConfig.mongoDbName,
    };
  }

  try {
    const db = await getMongoDb();
    if (!db) {
      const sanitizedError = lastConnectionError
        ? lastConnectionError.replace(/mongodb(\+srv)?:\/\/[^@\s]+@/gi, 'mongodb$1://***:***@')
        : null;
      return {
        connected: false,
        status: 'error',
        message: sanitizedError
          ? `MongoDB connection error: ${sanitizedError}`
          : 'Could not obtain database instance.',
        dbName: envConfig.mongoDbName,
      };
    }

    // Ping the database
    await db.command({ ping: 1 });
    const collections = await db.listCollections().toArray();

    return {
      connected: true,
      status: 'connected',
      message: 'Successfully connected to MongoDB Atlas cluster.',
      dbName: envConfig.mongoDbName,
      collectionsCount: collections.length,
    };
  } catch (error: unknown) {
    const rawMsg = error instanceof Error ? error.message : 'Unknown connection error';
    const errMessage = rawMsg.replace(/mongodb(\+srv)?:\/\/[^@\s]+@/gi, 'mongodb$1://***:***@');
    return {
      connected: false,
      status: 'error',
      message: `MongoDB connection error: ${errMessage}`,
      dbName: envConfig.mongoDbName,
    };
  }
}

/**
 * Initializes required database indexes for multitenant performance and query constraints.
 */
export async function initializeDatabaseIndexes(db: Db): Promise<void> {
  try {
    // Organizations: unique slug
    await db.collection('organizations').createIndex({ slug: 1 }, { unique: true });

    // Users: unique email per organization
    await db.collection('users').createIndex({ organizationId: 1, email: 1 }, { unique: true });
    await db.collection('users').createIndex({ organizationId: 1, role: 1 });

    // Employees
    await db.collection('employees').createIndex({ organizationId: 1, id: 1 }, { unique: true });
    await db.collection('employees').createIndex({ organizationId: 1, departmentId: 1 });
    await db.collection('employees').createIndex({ organizationId: 1, reviewStatus: 1 });

    // Departments
    await db.collection('departments').createIndex({ organizationId: 1, id: 1 }, { unique: true });

    // Review Cycles
    await db.collection('reviewCycles').createIndex({ organizationId: 1, id: 1 }, { unique: true });
    await db.collection('reviewCycles').createIndex({ organizationId: 1, status: 1 });

    // OKRs
    await db.collection('okrs').createIndex({ organizationId: 1, employeeId: 1, quarter: 1, year: 1 });

    // Feedback
    await db.collection('feedback').createIndex({ organizationId: 1, targetEmployeeId: 1, reviewCycleId: 1 });
    await db.collection('feedback').createIndex({ organizationId: 1, providerEmployeeId: 1 });

    // Feedback Requests
    await db.collection('feedbackRequests').createIndex({ organizationId: 1, reviewerEmployeeId: 1, status: 1 });
    await db.collection('feedbackRequests').createIndex({ organizationId: 1, targetEmployeeId: 1 });

    // Self Reflections
    await db.collection('selfReflections').createIndex({ organizationId: 1, employeeId: 1, reviewCycleId: 1 });

    // Manager Notes (Private)
    await db.collection('managerNotes').createIndex({ organizationId: 1, employeeId: 1 });
    await db.collection('managerNotes').createIndex({ organizationId: 1, managerId: 1 });

    // Performance Reviews
    await db.collection('performanceReviews').createIndex({ organizationId: 1, id: 1 }, { unique: true });
    await db.collection('performanceReviews').createIndex({ organizationId: 1, employeeId: 1, reviewCycleId: 1 });
    await db.collection('performanceReviews').createIndex({ organizationId: 1, status: 1 });

    // Audit Logs
    await db.collection('auditLogs').createIndex({ organizationId: 1, timestamp: -1 });

    // Notifications
    await db.collection('notifications').createIndex({ organizationId: 1, userId: 1, isRead: 1 });

    // Invitations
    await db.collection('invitations').createIndex({ token: 1 }, { unique: true });
    await db.collection('invitations').createIndex({ organizationId: 1, email: 1 });

    console.log('MongoDB indexes initialized successfully.');
  } catch (error) {
    console.error('Error creating database indexes:', error);
  }
}

