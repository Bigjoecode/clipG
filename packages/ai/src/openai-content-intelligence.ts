import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';

import type {
  ContentIntelligenceProvider,
  ContentIntelligenceRequest,
  ContentIntelligenceResult,
} from './index.js';

const scoreSchema = z.number().int().min(0).max(100);

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
            .array(z.enum(['YOUTUBE', 'INSTAGRAM', 'TIKTOK', 'FACEBOOK']))
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
          type: z.enum([
            'STORY',
            'ARGUMENT',
            'INSIGHT',
            'QUESTION_ANSWER',
            'QUOTE',
            'HOOK',
            'CALL_TO_ACTION',
            'EMOTIONAL_MOMENT',
            'VISUAL_OPPORTUNITY',
          ]),
        }),
      )
      .max(12),
    summary: z.string().trim().min(1).max(4_000),
    topics: z.array(z.string().trim().min(1).max(160)).max(30),
  })
  .strict();

interface ProviderCall {
  readonly model: string;
  readonly safetyIdentifier: string;
  readonly systemPrompt: string;
  readonly userPrompt: string;
}

type ContentIntelligenceRequestFunction = (
  input: ProviderCall,
  options: { readonly timeout: number },
) => Promise<unknown>;

export class ContentIntelligenceProviderError extends Error {
  public constructor(
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'ContentIntelligenceProviderError';
  }
}

export interface OpenAIContentIntelligenceProviderOptions {
  readonly apiKey: string;
  readonly model: string;
  readonly timeoutMs: number;
  /** Test seam; production always uses the official OpenAI client. */
  readonly request?: ContentIntelligenceRequestFunction;
}

export class OpenAIContentIntelligenceProvider implements ContentIntelligenceProvider {
  private readonly request: ContentIntelligenceRequestFunction;

  public constructor(
    private readonly options: OpenAIContentIntelligenceProviderOptions,
  ) {
    if (options.request !== undefined) {
      this.request = options.request;
      return;
    }
    const client = new OpenAI({ apiKey: options.apiKey, maxRetries: 0 });
    this.request = async (input, requestOptions) => {
      const response = await client.responses.parse(
        {
          input: [
            { content: input.systemPrompt, role: 'system' },
            { content: input.userPrompt, role: 'user' },
          ],
          max_output_tokens: 10_000,
          model: input.model,
          reasoning: { effort: 'low' },
          safety_identifier: input.safetyIdentifier,
          store: false,
          text: {
            format: zodTextFormat(
              contentIntelligenceResultSchema,
              'content_intelligence',
            ),
          },
        },
        requestOptions,
      );
      return response.output_parsed;
    };
  }

  public async analyze(
    request: ContentIntelligenceRequest,
  ): Promise<ContentIntelligenceResult> {
    const userPrompt = JSON.stringify({
      diarized: request.diarized,
      durationSeconds: request.durationSeconds,
      language: request.language,
      project: request.project,
      segments: request.segments,
      speakerCount: request.speakerCount,
    });
    let raw: unknown;
    try {
      raw = await this.request(
        {
          model: this.options.model,
          safetyIdentifier: request.safetyIdentifier,
          systemPrompt: request.systemPrompt,
          userPrompt,
        },
        { timeout: this.options.timeoutMs },
      );
    } catch (error) {
      throw providerError(error);
    }

    const parsed = contentIntelligenceResultSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ContentIntelligenceProviderError(
        'OpenAI returned content intelligence that did not match the required schema.',
        true,
      );
    }
    for (const opportunity of parsed.data.opportunities) {
      const selectedDuration =
        opportunity.endSeconds - opportunity.startSeconds;
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
          'OpenAI returned content intelligence with invalid source evidence or timing.',
          true,
        );
      }
    }
    return {
      ...parsed.data,
      model: this.options.model,
      provider: 'openai',
    };
  }
}

function normalizeEvidence(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replaceAll(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function providerError(error: unknown): ContentIntelligenceProviderError {
  if (error instanceof ContentIntelligenceProviderError) {
    return error;
  }
  if (error instanceof OpenAI.APIError) {
    const outOfQuota =
      error.code === 'insufficient_quota' ||
      error.code === 'billing_hard_limit_reached';
    const retryable =
      !outOfQuota &&
      (error.status === undefined ||
        error.status === 408 ||
        error.status === 409 ||
        error.status === 429 ||
        error.status >= 500);
    return new ContentIntelligenceProviderError(
      outOfQuota
        ? 'OpenAI rejected content analysis because the API project has no remaining quota.'
        : `OpenAI content analysis failed with status ${error.status ?? 'unknown'}.`,
      retryable,
    );
  }
  return new ContentIntelligenceProviderError(
    `OpenAI content analysis failed: ${
      error instanceof Error ? error.message : 'unknown error'
    }`,
    true,
  );
}
