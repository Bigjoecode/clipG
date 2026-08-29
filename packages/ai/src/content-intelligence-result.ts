import { z } from 'zod';

import type {
  AiErrorCategory,
  AiUsage,
  ContentIntelligenceRequest,
  ContentIntelligenceResult,
} from './index.js';

const scoreSchema = z.number().int().min(0).max(100);

export const contentIntelligenceOpportunityTypes = [
  'STORY',
  'ARGUMENT',
  'INSIGHT',
  'QUESTION_ANSWER',
  'QUOTE',
  'HOOK',
  'CALL_TO_ACTION',
  'EMOTIONAL_MOMENT',
  'VISUAL_OPPORTUNITY',
] as const;

export const contentIntelligencePlatforms = [
  'YOUTUBE',
  'INSTAGRAM',
  'TIKTOK',
  'FACEBOOK',
] as const;

export const maxContentIntelligenceOpportunities = 12;

export const contentIntelligenceResultSchema = z
  .object({
    keywords: z.array(z.string().trim().min(1).max(80)).max(30),
    opportunities: z
      .array(
        z.object({
          endSeconds: z.number().positive(),
          evidenceText: z.string().trim().min(1).max(1_000),
          hook: z.string().trim().min(1).max(280),
          rationale: z.string().trim().min(1).max(2_000),
          recommendedDurationSeconds: z.number().int().positive().max(600),
          recommendedPlatforms: z
            .array(z.enum(contentIntelligencePlatforms))
            .min(1)
            .max(4),
          scores: z.object({
            clarity: scoreSchema,
            emotionalImpact: scoreSchema,
            hook: scoreSchema,
            platformFit: scoreSchema,
            retentionPotential: scoreSchema,
            standaloneValue: scoreSchema,
          }),
          startSeconds: z.number().nonnegative(),
          summary: z.string().trim().min(1).max(2_000),
          title: z.string().trim().min(1).max(160),
          topic: z.string().trim().min(1).max(160),
          type: z.enum(contentIntelligenceOpportunityTypes),
        }),
      )
      .max(maxContentIntelligenceOpportunities),
    summary: z.string().trim().min(1).max(4_000),
    topics: z.array(z.string().trim().min(1).max(160)).max(30),
  })
  .strict();

export class ContentIntelligenceProviderError extends Error {
  public constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly category: AiErrorCategory = 'UNKNOWN',
    public readonly usage?: AiUsage,
  ) {
    super(message);
    this.name = 'ContentIntelligenceProviderError';
  }
}

function normalizeEvidence(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replaceAll(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * Schema-validates raw model output and grounds every opportunity in the
 * transcript it came from: the window must be real, fit inside the recording,
 * and quote text that actually occurs in the segments it spans.
 *
 * This is shared by every provider on purpose. Model output is untrusted, and a
 * cheaper or weaker model is more likely to invent a quote or a timestamp, not
 * less — so the grounding must not be something an adapter can forget to apply.
 */
export function parseContentIntelligence(
  raw: unknown,
  request: ContentIntelligenceRequest,
  source: { readonly provider: string; readonly model: string },
  usage?: AiUsage,
): Omit<ContentIntelligenceResult, 'usage'> {
  const parsed = contentIntelligenceResultSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ContentIntelligenceProviderError(
      'The model returned content intelligence that did not match the required schema.',
      true,
      'INVALID_RESPONSE',
      usage,
    );
  }

  for (const opportunity of parsed.data.opportunities) {
    const selectedDuration = opportunity.endSeconds - opportunity.startSeconds;
    const selectedText = request.segments
      .filter(
        (segment) =>
          segment.endSeconds > opportunity.startSeconds &&
          segment.startSeconds < opportunity.endSeconds,
      )
      .map((segment) => segment.text)
      .join(' ');
    if (
      opportunity.endSeconds > request.durationSeconds + 0.25 ||
      selectedDuration <= 0 ||
      opportunity.recommendedDurationSeconds > Math.ceil(selectedDuration) ||
      !normalizeEvidence(selectedText).includes(
        normalizeEvidence(opportunity.evidenceText),
      )
    ) {
      throw new ContentIntelligenceProviderError(
        'The model returned content intelligence with invalid source evidence or timing.',
        true,
        'INVALID_RESPONSE',
        usage,
      );
    }
  }

  return {
    ...parsed.data,
    model: source.model,
    provider: source.provider,
  };
}

/**
 * The prompt payload sent to every provider. Kept here so each adapter presents
 * the model with identical evidence and results stay comparable across them.
 */
export function contentIntelligenceUserPrompt(
  request: ContentIntelligenceRequest,
): string {
  return JSON.stringify({
    diarized: request.diarized,
    durationSeconds: request.durationSeconds,
    language: request.language,
    project: request.project,
    segments: request.segments,
    speakerCount: request.speakerCount,
  });
}
