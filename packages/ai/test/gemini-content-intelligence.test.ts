import { describe, expect, it, vi } from 'vitest';

import {
  ContentIntelligenceProviderError,
  GeminiContentIntelligenceProvider,
  geminiContentIntelligenceSchema,
  contentIntelligenceResultSchema,
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

const validResult = {
  keywords: ['faith', 'courage'],
  opportunities: [
    {
      endSeconds: 30,
      evidenceText: 'Faith is not the absence of fear',
      hook: 'Faith is not the absence of fear',
      rationale: 'A self-contained definition with a clear turn.',
      recommendedDurationSeconds: 30,
      recommendedPlatforms: ['YOUTUBE', 'TIKTOK'],
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
    },
  ],
  summary: 'A short teaching on faith and courage.',
  topics: ['Faith', 'Courage'],
};

function geminiResponse(payload: unknown, status = 200): Response {
  return new Response(
    JSON.stringify({
      candidates: [
        {
          content: { parts: [{ text: JSON.stringify(payload) }] },
          finishReason: 'STOP',
        },
      ],
    }),
    { headers: { 'Content-Type': 'application/json' }, status },
  );
}

function provider(fetchImplementation: typeof fetch) {
  return new GeminiContentIntelligenceProvider({
    apiKey: 'gemini-test-key',
    fetchImplementation,
    model: 'gemini-2.5-flash',
    timeoutMs: 300_000,
  });
}

describe('GeminiContentIntelligenceProvider', () => {
  it('returns grounded opportunities tagged with the provider and model', async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse(validResult));

    const result = await provider(fetchMock).analyze(request);

    expect(result.provider).toBe('gemini');
    expect(result.model).toBe('gemini-2.5-flash');
    expect(result.opportunities).toHaveLength(1);
    expect(result.opportunities[0]?.title).toBe('Faith is a decision');
  });

  it('normalizes Gemini interaction usage and request provenance', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'interaction-1',
          output_text: JSON.stringify(validResult),
          status: 'completed',
          usage: {
            total_cached_tokens: 10,
            total_input_tokens: 120,
            total_output_tokens: 40,
            total_thought_tokens: 5,
          },
        }),
        { status: 200 },
      ),
    );

    const result = await provider(fetchMock).analyze(request);
    expect(result.usage).toMatchObject({
      cachedInputTokens: 10,
      inputTokens: 120,
      outputTokens: 40,
      reasoningTokens: 5,
      requestId: 'interaction-1',
    });
  });

  it('constrains decoding with a response schema and hides the key from the URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse(validResult));

    await provider(fetchMock).analyze(request);

    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit & { body: string },
    ];
    expect(url).not.toContain('gemini-test-key');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe(
      'gemini-test-key',
    );
    const body = JSON.parse(init.body) as {
      model: string;
      response_format: { mime_type: string; schema: unknown; type: string };
      store: boolean;
      system_instruction: string;
    };
    expect(url.endsWith('/interactions')).toBe(true);
    expect(body.response_format.mime_type).toBe('application/json');
    expect(body.response_format.type).toBe('text');
    expect(body.response_format.schema).toMatchObject({ type: 'object' });
    expect(body.store).toBe(false);
    expect(body.system_instruction).toBe(request.systemPrompt);
  });

  it('rejects an opportunity quoting text absent from its own time range', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      geminiResponse({
        ...validResult,
        opportunities: [
          {
            ...validResult.opportunities[0],
            evidenceText: 'a sentence the speaker never said',
          },
        ],
      }),
    );

    await expect(provider(fetchMock).analyze(request)).rejects.toBeInstanceOf(
      ContentIntelligenceProviderError,
    );
  });

  it('rejects an opportunity running past the end of the recording', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      geminiResponse({
        ...validResult,
        opportunities: [{ ...validResult.opportunities[0], endSeconds: 900 }],
      }),
    );

    await expect(provider(fetchMock).analyze(request)).rejects.toBeInstanceOf(
      ContentIntelligenceProviderError,
    );
  });

  it('reports an exhausted quota as retryable rate limiting', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('{}', { status: 429 }));

    await expect(provider(fetchMock).analyze(request)).rejects.toMatchObject({
      retryable: true,
    });
  });

  it('does not retry a client error such as an unknown model', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('{}', { status: 404 }));

    await expect(provider(fetchMock).analyze(request)).rejects.toMatchObject({
      retryable: false,
    });
  });

  it('does not retry a transcript the model refused to analyze', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } }),
        {
          status: 200,
        },
      ),
    );

    await expect(provider(fetchMock).analyze(request)).rejects.toMatchObject({
      retryable: false,
    });
  });

  it('reports a truncated answer as truncation rather than a schema fault', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: { parts: [{ text: '{"summary":' }] },
              finishReason: 'MAX_TOKENS',
            },
          ],
        }),
        { status: 200 },
      ),
    );

    await expect(provider(fetchMock).analyze(request)).rejects.toThrow(
      /truncated/i,
    );
  });
});

describe('geminiContentIntelligenceSchema', () => {
  // Gemini constrains decoding to an OpenAPI subset, so its schema is written by
  // hand. This keeps it from drifting away from the Zod schema that actually
  // gates the result.
  it('requires exactly the keys the canonical result schema requires', () => {
    const canonical = Object.keys(contentIntelligenceResultSchema.shape).sort();

    expect([...geminiContentIntelligenceSchema.required].sort()).toEqual(
      canonical,
    );
    expect(
      Object.keys(geminiContentIntelligenceSchema.properties).sort(),
    ).toEqual(canonical);
  });

  it('offers the same opportunity fields, types, and platforms', () => {
    const opportunityShape =
      contentIntelligenceResultSchema.shape.opportunities.element.shape;
    const geminiOpportunity =
      geminiContentIntelligenceSchema.properties.opportunities.items;

    expect([...geminiOpportunity.required].sort()).toEqual(
      Object.keys(opportunityShape).sort(),
    );
    expect(Object.keys(geminiOpportunity.properties).sort()).toEqual(
      Object.keys(opportunityShape).sort(),
    );
    expect([...geminiOpportunity.properties.type.enum].sort()).toEqual(
      [...opportunityShape.type.options].sort(),
    );
    expect(
      [...geminiOpportunity.properties.recommendedPlatforms.items.enum].sort(),
    ).toEqual(
      [...opportunityShape.recommendedPlatforms.element.options].sort(),
    );
  });
});
