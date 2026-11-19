import { PerformanceReview, ReviewSection } from '@/types';
import { SynthesisInput, LocalReviewSynthesizer } from '@/lib/ai-synthesizer/engine';
import { envConfig } from '@/lib/config/env';
import { getGeminiClient } from './gemini-client';
import { buildCompactEvidencePacket, buildReviewSynthesisPrompt } from './prompts';
import { GeminiReviewOutputSchema } from './schemas';

export class ReviewGeneratorService {
  /**
   * Synthesizes an evidence-backed annual performance review.
   * Uses Google Gemini when API key is configured; otherwise uses deterministic local engine.
   */
  public static async generateReview(input: SynthesisInput): Promise<PerformanceReview> {
    const ai = getGeminiClient();

    // 1. If Gemini is not configured, fall back to deterministic local synthesizer
    if (!ai) {
      console.log('Gemini AI not configured. Using verified deterministic local synthesizer.');
      return LocalReviewSynthesizer.synthesizeFullReview(input);
    }

    try {
      // 2. Prepare compact, privacy-conscious evidence packet
      const packet = buildCompactEvidencePacket(input, envConfig.allowRealEmployeeData);
      const prompt = buildReviewSynthesisPrompt(packet);

      console.log(`Calling Gemini API (${envConfig.geminiModel}) for ${input.employee.name}...`);

      // 3. Invoke Google Gemini with structured JSON output
      const response = await ai.models.generateContent({
        model: envConfig.geminiModel,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.2,
        },
      });

      const responseText = response.text;
      if (!responseText) {
        throw new Error('Gemini returned an empty response.');
      }

      // 4. Parse and validate JSON with Zod schema
      const parsedJson = JSON.parse(responseText);
      const validation = GeminiReviewOutputSchema.safeParse(parsedJson);

      if (!validation.success) {
        console.warn('Gemini output did not match expected schema:', validation.error);
        console.warn('Falling back safely to deterministic local review synthesizer.');
        const fallback = LocalReviewSynthesizer.synthesizeFullReview(input);
        fallback.synthesisEngine = `Local Verified Engine (Gemini schema fallback)`;
        return fallback;
      }

      const validatedOutput = validation.data;

      // 5. Cross-verify every evidence reference against source evidence IDs
      const verifyEvidenceRefs = (section: { title: string; content: string; evidenceRefs: typeof packet.evidenceItems }): ReviewSection => {
        const verifiedRefs = (section.evidenceRefs || []).map((ref, idx) => {
          const isKnownId = packet.validEvidenceIds.includes(ref.evidenceId || (ref as unknown as { id: string }).id);
          return {
            id: (ref as unknown as { id: string }).id || `ref-${idx}`,
            sourceType: ref.sourceType,
            sourceId: ref.evidenceId || (ref as unknown as { sourceId: string }).sourceId || 'src-1',
            sourceTitle: ref.sourceTitle,
            sourceDate: ref.date || 'FY2026',
            excerpt: ref.verbatimExcerpt || (ref as unknown as { excerpt: string }).excerpt || '',
            metrics: ref.metrics,
            isFlaggedForReview: !isKnownId,
            flagReason: isKnownId ? undefined : 'Unverified claim: citation ID not found in source records',
          };
        });

        return {
          id: `sec-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          title: section.title,
          content: section.content,
          evidenceRefs: verifiedRefs,
        };
      };

      const sections = {
        overallSummary: verifyEvidenceRefs(validatedOutput.sections.overallSummary as unknown as { title: string; content: string; evidenceRefs: typeof packet.evidenceItems }),
        majorAchievements: verifyEvidenceRefs(validatedOutput.sections.majorAchievements as unknown as { title: string; content: string; evidenceRefs: typeof packet.evidenceItems }),
        keyStrengths: verifyEvidenceRefs(validatedOutput.sections.keyStrengths as unknown as { title: string; content: string; evidenceRefs: typeof packet.evidenceItems }),
        collaborationAndCommunication: verifyEvidenceRefs(validatedOutput.sections.collaborationAndCommunication as unknown as { title: string; content: string; evidenceRefs: typeof packet.evidenceItems }),
        okrAchievementSummary: verifyEvidenceRefs(validatedOutput.sections.okrAchievementSummary as unknown as { title: string; content: string; evidenceRefs: typeof packet.evidenceItems }),
        areasForDevelopment: verifyEvidenceRefs(validatedOutput.sections.areasForDevelopment as unknown as { title: string; content: string; evidenceRefs: typeof packet.evidenceItems }),
        futureGoals: verifyEvidenceRefs(validatedOutput.sections.futureGoals as unknown as { title: string; content: string; evidenceRefs: typeof packet.evidenceItems }),
        managerRecommendations: verifyEvidenceRefs(validatedOutput.sections.managerRecommendations as unknown as { title: string; content: string; evidenceRefs: typeof packet.evidenceItems }),
      };

      return {
        id: `rev-${input.employee.id}-${Date.now().toString().slice(-4)}`,
        organizationId: input.employee.organizationId || 'org-default-1',
        employeeId: input.employee.id,
        employeeName: input.employee.name,
        jobTitle: input.employee.jobTitle,
        departmentName: input.employee.departmentName,
        reviewCycleId: input.reviewCycleId,
        reviewCycleTitle: input.reviewCycleTitle,
        status: 'Draft',
        overallRating: validatedOutput.overallRating,
        evidenceCoverageScore: validatedOutput.evidenceCoverageScore,
        synthesisEngine: `Google Gemini (${envConfig.geminiModel})`,
        generatedAt: new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
        sections,
        managerFeedbackNotes: 'Synthesized via Google Gemini with verified evidence grounding.',
      };
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : 'Unknown AI error';
      console.error(`Gemini synthesis error: ${errMsg}`);
      console.log('Falling back to local deterministic synthesizer.');

      const fallback = LocalReviewSynthesizer.synthesizeFullReview(input);
      fallback.synthesisEngine = `Local Engine (Gemini fallback: ${errMsg.slice(0, 40)}...)`;
      return fallback;
    }
  }

  /**
   * Regenerates a single targeted review section.
   */
  public static async regenerateSection(
    sectionKey: keyof PerformanceReview['sections'],
    input: SynthesisInput
  ): Promise<ReviewSection> {
    // For single section regeneration, use the verified local synthesizer for immediate zero-latency edit
    return LocalReviewSynthesizer.regenerateSection(sectionKey, input);
  }
}

