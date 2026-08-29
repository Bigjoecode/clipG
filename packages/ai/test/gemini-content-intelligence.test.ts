import { describe, expect, it, vi } from 'vitest';

import {
  ContentIntelligenceProviderError,
  GeminiContentIntelligenceProvider,
  geminiApiRevision,
  geminiContentIntelligenceSchema,
} from '../src/index.js';

import type { ContentIntelligenceRequest } from '../src/index.js';

const request: ContentIntelligenceRequest = {
  diarized: true,
  durationSeconds: 65,
  language: 'en',
  project: { description: 'Sunday service clips', name: 'Sunday Service' },
  safetyIdentifier: 'organization-1',
  segments: [
    {
      endSeconds: 30,
      speaker: 'speaker_0',
      startSeconds: 0,
      text: 'Faith is not the absence of fear but the decision to move anyway.',
    },
    {
      endSeconds: 65,
      speaker: 'speaker_0',
      startSeconds: 30,
      text: 'That is what the cross teaches us about courage.',
    },
  ],
  speakerCount: 1,
  systemPrompt: 'Find content opportunities.',
};

const opportunity = {
  endSeconds: 30,
  evidenceText: 'Faith is not the absence of fear',
  hook: 'Faith is not the absence of fear',
  rationale: 'A self-contained definition with a clear turn.',
  recommendedDurationSeconds: 30,
  recommendedPlatforms: ['YOUTUBE'],
  scores: {
    clarity: 90,
    emotionalImpact: 80,
    hook: 85,
    platformFit: 75,
    retentionPotential: 70,
    standaloneValue: 88,
  },
  startSeconds: 0,
  summary: 'Defines faith as action despite fear.',
  title: 'Faith is a decision',
  topic: 'Faith',
  type: 'QUOTE',
};

const validResult = {
  keywords: ['faith'],
  opportunities: [opportunity],
  summary: 'A short teaching on faith and courage.',
  topics: ['Faith'],
};

function interaction(
  payload: unknown,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: 'v1_interaction_id',
    status: 'completed',
    steps: [{ content: [{ text: JSON.stringify(payload) }] }],
    usage: {
      total_cached_tokens: 0,
      total_input_tokens: 1_200,
      total_output_tokens: 480,
      total_thought_tokens: 220,
    },
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

function provider(fetchImplementation: typeof fetch) {
  return new GeminiContentIntelligenceProvider({
    apiKey: 'gemini-test-key',
    fetchImplementation,
    model: 'gemini-3.7-flash',
    timeoutMs: 300_000,
  });
}

function collectKeys(node: unknown, found: Set<string>): Set<string> {
  if (Array.isArray(node)) {
    for (const entry of node) {
      collectKeys(entry, found);
    }
    return found;
  }
  if (node !== null && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      found.add(key);
      collectKeys(value, found);
    }
  }
  return found;
}

describe('geminiContentIntelligenceSchema', () => {
  it('omits only the keywords the Interactions API rejects', () => {
    const keys = collectKeys(geminiContentIntelligenceSchema(), new Set());

    expect(keys.has('minItems')).toBe(false);
    expect(keys.has('maxItems')).toBe(false);
    expect(keys.has('$schema')).toBe(false);
  });

  it('keeps the constraints the API does accept', () => {
    const keys = collectKeys(geminiContentIntelligenceSchema(), new Set());

    // Removing array bounds must not become an excuse to send a gutted schema.
    for (const kept of [
      'enum',
      'required',
      'properties',
      'minimum',
      'maximum',
      'minLength',
      'maxLength',
      'additionalProperties',
    ]) {
      expect(keys.has(kept)).toBe(true);
    }
  });

  it('is derived from the canonical schema rather than written by hand', () => {
    const schema = geminiContentIntelligenceSchema() as {
      properties: Record<string, unknown>;
    };

    expect(Object.keys(schema.properties).sort()).toEqual([
      'keywords',
      'opportunities',
      'summary',
      'topics',
    ]);
  });
});

