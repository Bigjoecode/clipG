import {
  ContentIntelligenceProviderError,
  contentIntelligencePlatforms,
  contentIntelligenceOpportunityTypes,
  contentIntelligenceUserPrompt,
  maxContentIntelligenceOpportunities,
  parseContentIntelligence,
} from './content-intelligence-result.js';
import { emptyAiUsage, finiteUsageCount } from './usage.js';

import type {
  ContentIntelligenceProvider,
  ContentIntelligenceRequest,
  ContentIntelligenceResult,
} from './index.js';

const defaultBaseUrl = 'https://generativelanguage.googleapis.com/v1beta';

const scoreProperty = {
  maximum: 100,
  minimum: 0,
  type: 'INTEGER',
} as const;

/**
 * Gemini constrains decoding to an OpenAPI-subset schema rather than full JSON
 * Schema, so the shape is declared here instead of derived from Zod. It is a
 * decoding hint, not the gate: `parseContentIntelligence` still validates the
 * response against the canonical Zod schema and grounds it in the transcript.
 * `gemini-content-intelligence.test.ts` asserts the two agree on keys, types,
 * and enums so this cannot drift silently.
 */
export const geminiContentIntelligenceSchema = {
  properties: {
    keywords: { items: { type: 'STRING' }, maxItems: 30, type: 'ARRAY' },
    opportunities: {
      items: {
        properties: {
          endSeconds: { type: 'NUMBER' },
          evidenceText: { type: 'STRING' },
          hook: { type: 'STRING' },
          rationale: { type: 'STRING' },
          recommendedDurationSeconds: { type: 'INTEGER' },
          recommendedPlatforms: {
            items: { enum: [...contentIntelligencePlatforms], type: 'STRING' },
            maxItems: 4,
            minItems: 1,
            type: 'ARRAY',
          },
          scores: {
            properties: {
              clarity: scoreProperty,
              emotionalImpact: scoreProperty,
              hook: scoreProperty,
              platformFit: scoreProperty,
              retentionPotential: scoreProperty,
              standaloneValue: scoreProperty,
            },
            propertyOrdering: [
              'clarity',
              'emotionalImpact',
              'hook',
              'platformFit',
              'retentionPotential',
              'standaloneValue',
            ],
            required: [
              'clarity',
              'emotionalImpact',
              'hook',
              'platformFit',
              'retentionPotential',
              'standaloneValue',
            ],
            type: 'OBJECT',
          },
          startSeconds: { type: 'NUMBER' },
          summary: { type: 'STRING' },
          title: { type: 'STRING' },
          topic: { type: 'STRING' },
          type: {
            enum: [...contentIntelligenceOpportunityTypes],
            type: 'STRING',
          },
        },
        required: [
          'endSeconds',
          'evidenceText',
          'hook',
          'rationale',
          'recommendedDurationSeconds',
          'recommendedPlatforms',
          'scores',
          'startSeconds',
          'summary',
          'title',
          'topic',
          'type',
        ],
        type: 'OBJECT',
      },
      maxItems: maxContentIntelligenceOpportunities,
      type: 'ARRAY',
    },
    summary: { type: 'STRING' },
    topics: { items: { type: 'STRING' }, maxItems: 30, type: 'ARRAY' },
  },
  required: ['keywords', 'opportunities', 'summary', 'topics'],
  type: 'OBJECT',
} as const;

export interface GeminiContentIntelligenceProviderOptions {
  readonly apiKey: string;
  readonly model: string;
  readonly timeoutMs: number;
  readonly baseUrl?: string;
  /** Test seam; production always issues a real request. */
  readonly fetchImplementation?: typeof fetch;
}

interface GeminiCandidate {
  readonly content?: { readonly parts?: readonly { readonly text?: string }[] };
  readonly finishReason?: string;
}

interface GeminiResponse {
  readonly id?: string;
  readonly output_text?: string;
  readonly status?: string;
  readonly usage?: {
    readonly total_cached_tokens?: number;
    readonly total_input_tokens?: number;
    readonly total_output_tokens?: number;
    readonly total_thought_tokens?: number;
  };
  readonly steps?: readonly unknown[];
  readonly candidates?: readonly GeminiCandidate[];
  readonly promptFeedback?: { readonly blockReason?: string };
}

/**
 * Google Gemini behind the domain-level ContentIntelligenceProvider contract.
 *
 * Chosen for its native `responseSchema`, which constrains decoding rather than
 * merely asking for JSON — that matters for a schema this large, because every
 * malformed response costs a full retry of a long transcript.
 *
 * Uses the REST endpoint directly so the workspace gains no additional SDK
 * dependency, matching how the Deepgram adapter is built.
 */
export class GeminiContentIntelligenceProvider implements ContentIntelligenceProvider {
  private readonly fetchImplementation: typeof fetch;

