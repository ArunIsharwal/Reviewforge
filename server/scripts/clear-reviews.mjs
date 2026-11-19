import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/reviewforge';
console.log('Connecting to MongoDB at:', uri);
await mongoose.connect(uri);

const orgId = 'org-reviewforge-default';
console.log('🧹 Clearing all performance reviews, OKRs, feedback, and notes...');

const [revs, aiLogs, notes, refs, fb, reqs, okrs] = await Promise.all([
  mongoose.connection.db.collection('performancereviews').deleteMany({ organizationId: orgId }),
  mongoose.connection.db.collection('aisynthesislogs').deleteMany({ organizationId: orgId }),
  mongoose.connection.db.collection('managernotes').deleteMany({ organizationId: orgId }),
  mongoose.connection.db.collection('selfreflections').deleteMany({ organizationId: orgId }),
  mongoose.connection.db.collection('feedbackitems').deleteMany({ organizationId: orgId }),
  mongoose.connection.db.collection('feedbackrequests').deleteMany({ organizationId: orgId }),
  mongoose.connection.db.collection('okrs').deleteMany({ organizationId: orgId }),
]);

await mongoose.connection.db.collection('employees').updateMany(
  { organizationId: orgId },
  { $set: { reviewStatus: 'Not Started' } }
);

console.log('✅ Cleared records summary:');
console.table({
  'Performance Reviews': revs.deletedCount,
  'AI Synthesis Logs': aiLogs.deletedCount,
  'Manager Notes': notes.deletedCount,
  'Self Reflections': refs.deletedCount,
  'Feedback Items': fb.deletedCount,
  'Feedback Requests': reqs.deletedCount,
  'Quarterly OKRs': okrs.deletedCount,
});

console.log('🎉 System is now 100% empty and ready for a completely fresh test!');
await mongoose.disconnect();
