import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { Employee } from '../models/Employee.js';
import { Department } from '../models/Department.js';
import { Organization } from '../models/Organization.js';
import { ReviewCycle } from '../models/ReviewCycle.js';
import { FeedbackItem } from '../models/Feedback.js';
import { FeedbackRequest } from '../models/FeedbackRequest.js';
import { OKR } from '../models/OKR.js';
import { ManagerNote } from '../models/ManagerNote.js';
import { SelfReflection } from '../models/SelfReflection.js';
import { PerformanceReview } from '../models/PerformanceReview.js';
import { AISynthesisLog } from '../models/AISynthesisLog.js';
import { Notification } from '../models/Notification.js';
import { AuditLog } from '../models/AuditLog.js';

export interface IndexReport {
  modelName: string;
  collectionName: string;
  indexCount: number;
  indexes: Array<{ name: string; key: Record<string, any>; unique?: boolean }>;
}

/**
 * Ensures all schema indexes are constructed in MongoDB and returns an audit report of active collection indexes.
 */
export async function ensureAllIndexes(): Promise<IndexReport[]> {
  const models = [
    User,
    Employee,
    Department,
    Organization,
    ReviewCycle,
    FeedbackItem,
    FeedbackRequest,
    OKR,
    ManagerNote,
    SelfReflection,
    PerformanceReview,
    AISynthesisLog,
    Notification,
    AuditLog,
  ];

  const reports: IndexReport[] = [];

  for (const model of models) {
    try {
      // 1. Trigger schema index synchronization
      await model.createIndexes();

      // 2. Query live active indexes from MongoDB native driver
      const rawIndexes = await model.collection.indexes();
      reports.push({
        modelName: model.modelName,
        collectionName: model.collection.collectionName,
        indexCount: rawIndexes.length,
        indexes: rawIndexes.map((idx: any) => ({
          name: idx.name,
          key: idx.key,
          unique: Boolean(idx.unique),
        })),
      });
    } catch (err: any) {
      console.warn(`Warning ensuring indexes for ${model.modelName}:`, err.message);
      reports.push({
        modelName: model.modelName,
        collectionName: model.collection?.collectionName || 'unknown',
        indexCount: 0,
        indexes: [],
      });
    }
  }

  return reports;
}
