import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

import {
  ContentIntelligenceProviderError,
  contentIntelligenceResultSchema,
  contentIntelligenceUserPrompt,
  parseContentIntelligence,
} from './content-intelligence-result.js';
import { emptyAiUsage, finiteUsageCount } from './usage.js';

import type {
  ContentIntelligenceProvider,
  ContentIntelligenceRequest,
  ContentIntelligenceResult,
} from './index.js';

interface ProviderCall {
  readonly model: string;
  readonly systemPrompt: string;
  readonly userPrompt: string;
}

type ContentIntelligenceRequestFunction = (
  input: ProviderCall,
  options: { readonly timeout: number },
) => Promise<unknown>;

export interface AnthropicContentIntelligenceProviderOptions {
  readonly apiKey: string;
  readonly model: string;
  readonly timeoutMs: number;
  /** Test seam; production always uses the official Anthropic client. */
  readonly request?: ContentIntelligenceRequestFunction;
}

/**
 * Anthropic behind the domain-level ContentIntelligenceProvider contract.
 *
 * Unlike the Gemini adapter, this one hands the canonical Zod schema straight to
 * the API through `zodOutputFormat`, so there is no second hand-written schema to
 * keep in sync and no OpenAPI-subset translation to get wrong.
 *
 * SDK-level retries are disabled because BullMQ owns the visible retry budget
 * and the job's recorded state.
 */
export class AnthropicContentIntelligenceProvider implements ContentIntelligenceProvider {
  private readonly request: ContentIntelligenceRequestFunction;

  public constructor(
    private readonly options: AnthropicContentIntelligenceProviderOptions,
  ) {
    if (options.request !== undefined) {
      this.request = options.request;
      return;
    }
    const client = new Anthropic({ apiKey: options.apiKey, maxRetries: 0 });
    this.request = async (input, requestOptions) => {
      const response = await client.messages.parse(
        {
          max_tokens: 16_000,
          messages: [{ content: input.userPrompt, role: 'user' }],
          model: input.model,
          output_config: {
            format: zodOutputFormat(contentIntelligenceResultSchema),
          },
          system: input.systemPrompt,
        },
        requestOptions,
      );
      if (response.stop_reason === 'refusal') {
        throw new ContentIntelligenceProviderError(
          'Claude declined to analyze this transcript.',
          false,
          'CONTENT_POLICY',
        );
      }
      if (response.stop_reason === 'max_tokens') {
        throw new ContentIntelligenceProviderError(
          'Claude truncated the analysis before it was complete.',
          true,
          'INVALID_RESPONSE',
        );
      }
      // parsed_output is null when the response could not be parsed into the
      // schema; the shared validator turns that into a retryable schema error.
      return {
        result: response.parsed_output,
        usage: {
          ...emptyAiUsage(0, response._request_id ?? null),
          cachedInputTokens: finiteUsageCount(
            response.usage.cache_read_input_tokens,
          ),
          cacheWriteTokens: finiteUsageCount(
            response.usage.cache_creation_input_tokens,
          ),
          inputTokens: finiteUsageCount(response.usage.input_tokens),
          outputTokens: finiteUsageCount(response.usage.output_tokens),
        },
      };
    };
  }

  public async analyze(
    request: ContentIntelligenceRequest,
  ): Promise<ContentIntelligenceResult> {
    const startedAt = Date.now();
    let raw: unknown;
    let usage = emptyAiUsage(0);
    try {
      raw = await this.request(
        {
          model: this.options.model,
          systemPrompt: request.systemPrompt,
          userPrompt: contentIntelligenceUserPrompt(request),
        },
        { timeout: this.options.timeoutMs },
      );
    } catch (error) {
      throw providerError(error);
    }

    if (
      typeof raw === 'object' &&
      raw !== null &&
      'result' in raw &&
      'usage' in raw
    ) {
      const wrapped = raw as {
        readonly result: unknown;
        readonly usage: typeof usage;
      };
      raw = wrapped.result;
      usage = { ...wrapped.usage, latencyMs: Date.now() - startedAt };
    } else {
      usage = emptyAiUsage(Date.now() - startedAt);
    }

    return {
      ...parseContentIntelligence(
        raw,
        request,
        {
          model: this.options.model,
          provider: 'anthropic',
        },
        usage,
      ),
      usage,
    };
  }
}

function providerError(error: unknown): ContentIntelligenceProviderError {
  if (error instanceof ContentIntelligenceProviderError) {
    return error;
  }
  if (error instanceof Anthropic.APIError) {
    // A depleted balance surfaces as a 400 and can never succeed on retry, so it
    // is terminal rather than another wasted attempt over a long transcript.
    const outOfCredit =
      error.status === 400 && /credit balance/i.test(error.message);
    const retryable =
      !outOfCredit &&
      (error.status === undefined ||
        error.status === 408 ||
        error.status === 409 ||
        error.status === 429 ||
        error.status >= 500);
    return new ContentIntelligenceProviderError(
      outOfCredit
        ? 'Anthropic rejected content analysis because the account has no remaining credit.'
        : `Anthropic content analysis failed with status ${error.status ?? 'unknown'}.`,
      retryable,
      outOfCredit
        ? 'QUOTA'
        : error.status === 401 || error.status === 403
          ? 'AUTHENTICATION'
          : error.status === 429
            ? 'RATE_LIMIT'
            : error.status !== undefined && error.status >= 500
              ? 'PROVIDER_UNAVAILABLE'
              : 'INVALID_REQUEST',
    );
  }
  return new ContentIntelligenceProviderError(
    `Anthropic content analysis failed: ${
      error instanceof Error ? error.message : 'unknown error'
    }`,
    true,
    error instanceof Error && error.name === 'AbortError'
      ? 'TIMEOUT'
      : 'UNKNOWN',
  );
}
