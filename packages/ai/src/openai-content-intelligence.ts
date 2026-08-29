import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';

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
  readonly safetyIdentifier: string;
  readonly systemPrompt: string;
  readonly userPrompt: string;
}

type ContentIntelligenceRequestFunction = (
  input: ProviderCall,
  options: { readonly timeout: number },
) => Promise<unknown>;

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
      return {
        result: response.output_parsed,
        usage: {
          ...emptyAiUsage(0, response.id),
          cachedInputTokens: finiteUsageCount(
            response.usage?.input_tokens_details?.cached_tokens,
          ),
          inputTokens: finiteUsageCount(response.usage?.input_tokens),
          outputTokens: finiteUsageCount(response.usage?.output_tokens),
          reasoningTokens: finiteUsageCount(
            response.usage?.output_tokens_details?.reasoning_tokens,
          ),
        },
      };
    };
  }

  public async analyze(
    request: ContentIntelligenceRequest,
  ): Promise<ContentIntelligenceResult> {
    const userPrompt = contentIntelligenceUserPrompt(request);
    const startedAt = Date.now();
    let raw: unknown;
    let usage = emptyAiUsage(0);
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
          provider: 'openai',
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
