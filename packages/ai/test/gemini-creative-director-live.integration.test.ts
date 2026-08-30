import { describe, expect, it } from 'vitest';

import {
  GeminiCreativeDirectorProvider,
  TwoStageCreativeDirector,
} from '../src/index.js';

const live =
  process.env.CLIPGENIUS_LIVE_CREATIVE_DIRECTOR === '1' &&
  typeof process.env.GEMINI_API_KEY === 'string';

describe.skipIf(!live)('Gemini Creative Director live integration', () => {
  function director(): TwoStageCreativeDirector {
    return new TwoStageCreativeDirector(
      new GeminiCreativeDirectorProvider({
        apiKey: process.env.GEMINI_API_KEY ?? '',
        model: process.env.CLIPGENIUS_LIVE_GEMINI_MODEL ?? 'gemini-3.6-flash',
        timeoutMs: 180_000,
      }),
      {
        systemPrompt:
          'You are ClipGenius Creative Director. Follow the supplied stage task and exact schema. Never invent enum values, creative parameters, assets, or source facts.',
      },
    );
  }

  it(
    'runs Stage 1 and batched Stage 2 for a simple removal',
    { timeout: 360_000 },
    async () => {
      const result = await director().direct(
        {
          sourceMedia: {
            durationMs: 60_000,
            mediaAssetId: '11111111-1111-4111-8111-111111111111',
            source: 'SOURCE_MEDIA',
          },
          userInstruction: 'Remove the first 8 seconds.',
        },
        { safetyIdentifier: 'live-creative-director-simple' },
      );

      expect(result.validationStatus).toBe('VALID');
      expect(
        result.attempts.slice(0, 2).map((attempt) => attempt.stage),
      ).toEqual(['INTENT', 'OPERATIONS']);
      expect(
        result.attempts.slice(2).every((attempt) => attempt.stage === 'REPAIR'),
      ).toBe(true);
      process.stdout.write(
        `\nLIVE_CREATIVE_DIRECTOR_SIMPLE=${JSON.stringify({
          calls: result.metrics.providerCalls,
          costMicros: result.metrics.estimatedCostMicros?.toString() ?? null,
          firstPassRate: result.metrics.stage2FirstPassValidRate,
          latencyMs: result.metrics.totalLatencyMs,
          repairRate: result.metrics.repairSuccessRate,
        })}\n`,
      );
    },
  );

  it(
    'returns a canonically valid plan for mixed timing, semantic, asset, caption, and platform direction',
    { timeout: 180_000 },
    async () => {
      const result = await director().direct(
        {
          availableAssets: [
            {
              assetId: '22222222-2222-4222-8222-222222222222',
              durationMs: 5_000,
              kind: 'VIDEO',
              label: 'Jerusalem video',
              source: 'USER_ASSET',
              tags: ['Jerusalem'],
            },
          ],
          platform: 'INSTAGRAM',
          sourceMedia: {
            durationMs: 60_000,
            mediaAssetId: '11111111-1111-4111-8111-111111111111',
            source: 'SOURCE_MEDIA',
          },
          transcript: {
            diarized: true,
            id: '33333333-3333-4333-8333-333333333333',
            segments: [
              {
                endMs: 30_000,
                id: '44444444-4444-4444-8444-444444444444',
                speaker: 'speaker_0',
                startMs: 20_000,
                text: 'The apostles traveled through Jerusalem to share the message.',
              },
            ],
          },
          userInstruction:
            'Remove the first 8 seconds. When I mention the apostles, show my uploaded Jerusalem video with a slow zoom. Add clean captions and make it vertical for Instagram.',
        },
        { safetyIdentifier: 'live-creative-director-test' },
      );

      expect(result.validationStatus).toBe('VALID');
      expect(result.editPlan.schemaVersion).toBe('1.0');
      expect(result.editPlan.platform).toBe('INSTAGRAM');
      expect(result.editPlan.output.aspectRatio).toBe('9:16');
      expect(result.editPlan.operations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            target: {
              kind: 'TIME',
              range: { endMs: 8_000, startMs: 0 },
            },
            type: 'REMOVE',
          }),
        ]),
      );
      expect(
        result.attempts.slice(0, 2).map((attempt) => attempt.stage),
      ).toEqual(['INTENT', 'OPERATIONS']);
      expect(
        result.attempts.slice(2).every((attempt) => attempt.stage === 'REPAIR'),
      ).toBe(true);
      expect(result.metrics.finalValidEditPlanRate).toBe(1);
      process.stdout.write(
        `\nLIVE_CREATIVE_DIRECTOR_COMPLEX=${JSON.stringify({
          calls: result.metrics.providerCalls,
          costMicros: result.metrics.estimatedCostMicros?.toString() ?? null,
          firstPassRate: result.metrics.stage2FirstPassValidRate,
          latencyMs: result.metrics.totalLatencyMs,
          repairRate: result.metrics.repairSuccessRate,
          unresolvedRate: result.metrics.unresolvedSemanticRate,
        })}\n`,
      );
    },
  );
});