  public constructor(
    private readonly options: GeminiContentIntelligenceProviderOptions,
  ) {
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  public async analyze(
    request: ContentIntelligenceRequest,
  ): Promise<ContentIntelligenceResult> {
    const startedAt = Date.now();
    const base = this.options.baseUrl ?? defaultBaseUrl;
    const url = `${base}/interactions`;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, this.options.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImplementation(url, {
        body: JSON.stringify({
          input: contentIntelligenceUserPrompt(request),
          model: this.options.model,
          response_format: {
            mime_type: 'application/json',
            schema: JSON.parse(
              JSON.stringify(geminiContentIntelligenceSchema).replace(
                /"type":"([A-Z]+)"/g,
                (_match, type: string) => `"type":"${type.toLowerCase()}"`,
              ),
            ) as unknown,
            type: 'text',
          },
          store: false,
          system_instruction: request.systemPrompt,
        }),
        headers: {
          'Content-Type': 'application/json',
          // Sent as a header rather than a query parameter so the key cannot
          // leak through request logs or error URLs.
          'x-goog-api-key': this.options.apiKey,
        },
        method: 'POST',
        signal: controller.signal,
      });
    } catch (error) {
      throw new ContentIntelligenceProviderError(
        `Gemini content analysis could not be reached: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
        true,
        error instanceof Error && error.name === 'AbortError'
          ? 'TIMEOUT'
          : 'PROVIDER_UNAVAILABLE',
        emptyAiUsage(Date.now() - startedAt),
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new ContentIntelligenceProviderError(
        response.status === 429
          ? 'Gemini rate limited content analysis or the request quota is exhausted.'
          : `Gemini content analysis failed with status ${response.status}.`,
        response.status === 429 || response.status >= 500,
        response.status === 401 || response.status === 403
          ? 'AUTHENTICATION'
          : response.status === 429
            ? 'RATE_LIMIT'
            : response.status >= 500
              ? 'PROVIDER_UNAVAILABLE'
              : 'INVALID_REQUEST',
        emptyAiUsage(
          Date.now() - startedAt,
          response.headers.get('x-request-id'),
        ),
      );
    }

    let body: GeminiResponse;
    try {
      body = (await response.json()) as GeminiResponse;
    } catch {
      throw new ContentIntelligenceProviderError(
        'Gemini returned a response that was not JSON.',
        true,
        'INVALID_RESPONSE',
        emptyAiUsage(Date.now() - startedAt),
      );
    }

    if (body.promptFeedback?.blockReason !== undefined) {
      throw new ContentIntelligenceProviderError(
        `Gemini declined to analyze this transcript (${body.promptFeedback.blockReason}).`,
        false,
        'CONTENT_POLICY',
        emptyAiUsage(Date.now() - startedAt, body.id ?? null),
      );
    }

    const candidate = body.candidates?.[0];
    // A truncated candidate yields unparseable JSON; say so plainly rather than
    // reporting it as a schema violation.
    if (candidate?.finishReason === 'MAX_TOKENS') {
      throw new ContentIntelligenceProviderError(
        'Gemini truncated the analysis before it was complete.',
        true,
        'INVALID_RESPONSE',
        emptyAiUsage(Date.now() - startedAt, body.id ?? null),
      );
    }

    const text =
      body.output_text ??
      candidate?.content?.parts?.map((part) => part.text ?? '').join('') ??
      findInteractionText(body.steps);
    if (text === undefined || text.trim() === '') {
      throw new ContentIntelligenceProviderError(
        'Gemini returned no content analysis.',
        true,
        'INVALID_RESPONSE',
        emptyAiUsage(Date.now() - startedAt, body.id ?? null),
      );
    }

    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new ContentIntelligenceProviderError(
        'Gemini returned content intelligence that was not valid JSON.',
        true,
        'INVALID_RESPONSE',
        emptyAiUsage(Date.now() - startedAt, body.id ?? null),
      );
    }

    const usage = {
      ...emptyAiUsage(
        Date.now() - startedAt,
        body.id ?? response.headers.get('x-request-id'),
      ),
      cachedInputTokens: finiteUsageCount(body.usage?.total_cached_tokens),
      inputTokens: finiteUsageCount(body.usage?.total_input_tokens),
      outputTokens: finiteUsageCount(body.usage?.total_output_tokens),
      reasoningTokens: finiteUsageCount(body.usage?.total_thought_tokens),
    };
    return {
      ...parseContentIntelligence(
        raw,
        request,
        { model: this.options.model, provider: 'gemini' },
        usage,
      ),
      usage,
    };
  }
}

function findInteractionText(
  steps: readonly unknown[] | undefined,
): string | undefined {
  if (steps === undefined) return undefined;
  const visit = (value: unknown): string | undefined => {
    if (typeof value === 'object' && value !== null) {
      const record = value as Record<string, unknown>;
      if (record.type === 'text' && typeof record.text === 'string') {
        return record.text;
      }
      for (const child of Object.values(record)) {
        const found = visit(child);
        if (found !== undefined) return found;
      }
    } else if (Array.isArray(value)) {
      for (const child of value) {
        const found = visit(child);
        if (found !== undefined) return found;
      }
    }
    return undefined;
  };
  return visit(steps);
}
