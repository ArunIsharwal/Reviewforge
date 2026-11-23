import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { seedInitialFeedback } from '../dist/models/Feedback.js';
import { seedInitialFeedbackRequests } from '../dist/models/FeedbackRequest.js';
import { seedInitialOKRs } from '../dist/models/OKR.js';
import { seedInitialManagerNotes } from '../dist/models/ManagerNote.js';
import { seedInitialSelfReflections } from '../dist/models/SelfReflection.js';
import { seedInitialPerformanceReviews } from '../dist/models/PerformanceReview.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/reviewforge';

async function main() {
  await mongoose.connect(uri);
  console.log('Connected to Atlas.');

  await seedInitialOKRs();
  await seedInitialFeedback();
  await seedInitialFeedbackRequests();
  await seedInitialManagerNotes();
  await seedInitialSelfReflections();
  await seedInitialPerformanceReviews();

  console.log('Seeding completed successfully!');
  process.exit(0);
}

main().catch(err => {
  console.error('Seeding error:', err);
  process.exit(1);
});
