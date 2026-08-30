import { z } from 'zod';

import {
  CreativeDirectorProviderError,
  creativeDirectorModelOutputSchema,
  creativeDirectorUserPrompt,
  type CreativeDirectorProvider,
  type CreativeDirectorProviderRequest,
  type CreativeDirectorProviderResponse,
} from './creative-director.js';
import { geminiApiRevision } from './gemini-content-intelligence.js';
import { emptyAiUsage, finiteUsageCount, type AiUsage } from './usage.js';

const defaultBaseUrl =
  'https://generativelanguage.googleapis.com/v1beta/interactions';
export const defaultGeminiCreativeDirectorModel = 'gemini-3.6-flash';
const unsupportedSchemaKeywords = new Set(['default', 'minItems', 'maxItems']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function singletonValue(schema: Record<string, unknown>): unknown {
  if ('const' in schema) {
    return schema.const;
  }
  return Array.isArray(schema.enum) && schema.enum.length === 1
    ? schema.enum[0]
    : undefined;
}

function mergePropertySchemas(
  schemas: readonly Record<string, unknown>[],
  property: string,
): Record<string, unknown> {
  const unique = new Map(
    schemas.map((schema) => [JSON.stringify(schema), schema] as const),
  );
  if (unique.size === 1) {
    return schemas[0] ?? {};
  }

  const values = schemas.map(singletonValue);
  if (values.every((value) => value !== undefined)) {
    const types = new Set(schemas.map((schema) => schema.type));
    return {
      ...(types.size === 1 && schemas[0]?.type !== undefined
        ? { type: schemas[0].type }
        : {}),
      enum: [...new Set(values)],
    };
  }

  throw new Error(
    `Gemini schema adapter cannot safely flatten property "${property}".`,
  );
}

function flattenObjectUnion(
  branches: readonly Record<string, unknown>[],
): Record<string, unknown> {
  const properties = new Map<string, Record<string, unknown>[]>();
  const requiredSets = branches.map(
    (branch) =>
      new Set(
        Array.isArray(branch.required)
          ? branch.required.filter(
              (value): value is string => typeof value === 'string',
            )
          : [],
      ),
  );

  for (const branch of branches) {
    if (!isRecord(branch.properties)) {
      throw new Error(
        'Gemini schema adapter can flatten only object unions with properties.',
      );
    }
    for (const [name, schema] of Object.entries(branch.properties)) {
      if (!isRecord(schema)) {
        throw new Error(
          `Gemini schema adapter found an invalid schema for "${name}".`,
        );
      }
      properties.set(name, [...(properties.get(name) ?? []), schema]);
    }
  }

  const mergedProperties = Object.fromEntries(
    [...properties.entries()].map(([name, schemas]) => [
      name,
      mergePropertySchemas(schemas, name),
    ]),
  );
  const required = [...(requiredSets[0] ?? [])].filter((name) =>
    requiredSets.every((set) => set.has(name)),
  );

  return {
    additionalProperties: false,
    properties: mergedProperties,
    ...(required.length === 0 ? {} : { required }),
    type: 'object',
  };
}

function adaptSchema(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(adaptSchema);
  }
  if (!isRecord(node)) {
    return node;
  }

  if (Array.isArray(node.oneOf)) {
    const branches = node.oneOf.map(adaptSchema);
    if (
      branches.every(
        (branch): branch is Record<string, unknown> =>
          isRecord(branch) && branch.type === 'object',
      )
    ) {
      return flattenObjectUnion(branches);
    }
  }

  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (key !== '$schema' && !unsupportedSchemaKeywords.has(key)) {
      output[key] = adaptSchema(value);
    }
  }
  return output;
}

export function geminiCreativeDirectorSchema(): Record<string, unknown> {
  return adaptSchema(
    z.toJSONSchema(creativeDirectorModelOutputSchema, { io: 'output' }),
  ) as Record<string, unknown>;
}

export interface GeminiCreativeDirectorProviderOptions {
  readonly apiKey: string;
  readonly model?: string;
  readonly timeoutMs: number;
  readonly baseUrl?: string;
  readonly fetchImplementation?: typeof fetch;
}

