import mongoose from 'mongoose';
import { config } from './env.js';

let isConnecting = false;
let lastConnectionError: string | null = null;

export interface DatabaseHealth {
  connected: boolean;
  status: 'connected' | 'disconnected' | 'connecting' | 'error';
  dbName: string;
  host?: string;
  readyState: number;
  message: string;
  collectionsCount?: number;
}

/**
 * Connect to MongoDB using Mongoose.
 * If a custom URI is provided (e.g. for testing invalid credentials), uses that instead.
 */
export async function connectDatabase(customUri?: string): Promise<typeof mongoose> {
  const uri = customUri || config.MONGODB_URI;

  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  if (isConnecting) {
    // Wait until current connection attempt finishes
    await new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        if (!isConnecting) {
          clearInterval(interval);
          resolve();
        }
      }, 100);
    });
    return mongoose;
  }

  isConnecting = true;
  lastConnectionError = null;

  try {
    const isAtlas = /^mongodb\+srv:\/\//i.test(uri);

    const conn = await mongoose.connect(uri, {
      dbName: config.MONGODB_DB_NAME,
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000,
      socketTimeoutMS: 45000,
      maxPoolSize: isAtlas ? 20 : 10,
      minPoolSize: 1,
      autoIndex: config.NODE_ENV !== 'production',
      retryWrites: true,
      w: 'majority',
    });

    const clusterType = isAtlas ? 'MongoDB Atlas Cluster' : 'Local MongoDB';
    console.log(`✅ Mongoose connected successfully to ${clusterType} [db: ${conn.connection.name}]`);
    isConnecting = false;
    return conn;
  } catch (error) {
    isConnecting = false;
    const rawMsg = error instanceof Error ? error.message : String(error);
    // Sanitize URI credentials from logs
    const sanitizedError = rawMsg.replace(/mongodb(\+srv)?:\/\/[^@\s]+@/gi, 'mongodb$1://***:***@');
    lastConnectionError = sanitizedError;
    console.error('❌ Mongoose connection failed:', sanitizedError);

    // Provide actionable diagnostic suggestions for Atlas deployment
    if (/serverselection|querysrv|etimedout|enotfound/i.test(rawMsg)) {
      console.error(
        '👉 Atlas Deployment Hint: Verify that your server IP is whitelisted under Atlas > Network Access (use 0.0.0.0/0 for cloud hosts like Render, Railway, AWS, or Vercel).'
      );
    } else if (/bad auth|authentication failed/i.test(rawMsg)) {
      console.error(
        '👉 Atlas Deployment Hint: Authentication failed. Double-check your Atlas Database User username and password in Atlas > Database Access.'
      );
    }

    throw new Error(`Database connection failed: ${sanitizedError}`);
  }
}

/**
 * Disconnect cleanly from MongoDB.
 */
export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    console.log('🔌 Mongoose disconnected cleanly.');
  }
}

/**
 * Comprehensive health status of the database connection.
 */
export async function checkDatabaseHealth(): Promise<DatabaseHealth> {
  const state = mongoose.connection.readyState;
  const stateLabels: Record<number, 'disconnected' | 'connected' | 'connecting' | 'disconnecting'> = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };

  const status = stateLabels[state] === 'connected' ? 'connected' : state === 2 ? 'connecting' : lastConnectionError ? 'error' : 'disconnected';

  if (state === 1 && mongoose.connection.db) {
    try {
      // Ping the database
      await mongoose.connection.db.command({ ping: 1 });
      const collections = await mongoose.connection.db.listCollections().toArray();

      return {
        connected: true,
        status: 'connected',
        dbName: mongoose.connection.name || config.MONGODB_DB_NAME,
        host: mongoose.connection.host,
        readyState: state,
        message: 'Successfully connected and verified MongoDB Atlas cluster.',
        collectionsCount: collections.length,
      };
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : String(err);
      return {
        connected: false,
        status: 'error',
        dbName: config.MONGODB_DB_NAME,
        readyState: state,
        message: `Database ping failed: ${errMessage}`,
      };
    }
  }

  return {
    connected: false,
    status,
    dbName: config.MONGODB_DB_NAME,
    readyState: state,
    message: lastConnectionError ? `Connection error: ${lastConnectionError}` : 'Database is not currently connected.',
  };
}

// Global Mongoose event listeners
mongoose.connection.on('disconnected', () => {
  console.warn('⚠️ Mongoose connection disconnected.');
});

mongoose.connection.on('reconnected', () => {
  console.log('🔄 Mongoose connection re-established.');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ Mongoose connection runtime error:', err.message);
});

