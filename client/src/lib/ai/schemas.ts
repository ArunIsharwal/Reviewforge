import { z } from 'zod';

export const EvidenceRefSchema = z.object({
  id: z.string(),
  sourceType: z.enum(['OKR', 'PeerFeedback', 'SelfReflection', 'ManagerObservation', 'ProjectMilestone']),
  sourceId: z.string(),
  sourceTitle: z.string(),
  sourceDate: z.string(),
  excerpt: z.string(),
  metrics: z.string().optional(),
});

export const GeneratedSectionSchema = z.object({
  title: z.string(),
  content: z.string(),
  evidenceRefs: z.array(EvidenceRefSchema).default([]),
  isFlaggedForReview: z.boolean().default(false),
  flagReason: z.string().optional(),
});

export const GeminiReviewOutputSchema = z.object({
  overallRating: z.number().min(1.0).max(5.0),
  evidenceCoverageScore: z.number().min(0).max(100),
  qualitySummary: z.object({
    unsupportedClaimsCount: z.number().default(0),
    conflictingFeedbackDetected: z.boolean().default(false),
    conflictingDetails: z.string().optional(),
    missingEvidenceFlags: z.array(z.string()).default([]),
  }),
  sections: z.object({
    overallSummary: GeneratedSectionSchema,
    majorAchievements: GeneratedSectionSchema,
    keyStrengths: GeneratedSectionSchema,
    collaborationAndCommunication: GeneratedSectionSchema,
    okrAchievementSummary: GeneratedSectionSchema,
    areasForDevelopment: GeneratedSectionSchema,
    futureGoals: GeneratedSectionSchema,
    managerRecommendations: GeneratedSectionSchema,
  }),
});

export type GeminiReviewOutput = z.infer<typeof GeminiReviewOutputSchema>;

