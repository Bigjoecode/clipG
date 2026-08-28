import { fileURLToPath } from 'node:url';

import OpenAI from 'openai';
import { describe, expect, it, vi } from 'vitest';

import {
  OpenAITranscriptionProvider,
  TranscriptionProviderError,
} from '../src/index.js';

const fixturePath = fileURLToPath(import.meta.url);

describe('OpenAITranscriptionProvider', () => {
  it('validates and normalizes diarized segments', async () => {
    const request = vi.fn().mockResolvedValue({
      duration: 65.2,
      segments: [
        {
          end: 3.5,
          speaker: 'A',
          start: 0,
          text: ' Welcome everyone. ',
          type: 'transcript.text.segment',
        },
      ],
      task: 'transcribe',
      text: ' Welcome everyone. ',
    });
    const provider = new OpenAITranscriptionProvider({
      apiKey: 'sk-test-placeholder-not-used',
      model: 'gpt-4o-transcribe-diarize',
      request,
      timeoutMs: 600_000,
    });

    await expect(
      provider.transcribe({ mediaUri: fixturePath }),
    ).resolves.toEqual({
      diarized: true,
      durationSeconds: 65.2,
      language: null,
      model: 'gpt-4o-transcribe-diarize',
      provider: 'openai',
      segments: [
        {
          endSeconds: 3.5,
          speaker: 'A',
          startSeconds: 0,
          text: 'Welcome everyone.',
        },
      ],
      speakerCount: 1,
      text: 'Welcome everyone.',
    });
    expect(request.mock.calls[0]?.[0]).toMatchObject({
      chunking_strategy: 'auto',
      model: 'gpt-4o-transcribe-diarize',
      response_format: 'diarized_json',
    });
  });

  it('rejects provider output that is missing timestamped segments', async () => {
    const provider = new OpenAITranscriptionProvider({
      apiKey: 'sk-test-placeholder-not-used',
      model: 'gpt-4o-transcribe-diarize',
      request: vi.fn().mockResolvedValue({ text: 'No segments' }),
      timeoutMs: 600_000,
    });

    await expect(
      provider.transcribe({ mediaUri: fixturePath }),
    ).rejects.toBeInstanceOf(TranscriptionProviderError);
  });

  it('treats an exhausted quota as terminal but rate limiting as retryable', async () => {
    function apiError(code: string) {
      // The SDK passes the unwrapped `error` body, which is where `code` lives.
      return new OpenAI.APIError(
        429,
        { code, message: 'Too Many Requests', type: 'insufficient_quota' },
        'Too Many Requests',
        undefined,
      );
    }
    function providerFor(code: string): OpenAITranscriptionProvider {
      return new OpenAITranscriptionProvider({
        apiKey: 'sk-test-placeholder-not-used',
        model: 'gpt-4o-transcribe-diarize',
        request: vi.fn().mockRejectedValue(apiError(code)),
        timeoutMs: 600_000,
      });
    }

    // Both arrive as HTTP 429; only the code says whether retrying can help.
    await expect(
      providerFor('insufficient_quota').transcribe({ mediaUri: fixturePath }),
    ).rejects.toMatchObject({ retryable: false });
    await expect(
      providerFor('rate_limit_exceeded').transcribe({ mediaUri: fixturePath }),
    ).rejects.toMatchObject({ retryable: true });
  });

  it('marks an ordinary transport failure as retryable', async () => {
    const provider = new OpenAITranscriptionProvider({
      apiKey: 'sk-test-placeholder-not-used',
      model: 'gpt-4o-transcribe-diarize',
      request: vi.fn().mockRejectedValue(new Error('socket closed')),
      timeoutMs: 600_000,
    });

    await expect(
      provider.transcribe({ mediaUri: fixturePath }),
    ).rejects.toMatchObject({ retryable: true });
  });
});
