import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';

import { z } from 'zod';

import { TranscriptionProviderError } from './openai-transcription.js';
import { distinctSpeakerCount } from './speakers.js';
import { emptyAiUsage } from './usage.js';

import type {
  TranscriptionProvider,
  TranscriptionRequest,
  TranscriptionResult,
  TranscriptionSegment,
} from './index.js';

const utteranceSchema = z.object({
  end: z.number().nonnegative(),
  speaker: z.number().int().nonnegative().optional(),
  start: z.number().nonnegative(),
  transcript: z.string(),
});

const alternativeSchema = z.object({
  transcript: z.string(),
});

const deepgramResponseSchema = z.object({
  metadata: z
    .object({
      duration: z.number().nonnegative().optional(),
      models: z.array(z.string()).optional(),
      request_id: z.string().optional(),
    })
    .optional(),
  results: z.object({
    channels: z
      .array(
        z.object({
          alternatives: z.array(alternativeSchema),
          detected_language: z.string().optional(),
        }),
      )
      .optional(),
    utterances: z.array(utteranceSchema).optional(),
  }),
});

export interface DeepgramTranscriptionProviderOptions {
  readonly apiKey: string;
  readonly model: string;
  readonly timeoutMs: number;
  readonly baseUrl?: string;
  /** Test seam; production always issues a real request. */
  readonly fetchImplementation?: typeof fetch;
}

const defaultBaseUrl = 'https://api.deepgram.com/v1/listen';

/**
 * Deepgram behind the domain-level TranscriptionProvider contract.
 *
 * It is chosen over a plain Whisper endpoint because it returns speaker-
 * attributed utterances. `docs/ai/architecture.md` commits Task 007 to
 * "timestamped speaker segments" and names speaker data as a Content
 * Intelligence input, so a non-diarizing provider would silently narrow what
 * Task 008 can build on.
 *
 * The pre-recorded endpoint is synchronous, so the worker needs no polling loop
 * and its existing per-job timeout and retry budget apply unchanged.
 */
export class DeepgramTranscriptionProvider implements TranscriptionProvider {
  private readonly fetchImplementation: typeof fetch;

  public constructor(
    private readonly options: DeepgramTranscriptionProviderOptions,
  ) {
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  public async transcribe(
    request: TranscriptionRequest,
  ): Promise<TranscriptionResult> {
    const startedAt = Date.now();
    const url = new URL(this.options.baseUrl ?? defaultBaseUrl);
    url.searchParams.set('model', this.options.model);
    // Deepgram deprecated `diarize=true` for prerecorded audio. Selecting the
    // current GA batch diarizer both enables attribution and avoids silently
    // receiving a successful response without speaker labels on newer
    // deployments.
    url.searchParams.set('diarize_model', 'latest');
    url.searchParams.set('utterances', 'true');
    url.searchParams.set('punctuate', 'true');
    url.searchParams.set('smart_format', 'true');
    if (request.language === undefined) {
      url.searchParams.set('detect_language', 'true');
    } else {
      url.searchParams.set('language', request.language);
    }

    const { size } = await stat(request.mediaUri);
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, this.options.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImplementation(url, {
        // Streamed from disk so a long recording is never held in memory.
        body: Readable.toWeb(
          createReadStream(request.mediaUri),
        ) as unknown as ReadableStream<Uint8Array>,
        duplex: 'half',
        headers: {
          Authorization: `Token ${this.options.apiKey}`,
          'Content-Length': String(size),
          'Content-Type': 'audio/mpeg',
        },
        method: 'POST',
        signal: controller.signal,
        // `duplex` is required by Node when the body is a stream, but it is not
        // part of the DOM RequestInit type this project compiles against.
      } as RequestInit);
    } catch (error) {
      throw new TranscriptionProviderError(
        `Deepgram transcription could not be reached: ${
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
      throw new TranscriptionProviderError(
        `Deepgram transcription failed with status ${response.status}.`,
        // 402 means the account is out of credit; retrying cannot fix that.
        response.status !== 402 &&
          (response.status === 429 || response.status >= 500),
        response.status === 402
          ? 'QUOTA'
          : response.status === 401 || response.status === 403
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

    let raw: unknown;
    try {
      raw = await response.json();
    } catch {
      throw new TranscriptionProviderError(
        'Deepgram returned a response that was not JSON.',
        true,
        'INVALID_RESPONSE',
        emptyAiUsage(Date.now() - startedAt),
      );
    }

    const parsed = deepgramResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new TranscriptionProviderError(
        'Deepgram returned an unexpected transcription response shape.',
        true,
        'INVALID_RESPONSE',
        emptyAiUsage(Date.now() - startedAt),
      );
    }

    const channel = parsed.data.results.channels?.[0];
    const utterances = parsed.data.results.utterances ?? [];
    if (utterances.length === 0) {
      throw new TranscriptionProviderError(
        'Deepgram returned no timestamped utterances.',
        false,
        'INVALID_RESPONSE',
        emptyAiUsage(Date.now() - startedAt),
      );
    }

    const segments: TranscriptionSegment[] = utterances.map((utterance) => ({
      endSeconds: utterance.end,
      // Deepgram numbers speakers; the domain stores a label.
      speaker:
        utterance.speaker === undefined ? null : `speaker_${utterance.speaker}`,
      startSeconds: utterance.start,
      text: utterance.transcript.trim(),
    }));

    return {
      diarized: true,
      durationSeconds: parsed.data.metadata?.duration ?? null,
      language: request.language ?? channel?.detected_language ?? null,
      model: this.options.model,
      provider: 'deepgram',
      segments,
      speakerCount: distinctSpeakerCount(segments),
      text:
        channel?.alternatives[0]?.transcript.trim() ??
        segments.map((segment) => segment.text).join(' '),
      usage: {
        ...emptyAiUsage(
          Date.now() - startedAt,
          parsed.data.metadata?.request_id ??
            response.headers.get('x-request-id'),
        ),
        audioSeconds: parsed.data.metadata?.duration ?? null,
      },
    };
  }
}
