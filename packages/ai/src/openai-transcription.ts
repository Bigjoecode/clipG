import { createReadStream } from 'node:fs';

import OpenAI from 'openai';
import { z } from 'zod';

import type {
  TranscriptionProvider,
  TranscriptionRequest,
  TranscriptionResult,
} from './index.js';

const diarizedResponseSchema = z.object({
  duration: z.number().nonnegative(),
  segments: z.array(
    z.object({
      end: z.number().nonnegative(),
      speaker: z.string().trim().min(1).max(64),
      start: z.number().nonnegative(),
      text: z.string(),
      type: z.literal('transcript.text.segment'),
    }),
  ),
  task: z.literal('transcribe'),
  text: z.string(),
});

interface TranscriptionCreateInput {
  readonly chunking_strategy: 'auto';
  readonly file: ReturnType<typeof createReadStream>;
  readonly language?: string;
  readonly model: string;
  readonly response_format: 'diarized_json';
}

type TranscriptionRequestFunction = (
  input: TranscriptionCreateInput,
  options: { readonly timeout: number },
) => Promise<unknown>;

export class TranscriptionProviderError extends Error {
  public constructor(
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'TranscriptionProviderError';
  }
}

export interface OpenAITranscriptionProviderOptions {
  readonly apiKey: string;
  readonly model: string;
  readonly timeoutMs: number;
  /** Test seam; production always uses the official OpenAI client. */
  readonly request?: TranscriptionRequestFunction;
}

/**
 * OpenAI remains behind the domain-level TranscriptionProvider contract. Raw
 * provider output is schema-validated before the worker can persist it.
 */
export class OpenAITranscriptionProvider implements TranscriptionProvider {
  private readonly request: TranscriptionRequestFunction;

  public constructor(
    private readonly options: OpenAITranscriptionProviderOptions,
  ) {
    if (options.request !== undefined) {
      this.request = options.request;
      return;
    }
    const client = new OpenAI({ apiKey: options.apiKey, maxRetries: 0 });
    this.request = async (input, requestOptions) =>
      client.audio.transcriptions.create(
        {
          ...input,
          file: input.file,
          stream: false,
        },
        requestOptions,
      );
  }

  public async transcribe(
    request: TranscriptionRequest,
  ): Promise<TranscriptionResult> {
    const file = createReadStream(request.mediaUri);
    let raw: unknown;
    try {
      raw = await this.request(
        {
          chunking_strategy: 'auto',
          file,
          ...(request.language === undefined
            ? {}
            : { language: request.language }),
          model: this.options.model,
          response_format: 'diarized_json',
        },
        { timeout: this.options.timeoutMs },
      );
    } catch (error) {
      throw providerError(error);
    } finally {
      file.destroy();
    }

    const parsed = diarizedResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new TranscriptionProviderError(
        'OpenAI returned an invalid diarized transcription response.',
        true,
      );
    }
    return {
      durationSeconds: parsed.data.duration,
      language: request.language ?? null,
      model: this.options.model,
      provider: 'openai',
      segments: parsed.data.segments.map((segment) => ({
        endSeconds: segment.end,
        speaker: segment.speaker,
        startSeconds: segment.start,
        text: segment.text.trim(),
      })),
      text: parsed.data.text.trim(),
    };
  }
}

function providerError(error: unknown): TranscriptionProviderError {
  if (error instanceof TranscriptionProviderError) {
    return error;
  }
  if (error instanceof OpenAI.APIError) {
    const retryable =
      error.status === undefined ||
      error.status === 408 ||
      error.status === 409 ||
      error.status === 429 ||
      error.status >= 500;
    return new TranscriptionProviderError(
      `OpenAI transcription failed with status ${error.status ?? 'unknown'}.`,
      retryable,
    );
  }
  return new TranscriptionProviderError(
    `OpenAI transcription failed: ${
      error instanceof Error ? error.message : 'unknown error'
    }`,
    true,
  );
}