interface InteractionResponse {
  readonly id?: string;
  readonly output_text?: string;
  readonly status?: string;
  readonly steps?: readonly {
    readonly content?: readonly { readonly text?: string }[];
  }[];
  readonly usage?: {
    readonly total_cached_tokens?: number;
    readonly total_input_tokens?: number;
    readonly total_output_tokens?: number;
    readonly total_thought_tokens?: number;
  };
}

export class GeminiCreativeDirectorProvider implements CreativeDirectorProvider {
  private readonly fetchImplementation: typeof fetch;

  public constructor(
    private readonly options: GeminiCreativeDirectorProviderOptions,
  ) {
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  public async generate(
    request: CreativeDirectorProviderRequest,
  ): Promise<CreativeDirectorProviderResponse> {
    const model = this.options.model ?? defaultGeminiCreativeDirectorModel;
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.options.timeoutMs,
    );
    let response: Response;
    try {
      response = await this.fetchImplementation(
        this.options.baseUrl ?? defaultBaseUrl,
        {
          body: JSON.stringify({
            input: creativeDirectorUserPrompt(request.input),
            model,
            response_format: {
              mime_type: 'application/json',
              schema: geminiCreativeDirectorSchema(),
              type: 'text',
            },
            system_instruction: request.systemPrompt,
          }),
          headers: {
            'Api-Revision': geminiApiRevision,
            'Content-Type': 'application/json',
            'x-goog-api-key': this.options.apiKey,
          },
          method: 'POST',
          signal: controller.signal,
        },
      );
    } catch (error) {
      const timedOut = controller.signal.aborted;
      throw new CreativeDirectorProviderError(
        timedOut
          ? 'Gemini timed out while creating the EditPlan.'
          : `Gemini Creative Director could not be reached: ${
              error instanceof Error ? error.message : 'unknown error'
            }`,
        true,
        timedOut ? 'TIMEOUT' : 'PROVIDER_UNAVAILABLE',
        emptyAiUsage(Date.now() - startedAt),
      );
    } finally {
      clearTimeout(timeout);
    }

    const body = await readBody(response, startedAt);
    const usage = toUsage(body, Date.now() - startedAt);
    if (!response.ok) {
      throw httpError(response.status, usage);
    }
    if (body.status !== undefined && body.status !== 'completed') {
      throw new CreativeDirectorProviderError(
        `Gemini did not complete the Creative Director request (status ${body.status}).`,
        true,
        'PROVIDER_UNAVAILABLE',
        usage,
      );
    }
    const text =
      body.output_text ??
      (body.steps ?? [])
        .flatMap((step) => step.content ?? [])
        .map((content) => content.text ?? '')
        .join('');
    if (text.trim() === '') {
      throw new CreativeDirectorProviderError(
        'Gemini returned no Creative Director output.',
        true,
        'INVALID_RESPONSE',
        usage,
      );
    }
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new CreativeDirectorProviderError(
        'Gemini returned Creative Director output that was not valid JSON.',
        true,
        'INVALID_RESPONSE',
        usage,
      );
    }
    return {
      model,
      provider: 'gemini',
      raw,
      usage,
    };
  }
}

async function readBody(
  response: Response,
  startedAt: number,
): Promise<InteractionResponse> {
  try {
    return (await response.json()) as InteractionResponse;
  } catch {
    if (response.ok) {
      throw new CreativeDirectorProviderError(
        'Gemini returned a Creative Director response that was not JSON.',
        true,
        'INVALID_RESPONSE',
        emptyAiUsage(Date.now() - startedAt),
      );
    }
    return {};
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
): CreativeDirectorProviderError {
  if (status === 401 || status === 403) {
    return new CreativeDirectorProviderError(
      'Gemini rejected the Creative Director API key.',
      false,
      'AUTHENTICATION',
      usage,
    );
  }
  if (status === 429) {
    return new CreativeDirectorProviderError(
      'Gemini rate limited the Creative Director request or quota is exhausted.',
      true,
      'RATE_LIMIT',
      usage,
    );
  }
  if (status >= 500) {
    return new CreativeDirectorProviderError(
      `Gemini Creative Director failed with status ${status}.`,
      true,
      'PROVIDER_UNAVAILABLE',
      usage,
    );
  }
  return new CreativeDirectorProviderError(
    `Gemini Creative Director failed with status ${status}.`,
    false,
    'INVALID_REQUEST',
    usage,
  );
}
