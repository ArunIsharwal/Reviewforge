import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME || 'reviewforge';

console.log('Testing MongoDB connection with Mongoose...');
console.log('Target database:', dbName);

try {
  const conn = await mongoose.connect(uri, {
    dbName,
    serverSelectionTimeoutMS: 8000,
    connectTimeoutMS: 8000,
  });

  console.log('✅ Successfully connected to MongoDB cluster with Mongoose!');
  console.log('Connection state:', conn.connection.readyState);
  console.log('Host:', conn.connection.host);

  const collections = await conn.connection.db.listCollections().toArray();
  console.log(`Found ${collections.length} collections in database "${dbName}":`);
  collections.forEach((c) => console.log(` - ${c.name}`));

  await mongoose.disconnect();
  console.log('Disconnected cleanly.');
  process.exit(0);
} catch (error) {
  console.error('❌ Mongoose connection error:', error.message);
  process.exit(1);
}

