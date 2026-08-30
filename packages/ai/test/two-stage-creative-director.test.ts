import { describe, expect, it, vi } from 'vitest';

import {
  TwoStageCreativeDirector,
  emptyAiUsage,
  geminiCreativeDirectorStageSchema,
  operationIntentPlanSchema,
  type OperationIntentPlan,
  type StagedCreativeDirectorProvider,
  type StagedCreativeDirectorProviderRequest,
} from '../src/index.js';

const source = {
  durationMs: 60_000,
  mediaAssetId: '11111111-1111-4111-8111-111111111111',
  source: 'SOURCE_MEDIA' as const,
};
const intentId = '22222222-2222-4222-8222-222222222222';

function intentPlan(
  overrides: Partial<OperationIntentPlan> = {},
): OperationIntentPlan {
  return operationIntentPlanSchema.parse({
    aspectRatio: '16:9',
    decisionSummary: ['Remove the opening.'],
    intents: [
      {
        id: intentId,
        instruction: 'Remove the first 8 seconds.',
        target: { kind: 'TIME' },
        type: 'REMOVE',
      },
    ],
    objective: 'Remove the opening.',
    planId: '33333333-3333-4333-8333-333333333333',
    platform: 'NONE',
    retention: 'KEEP_ALL_EXCEPT_REMOVED',
    warnings: [],
    ...overrides,
  });
}

function removeOperation() {
  return {
    id: intentId,
    target: { kind: 'TIME', range: { endMs: 8_000, startMs: 0 } },
    type: 'REMOVE',
  };
}

function provider(responses: readonly unknown[]) {
  const generateStage = vi.fn();
  responses.forEach((raw, index) => {
    generateStage.mockResolvedValueOnce({
      model: 'gemini-3.6-flash',
      provider: 'gemini',
      raw,
      usage: {
        ...emptyAiUsage(10 + index, `request-${index + 1}`),
        inputTokens: 100,
        outputTokens: 40,
      },
    });
  });
  return { generateStage } satisfies StagedCreativeDirectorProvider;
}

function grouped(type: string, target = 'TIME', operation: unknown) {
  return { groups: { [`${type}__${target}__NONE`]: [operation] } };
}

