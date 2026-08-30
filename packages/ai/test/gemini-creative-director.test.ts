import { describe, expect, it, vi } from 'vitest';

import {
  GeminiCreativeDirectorProvider,
  creativeDirectorInputSchema,
  geminiApiRevision,
  geminiCreativeDirectorSchema,
} from '../src/index.js';
import type { CreativeDirectorProviderError } from '../src/index.js';

const plan = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  metadata: { createdBy: 'AI' },
  objective: 'Remove the opening.',
  operations: [
    {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      target: { kind: 'TIME', range: { endMs: 8_000, startMs: 0 } },
      type: 'REMOVE',
    },
  ],
  output: { aspectRatio: '16:9' },
  platform: 'NONE',
  retention: 'KEEP_ALL_EXCEPT_REMOVED',
  schemaVersion: '1.0',
  source: {
    durationMs: 60_000,
    mediaAssetId: '11111111-1111-4111-8111-111111111111',
    source: 'SOURCE_MEDIA',
  },
};
const raw = {
  decisionSummary: ['Removed the first eight seconds as requested.'],
  editPlan: plan,
  unresolvedReferences: [],
  warnings: [],
};
const input = creativeDirectorInputSchema.parse({
  sourceMedia: plan.source,
  userInstruction: 'Remove the first 8 seconds.',
});

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

describe('Gemini Creative Director provider', () => {
  it('derives the provider schema while retaining canonical post-validation', () => {
    const serialized = JSON.stringify(geminiCreativeDirectorSchema());
    expect(serialized).not.toContain('minItems');
    expect(serialized).not.toContain('maxItems');
    expect(serialized).toContain('schemaVersion');
    expect(serialized).toContain('SOURCE_MEDIA');
  });

  it('constructs a pinned Interactions request without putting the key in the URL', async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(
      response({
        id: 'request-1',
        output_text: JSON.stringify(raw),
        status: 'completed',
        usage: { total_input_tokens: 100, total_output_tokens: 50 },
      }),
    );
    const provider = new GeminiCreativeDirectorProvider({
      apiKey: 'gemini-secret-key-value',
      fetchImplementation,
      model: 'gemini-3.6-flash',
      timeoutMs: 10_000,
    });
    const result = await provider.generate({
      input,
      safetyIdentifier: 'tenant-hash',
      systemPrompt: 'system instruction',
    });
    const [url, init] = fetchImplementation.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/interactions',
    );
    expect(url).not.toContain('gemini-secret-key-value');
    expect((init.headers as Record<string, string>)['Api-Revision']).toBe(
      geminiApiRevision,
    );
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe(
      'gemini-secret-key-value',
    );
    expect(typeof init.body).toBe('string');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: 'gemini-3.6-flash',
      system_instruction: 'system instruction',
    });
    expect(result.raw).toEqual(raw);
    expect(result.usage).toMatchObject({
      inputTokens: 100,
      outputTokens: 50,
      requestId: 'request-1',
    });
  });

  it('reads steps output and rejects malformed JSON safely', async () => {
    const valid = new GeminiCreativeDirectorProvider({
      apiKey: 'gemini-secret-key-value',
      fetchImplementation: vi
        .fn()
        .mockResolvedValue(
          response({ steps: [{ content: [{ text: JSON.stringify(raw) }] }] }),
        ),
      model: 'gemini-3.6-flash',
      timeoutMs: 10_000,
    });
    await expect(
      valid.generate({ input, safetyIdentifier: 'x', systemPrompt: 'system' }),
    ).resolves.toMatchObject({ raw });

    const invalid = new GeminiCreativeDirectorProvider({
      apiKey: 'gemini-secret-key-value',
      fetchImplementation: vi
        .fn()
        .mockResolvedValue(response({ output_text: 'not-json' })),
      model: 'gemini-3.6-flash',
      timeoutMs: 10_000,
    });
    await expect(
      invalid.generate({
        input,
        safetyIdentifier: 'x',
        systemPrompt: 'system',
      }),
    ).rejects.toMatchObject({ category: 'INVALID_RESPONSE' });
  });

  it.each([
    [401, false, 'AUTHENTICATION'],
    [429, true, 'RATE_LIMIT'],
    [500, true, 'PROVIDER_UNAVAILABLE'],
    [400, false, 'INVALID_REQUEST'],
  ] as const)('classifies HTTP %s', async (status, retryable, category) => {
    const provider = new GeminiCreativeDirectorProvider({
      apiKey: 'gemini-secret-key-value',
      fetchImplementation: vi.fn().mockResolvedValue(response({}, status)),
      model: 'gemini-3.6-flash',
      timeoutMs: 10_000,
    });
    await expect(
      provider.generate({
        input,
        safetyIdentifier: 'x',
        systemPrompt: 'system',
      }),
    ).rejects.toMatchObject({
      category,
      retryable,
    } satisfies Partial<CreativeDirectorProviderError>);
  });
});
