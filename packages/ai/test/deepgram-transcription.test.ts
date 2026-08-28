import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import {
  DeepgramTranscriptionProvider,
  TranscriptionProviderError,
} from '../src/index.js';

const fixturePath = fileURLToPath(import.meta.url);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

function provider(fetchImplementation: typeof fetch) {
  return new DeepgramTranscriptionProvider({
    apiKey: 'dg-test-key',
    fetchImplementation,
    model: 'nova-2',
    timeoutMs: 600_000,
  });
}

const twoSpeakerResponse = {
  metadata: { duration: 65.2 },
  results: {
    channels: [
      {
        alternatives: [
          { transcript: 'Welcome everyone. Thanks for having me.' },
        ],
        detected_language: 'en',
      },
    ],
    utterances: [
      { end: 3.5, speaker: 0, start: 0, transcript: 'Welcome everyone.' },
      {
        end: 6.1,
        speaker: 1,
        start: 3.6,
        transcript: 'Thanks for having me.',
      },
    ],
  },
};

describe('DeepgramTranscriptionProvider', () => {
  it('normalizes speaker-attributed utterances into transcript segments', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(twoSpeakerResponse));

    await expect(
      provider(fetchMock as unknown as typeof fetch).transcribe({
        mediaUri: fixturePath,
      }),
    ).resolves.toEqual({
      diarized: true,
      durationSeconds: 65.2,
      language: 'en',
      model: 'nova-2',
      provider: 'deepgram',
      segments: [
        {
          endSeconds: 3.5,
          speaker: 'speaker_0',
          startSeconds: 0,
          text: 'Welcome everyone.',
        },
        {
          endSeconds: 6.1,
          speaker: 'speaker_1',
          startSeconds: 3.6,
          text: 'Thanks for having me.',
        },
      ],
      speakerCount: 2,
      text: 'Welcome everyone. Thanks for having me.',
    });
  });

  it('requests diarized utterances so speaker data reaches the domain', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(twoSpeakerResponse));

    await provider(fetchMock).transcribe({
      mediaUri: fixturePath,
    });

    const requested = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requested.searchParams.get('diarize_model')).toBe('latest');
    expect(requested.searchParams.get('diarize')).toBeNull();
    expect(requested.searchParams.get('utterances')).toBe('true');
    expect(requested.searchParams.get('model')).toBe('nova-2');
  });

  it('detects the language when the caller does not specify one', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(twoSpeakerResponse));

    await provider(fetchMock).transcribe({
      mediaUri: fixturePath,
    });
    const withoutLanguage = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(withoutLanguage.searchParams.get('detect_language')).toBe('true');

    fetchMock.mockResolvedValue(jsonResponse(twoSpeakerResponse));
    await provider(fetchMock).transcribe({
      language: 'en',
      mediaUri: fixturePath,
    });
    const withLanguage = new URL(String(fetchMock.mock.calls[1]?.[0]));
    expect(withLanguage.searchParams.get('language')).toBe('en');
    expect(withLanguage.searchParams.get('detect_language')).toBeNull();
  });

  it('treats an exhausted account as a permanent failure', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ err_msg: 'no credit' }, 402));

    await expect(
      provider(fetchMock as unknown as typeof fetch).transcribe({
        mediaUri: fixturePath,
      }),
    ).rejects.toMatchObject({
      name: 'TranscriptionProviderError',
      retryable: false,
    });
  });

  it('treats rate limiting and server faults as retryable', async () => {
    for (const status of [429, 500, 503]) {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, status));

      await expect(
        provider(fetchMock as unknown as typeof fetch).transcribe({
          mediaUri: fixturePath,
        }),
      ).rejects.toMatchObject({ retryable: true });
    }
  });

  it('rejects a response that carries no timestamped utterances', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        metadata: { duration: 4 },
        results: { channels: [{ alternatives: [{ transcript: 'hello' }] }] },
      }),
    );

    await expect(
      provider(fetchMock as unknown as typeof fetch).transcribe({
        mediaUri: fixturePath,
      }),
    ).rejects.toBeInstanceOf(TranscriptionProviderError);
  });

  it('rejects an unexpected response shape', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ unexpected: true }));

    await expect(
      provider(fetchMock as unknown as typeof fetch).transcribe({
        mediaUri: fixturePath,
      }),
    ).rejects.toBeInstanceOf(TranscriptionProviderError);
  });
});