describe('GeminiContentIntelligenceProvider', () => {
  it('calls the Interactions API with the pinned revision and a header key', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(interaction(validResult)));

    await provider(fetchMock).analyze(request);

    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit & { body: string; headers: Record<string, string> },
    ];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/interactions',
    );
    expect(url).not.toContain('gemini-test-key');
    expect(init.headers['Api-Revision']).toBe(geminiApiRevision);
    expect(init.headers['x-goog-api-key']).toBe('gemini-test-key');

    const body = JSON.parse(init.body) as {
      model: string;
      system_instruction: string;
      response_format: {
        type: string;
        mime_type: string;
        schema: unknown;
      };
    };
    expect(body.model).toBe('gemini-3.7-flash');
    expect(body.system_instruction).toBe('Find content opportunities.');
    expect(body.response_format.type).toBe('text');
    expect(body.response_format.mime_type).toBe('application/json');
    expect(body.response_format.schema).toEqual(
      geminiContentIntelligenceSchema(),
    );
  });

  it('returns grounded opportunities tagged with the provider and model', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(interaction(validResult)));

    const result = await provider(fetchMock).analyze(request);

    expect(result.provider).toBe('gemini');
    expect(result.model).toBe('gemini-3.7-flash');
    expect(result.opportunities[0]?.title).toBe('Faith is a decision');
  });

  it('reads the answer from output_text when that field is present', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        interaction(validResult, {
          output_text: JSON.stringify(validResult),
          steps: [],
        }),
      ),
    );

    const result = await provider(fetchMock).analyze(request);

    expect(result.opportunities).toHaveLength(1);
  });

  it('records usage and the provider request id for the ledger', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(interaction(validResult)));

    const result = await provider(fetchMock).analyze(request);

    expect(result.usage).toMatchObject({
      cachedInputTokens: 0,
      inputTokens: 1_200,
      outputTokens: 480,
      reasoningTokens: 220,
      requestId: 'v1_interaction_id',
    });
    expect(result.usage.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('still enforces the array bounds that were stripped from the sent schema', async () => {
    // The canonical schema caps opportunities at 12. Because maxItems cannot be
    // sent to Gemini, this is the check that proves the cap is still real.
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        interaction({
          ...validResult,
          opportunities: Array.from({ length: 13 }, () => opportunity),
        }),
      ),
    );

    await expect(provider(fetchMock).analyze(request)).rejects.toBeInstanceOf(
      ContentIntelligenceProviderError,
    );
  });

  it('still rejects an opportunity quoting text absent from its own range', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        interaction({
          ...validResult,
          opportunities: [
            { ...opportunity, evidenceText: 'a sentence never spoken' },
          ],
        }),
      ),
    );

    await expect(provider(fetchMock).analyze(request)).rejects.toBeInstanceOf(
      ContentIntelligenceProviderError,
    );
  });

  it('treats a rejected key as terminal', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: { message: 'bad key' } }, 401));

    await expect(provider(fetchMock).analyze(request)).rejects.toMatchObject({
      category: 'AUTHENTICATION',
      retryable: false,
    });
  });

  it('separates retryable rate limiting from a terminal invalid request', async () => {
    const limited = vi.fn().mockResolvedValue(jsonResponse({}, 429));
    await expect(provider(limited).analyze(request)).rejects.toMatchObject({
      category: 'RATE_LIMIT',
      retryable: true,
    });

    const invalid = vi.fn().mockResolvedValue(jsonResponse({}, 400));
    await expect(provider(invalid).analyze(request)).rejects.toMatchObject({
      category: 'INVALID_REQUEST',
      retryable: false,
    });

    const faulty = vi.fn().mockResolvedValue(jsonResponse({}, 503));
    await expect(provider(faulty).analyze(request)).rejects.toMatchObject({
      retryable: true,
    });
  });

  it('rejects an interaction that did not complete', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(interaction(validResult, { status: 'failed' })),
      );

    await expect(provider(fetchMock).analyze(request)).rejects.toMatchObject({
      retryable: true,
    });
  });

  it('rejects an empty or non-JSON answer', async () => {
    const empty = vi
      .fn()
      .mockResolvedValue(jsonResponse(interaction(validResult, { steps: [] })));
    await expect(provider(empty).analyze(request)).rejects.toMatchObject({
      category: 'INVALID_RESPONSE',
    });

    const garbled = vi.fn().mockResolvedValue(
      jsonResponse({
        id: 'x',
        status: 'completed',
        steps: [{ content: [{ text: 'not json' }] }],
      }),
    );
    await expect(provider(garbled).analyze(request)).rejects.toMatchObject({
      category: 'INVALID_RESPONSE',
    });
  });

  it('reports an unreachable host as retryable', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'));

    await expect(provider(fetchMock).analyze(request)).rejects.toMatchObject({
      category: 'PROVIDER_UNAVAILABLE',
      retryable: true,
    });
  });
});
