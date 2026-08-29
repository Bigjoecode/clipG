import { z } from 'zod';

import {
  ContentIntelligenceProviderError,
  contentIntelligenceResultSchema,
  contentIntelligenceUserPrompt,
  parseContentIntelligence,
} from './content-intelligence-result.js';
import { emptyAiUsage, finiteUsageCount, type AiUsage } from './usage.js';

import type {
  ContentIntelligenceProvider,
  ContentIntelligenceRequest,
  ContentIntelligenceResult,
} from './index.js';

const defaultBaseUrl =
  'https://generativelanguage.googleapis.com/v1beta/interactions';

/**
 * Pins the request contract this adapter was written against.
 *
 * Google made the new structured-output shape the default on 2026-05-26 and
 * sunset the previous one on 2026-06-08. Sending the revision explicitly means a
 * future default change cannot silently reinterpret our requests.
 */
export const geminiApiRevision = '2026-05-20';

/**
 * JSON Schema keywords the Interactions API validator rejects.
 *
 * Established by live bisection against `gemini-3.7-flash`: the canonical schema
 * is accepted with every other constraint intact — enums, nested objects, arrays
 * of objects, `minimum`/`maximum`, `minLength`/`maxLength`, `additionalProperties`
 * and `required` — and rejected with a bare `400 invalid_request` the moment
 * array bounds appear. Removing only these two keywords turns the identical
 * request into a 200.
 *
 * Dropping them costs nothing in correctness: array bounds remain enforced by
 * the canonical Zod schema when the response is validated on the way back in.
 */
const unsupportedSchemaKeywords: readonly string[] = ['minItems', 'maxItems'];

function adaptSchemaForGemini(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map((entry) => adaptSchemaForGemini(entry));
  }
  if (node === null || typeof node !== 'object') {
    return node;
  }
  const adapted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    // `$schema` is JSON Schema metadata rather than a constraint.
    if (key === '$schema' || unsupportedSchemaKeywords.includes(key)) {
      continue;
    }
    adapted[key] = adaptSchemaForGemini(value);
  }
  return adapted;
}

/**
 * The provider-specific schema, derived from the canonical Zod schema rather
 * than written by hand.
 *
 * This is the provider-boundary rule in one function: the canonical schema stays
 * authoritative, Gemini's constraints are absorbed here, and no Gemini
 * limitation reaches the domain model. An earlier version of this adapter kept a
 * second schema written by hand, which needed a parity test to stop the two
 * drifting apart — deriving it removes that failure mode entirely.
 */
export function geminiContentIntelligenceSchema(): Record<string, unknown> {
  return adaptSchemaForGemini(
    z.toJSONSchema(contentIntelligenceResultSchema, { io: 'output' }),
  ) as Record<string, unknown>;
}

export interface GeminiContentIntelligenceProviderOptions {
  readonly apiKey: string;
  readonly model: string;
  readonly timeoutMs: number;
  readonly baseUrl?: string;
  /** Test seam; production always issues a real request. */
  readonly fetchImplementation?: typeof fetch;
}

interface InteractionStep {
  readonly content?: readonly { readonly text?: string }[];
}

interface InteractionResponse {
  readonly id?: string;
  readonly output_text?: string;
  readonly status?: string;
  readonly steps?: readonly InteractionStep[];
  readonly usage?: {
    readonly total_cached_tokens?: number;
    readonly total_input_tokens?: number;
    readonly total_output_tokens?: number;
    readonly total_thought_tokens?: number;
  };
}

/**
 * Google Gemini behind the domain-level ContentIntelligenceProvider contract,
 * on the Interactions API.
 *
 * Uses REST directly so the workspace gains no additional SDK dependency,
 * matching how the Deepgram adapter is built.
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
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, this.options.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImplementation(
        this.options.baseUrl ?? defaultBaseUrl,
        {
          body: JSON.stringify({
            input: contentIntelligenceUserPrompt(request),
            model: this.options.model,
            response_format: {
              mime_type: 'application/json',
              schema: geminiContentIntelligenceSchema(),
              type: 'text',
            },
            system_instruction: request.systemPrompt,
          }),
          headers: {
            'Api-Revision': geminiApiRevision,
            'Content-Type': 'application/json',
            // Sent as a header rather than a query parameter so the key cannot
            // leak through request logs or error URLs.
            'x-goog-api-key': this.options.apiKey,
          },
          method: 'POST',
          signal: controller.signal,
        },
      );
    } catch (error) {
      throw new ContentIntelligenceProviderError(
        `Gemini content analysis could not be reached: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
        true,
        'PROVIDER_UNAVAILABLE',
        emptyAiUsage(Date.now() - startedAt),
      );
    } finally {
      clearTimeout(timeout);
    }

    const body = await this.readBody(response, startedAt);
    const usage = toUsage(body, Date.now() - startedAt);

    if (!response.ok) {
      throw httpError(response.status, usage);
    }
    if (body.status !== undefined && body.status !== 'completed') {
      throw new ContentIntelligenceProviderError(
        `Gemini did not complete the analysis (status ${body.status}).`,
        true,
        'PROVIDER_UNAVAILABLE',
        usage,
      );
    }

    const text =
      body.output_text ??
      (body.steps ?? [])
        .flatMap((step) => step.content ?? [])
        .map((part) => part.text ?? '')
        .join('');
    if (text.trim() === '') {
      throw new ContentIntelligenceProviderError(
        'Gemini returned no content analysis.',
        true,
        'INVALID_RESPONSE',
        usage,
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
        usage,
      );
    }

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

  private async readBody(
    response: Response,
    startedAt: number,
  ): Promise<InteractionResponse> {
    try {
      return (await response.json()) as InteractionResponse;
    } catch {
      if (response.ok) {
        throw new ContentIntelligenceProviderError(
          'Gemini returned a response that was not JSON.',
          true,
          'INVALID_RESPONSE',
          emptyAiUsage(Date.now() - startedAt),
        );
      }
      return {};
    }
  }
}

function toUsage(body: InteractionResponse, latencyMs: number): AiUsage {
  return {
    ...emptyAiUsage(latencyMs, body.id ?? null),
    cachedInputTokens: finiteUsageCount(body.usage?.total_cached_tokens),
    inputTokens: finiteUsageCount(body.usage?.total_input_tokens),
    outputTokens: finiteUsageCount(body.usage?.total_output_tokens),
    reasoningTokens: finiteUsageCount(body.usage?.total_thought_tokens),
  };
}

function httpError(
  status: number,
  usage: AiUsage,
): ContentIntelligenceProviderError {
  if (status === 401 || status === 403) {
    return new ContentIntelligenceProviderError(
      'Gemini rejected the API key for content analysis.',
      false,
      'AUTHENTICATION',
      usage,
    );
  }
  if (status === 429) {
    // Rate limiting and an exhausted daily quota both arrive as 429. One bounded
    // retry is worth attempting either way; the ledger records what happened.
    return new ContentIntelligenceProviderError(
      'Gemini rate limited content analysis or the request quota is exhausted.',
      true,
      'RATE_LIMIT',
      usage,
    );
  }
  if (status >= 500) {
    return new ContentIntelligenceProviderError(
      `Gemini content analysis failed with status ${status}.`,
      true,
      'PROVIDER_UNAVAILABLE',
      usage,
    );
  }
  return new ContentIntelligenceProviderError(
    `Gemini content analysis failed with status ${status}.`,
    false,
    'INVALID_REQUEST',
    usage,
  );
}
