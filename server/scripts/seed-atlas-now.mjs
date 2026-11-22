import mongoose from 'mongoose';
import { seedInitialFeedback } from '../dist/models/Feedback.js';
import { seedInitialFeedbackRequests } from '../dist/models/FeedbackRequest.js';
import { seedInitialOKRs } from '../dist/models/OKR.js';
import { seedInitialManagerNotes } from '../dist/models/ManagerNote.js';
import { seedInitialSelfReflections } from '../dist/models/SelfReflection.js';
import { seedInitialPerformanceReviews } from '../dist/models/PerformanceReview.js';

const uri = "mongodb+srv://arunisharwal_db_user:LdZzcZh5o8W3GqWJ@reviewforgecluster.0ldctlq.mongodb.net/reviewforge?retryWrites=true&w=majority&appName=ReviewForgeCluster";

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
