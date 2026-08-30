import { describe, expect, it } from 'vitest';

import {
  CreativeDirector,
  GeminiCreativeDirectorProvider,
} from '../src/index.js';

const live =
  process.env.CLIPGENIUS_LIVE_CREATIVE_DIRECTOR === '1' &&
  typeof process.env.GEMINI_API_KEY === 'string';

describe.skipIf(!live)('Gemini Creative Director live integration', () => {
  it(
    'returns a canonically valid plan for mixed timing, semantic, asset, caption, and platform direction',
    { timeout: 180_000 },
    async () => {
      const director = new CreativeDirector(
        new GeminiCreativeDirectorProvider({
          apiKey: process.env.GEMINI_API_KEY ?? '',
          model: process.env.CLIPGENIUS_LIVE_GEMINI_MODEL ?? 'gemini-3.6-flash',
          timeoutMs: 180_000,
        }),
        {
          systemPrompt:
            'Return one valid ClipGenius EditPlan. Use schemaVersion 1.0 and only the exact operation, target, and trigger enum vocabulary supplied in the input. Never invent aliases.',
        },
      );

      const result = await director.direct(
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
      expect(result.usage.requestId).toBeTruthy();
    },
  );
});