describe('two-stage Creative Director', () => {
  it.each([
    ['REMOVE', 'Remove the first 8 seconds.', 'TIME', undefined],
    ['INSERT_ASSET', 'Insert the supplied image.', 'TIME', undefined],
    ['ZOOM', 'Zoom on the speaker.', 'TIME', undefined],
    ['CAPTION', 'Add clean captions.', 'TIME', undefined],
    ['REFRAME', 'Make it vertical.', 'TIME', undefined],
    ['ZOOM', 'Zoom when apostles are discussed.', 'SEMANTIC', 'TOPIC'],
    [
      'INSERT_ASSET',
      'Show the asset when faith is discussed.',
      'SEMANTIC',
      'TOPIC',
    ],
  ] as const)(
    'validates a lightweight %s Stage 1 intent',
    (type, instruction, kind, semanticKind) => {
      expect(
        operationIntentPlanSchema.safeParse(
          intentPlan({
            intents: [
              {
                id: intentId,
                instruction,
                target: {
                  kind,
                  ...(semanticKind === undefined ? {} : { semanticKind }),
                },
                type,
              },
            ],
          }),
        ).success,
      ).toBe(true);
    },
  );

  it('rejects unsupported operation intent and incomplete semantic intent', () => {
    expect(
      operationIntentPlanSchema.safeParse({
        ...intentPlan(),
        intents: [
          {
            id: intentId,
            instruction: 'Cut it.',
            target: { kind: 'TIME' },
            type: 'CUT',
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      operationIntentPlanSchema.safeParse({
        ...intentPlan(),
        intents: [
          {
            id: intentId,
            instruction: 'When apostles.',
            target: { kind: 'SEMANTIC' },
            type: 'ZOOM',
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('builds small exact Stage 2 schemas without a union', () => {
    const schema = geminiCreativeDirectorStageSchema({
      groups: [
        { count: 1, key: 'ZOOM__TIME__NONE', targetKind: 'TIME', type: 'ZOOM' },
      ],
      kind: 'OPERATIONS',
    });
    const serialized = JSON.stringify(schema);
    expect(serialized).not.toContain('oneOf');
    expect(serialized).not.toContain('minItems');
    expect(serialized).not.toContain('maxItems');
    expect(serialized).not.toContain('"const"');
    expect(serialized).toContain('"enum":["ZOOM"]');
    expect(serialized).toContain(
      '"required":["id","target","easing","endScale","startScale","type"]',
    );
  });

  it('uses one batched Stage 2 call and produces a canonically valid plan', async () => {
    const staged = provider([
      intentPlan(),
      grouped('REMOVE', 'TIME', removeOperation()),
    ]);
    const attempts = vi.fn();
    const director = new TwoStageCreativeDirector(staged, {
      systemPrompt: 'system',
    });
    const result = await director.direct(
      { sourceMedia: source, userInstruction: 'Remove the first 8 seconds.' },
      { onAttempt: attempts, safetyIdentifier: 'tenant' },
    );

    expect(staged.generateStage).toHaveBeenCalledTimes(2);
    expect(
      staged.generateStage.mock.calls.map(
        ([request]) => (request as StagedCreativeDirectorProviderRequest).stage,
      ),
    ).toEqual(['INTENT', 'OPERATIONS']);
    expect(result.validationStatus).toBe('VALID');
    expect(result.metrics).toMatchObject({
      finalValidEditPlanRate: 1,
      providerCalls: 2,
      stage1SuccessRate: 1,
      stage2FirstPassValidRate: 1,
    });
    expect(attempts).toHaveBeenCalledTimes(2);
  });

  it('repairs a missing creative field once without inventing it locally', async () => {
    const plan = intentPlan({
      intents: [
        {
          id: intentId,
          instruction: 'Slowly zoom from 1 to 1.2.',
          target: { kind: 'TIME' },
          type: 'ZOOM',
        },
      ],
    });
    const incomplete = {
      easing: 'EASE_IN_OUT',
      id: intentId,
      startScale: 1,
      target: { kind: 'TIME', range: { endMs: 10_000, startMs: 0 } },
      type: 'ZOOM',
    };
    const repaired = { ...incomplete, endScale: 1.2 };
    const staged = provider([
      plan,
      grouped('ZOOM', 'TIME', incomplete),
      repaired,
    ]);
    const director = new TwoStageCreativeDirector(staged, {
      systemPrompt: 'system',
    });
    const result = await director.direct(
      { sourceMedia: source, userInstruction: 'Slowly zoom from 1 to 1.2.' },
      { safetyIdentifier: 'tenant' },
    );

    expect(staged.generateStage).toHaveBeenCalledTimes(3);
    expect(staged.generateStage.mock.calls[2]?.[0]).toMatchObject({
      stage: 'REPAIR',
    });
    expect(result.editPlan.operations[0]).toMatchObject({
      endScale: 1.2,
      type: 'ZOOM',
    });
    expect(result.metrics.repairSuccessRate).toBe(1);
    expect(result.metrics.stage2FirstPassValidRate).toBe(0);
  });

  it('stops after one failed repair', async () => {
    const plan = intentPlan({
      intents: [
        {
          id: intentId,
          instruction: 'Zoom.',
          target: { kind: 'TIME' },
          type: 'ZOOM',
        },
      ],
    });
    const invalid = {
      id: intentId,
      target: { kind: 'TIME', range: { endMs: 10_000, startMs: 0 } },
      type: 'ZOOM',
    };
    const staged = provider([plan, grouped('ZOOM', 'TIME', invalid), invalid]);
    const director = new TwoStageCreativeDirector(staged, {
      systemPrompt: 'system',
    });

    await expect(
      director.direct(
        { sourceMedia: source, userInstruction: 'Zoom.' },
        { safetyIdentifier: 'tenant' },
      ),
    ).rejects.toThrow('repair budget exhausted');
    expect(staged.generateStage).toHaveBeenCalledTimes(3);
  });

  it('repairs asset provenance through the model and keeps the stable asset ID', async () => {
    const assetId = '55555555-5555-4555-8555-555555555555';
    const plan = intentPlan({
      intents: [
        {
          assetId,
          id: intentId,
          instruction: 'Insert the supplied Jerusalem video.',
          target: { kind: 'TIME' },
          type: 'INSERT_ASSET',
        },
      ],
    });
    const invalid = {
      asset: { assetId, source: 'AI_GENERATED_ASSET' },
      fit: 'COVER',
      id: intentId,
      opacity: 1,
      target: { kind: 'TIME', range: { endMs: 15_000, startMs: 10_000 } },
      type: 'INSERT_ASSET',
    };
    const repaired = {
      ...invalid,
      asset: { assetId, source: 'USER_ASSET' },
    };
    const staged = provider([
      plan,
      grouped('INSERT_ASSET', 'TIME', invalid),
      repaired,
    ]);
    const director = new TwoStageCreativeDirector(staged, {
      systemPrompt: 'system',
    });
    const result = await director.direct(
      {
        availableAssets: [
          {
            assetId,
            durationMs: 5_000,
            kind: 'VIDEO',
            label: 'Jerusalem video',
            source: 'USER_ASSET',
          },
        ],
        sourceMedia: source,
        userInstruction: 'Insert the supplied Jerusalem video.',
      },
      { safetyIdentifier: 'tenant' },
    );

    expect(staged.generateStage).toHaveBeenCalledTimes(3);
    expect(result.editPlan.operations[0]).toMatchObject({
      asset: { assetId, source: 'USER_ASSET' },
    });
  });
});
