import { describe, expect, it, vi } from 'vitest';

import {
  CreativeDirector,
  CreativeDirectorProviderError,
  creativeDirectorEvaluationFixtures,
  creativeDirectorInputSchema,
  creativeDirectorUserPrompt,
  emptyAiUsage,
  parseCreativeDirectorOutput,
  type CreativeDirectorInput,
  type CreativeDirectorProvider,
} from '../src/index.js';

const SOURCE_ID = '11111111-1111-4111-8111-111111111111';
const ASSET_ID = '22222222-2222-4222-8222-222222222222';
const PLAN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OP_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const usage = emptyAiUsage(25, 'request-1');

function input(
  overrides: Partial<CreativeDirectorInput> = {},
): CreativeDirectorInput {
  return creativeDirectorInputSchema.parse({
    availableAssets: [
      {
        assetId: ASSET_ID,
        kind: 'VIDEO',
        label: 'Jerusalem video',
        source: 'USER_ASSET',
        tags: ['jerusalem'],
      },
    ],
    sourceMedia: {
      durationMs: 120_000,
      mediaAssetId: SOURCE_ID,
      source: 'SOURCE_MEDIA',
    },
    transcript: {
      diarized: true,
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      segments: [
        {
          endMs: 25_000,
          id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          speaker: 'Speaker 1',
          startMs: 20_000,
          text: 'The apostles carried the message.',
        },
      ],
    },
    userInstruction: 'Remove the first 8 seconds.',
    ...overrides,
  });
}

function plan(
  operation: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: PLAN_ID,
    metadata: { createdBy: 'AI' },
    objective: 'Follow the user instruction.',
    operations: [operation],
    output: { aspectRatio: '16:9' },
    platform: 'NONE',
    retention: 'KEEP_ALL_EXCEPT_REMOVED',
    schemaVersion: '1.0',
    source: {
      durationMs: 120_000,
      mediaAssetId: SOURCE_ID,
      source: 'SOURCE_MEDIA',
    },
    ...overrides,
  };
}

function modelOutput(
  editPlan: unknown,
  overrides: Record<string, unknown> = {},
) {
  return {
    decisionSummary: ['Applied the explicit current user instruction.'],
    editPlan,
    unresolvedReferences: [],
    warnings: [],
    ...overrides,
  };
}

const remove = {
  id: OP_ID,
  target: { kind: 'TIME', range: { endMs: 8_000, startMs: 0 } },
  type: 'REMOVE',
};

describe('Creative Director contracts', () => {
  it('validates minimal input while keeping optional evidence optional', () => {
    const parsed = creativeDirectorInputSchema.parse({
      sourceMedia: {
        durationMs: 60_000,
        mediaAssetId: SOURCE_ID,
        source: 'SOURCE_MEDIA',
      },
      userInstruction: 'Make this engaging.',
    });
    expect(parsed.creatorPreferences.autonomy).toBe('BALANCED');
    expect(parsed.availableAssets).toEqual([]);
  });

  it('rejects source media presented as a user asset and unknown URL fields', () => {
    expect(() =>
      creativeDirectorInputSchema.parse({
        sourceMedia: {
          durationMs: 60_000,
          mediaAssetId: SOURCE_ID,
          source: 'USER_ASSET',
          signedUrl: 'https://example.com/private',
        },
        userInstruction: 'Make this engaging.',
      }),
    ).toThrow();
  });

  it('drops a field belonging to a different operation type and warns', () => {
    // Providers receive a flattened schema, so a model can attach REPLACE_ASSET's
    // keepSourceAudio to an INSERT_ASSET. Live runs failed exactly this way.
    const output = parseCreativeDirectorOutput(
      modelOutput(
        plan({
          asset: { assetId: ASSET_ID, source: 'USER_ASSET' },
          fit: 'COVER',
          id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1',
          keepSourceAudio: true,
          opacity: 1,
          target: { kind: 'TIME', range: { endMs: 25_000, startMs: 20_000 } },
          type: 'INSERT_ASSET',
        }),
      ),
      input(),
      { model: 'gemini-3.6-flash', provider: 'gemini', usage },
    );

    expect(output.validationStatus).toBe('VALID');
    expect(output.editPlan.operations[0]?.type).toBe('INSERT_ASSET');
    expect(
      output.editPlan.operations[0] as Record<string, unknown>,
    ).not.toHaveProperty('keepSourceAudio');
    expect(output.warnings.some((w) => w.includes('keepSourceAudio'))).toBe(
      true,
    );
  });

  it('drops a range attached to a semantic target and warns', () => {
    const output = parseCreativeDirectorOutput(
      modelOutput(
        plan({
          id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2',
          target: {
            kind: 'SEMANTIC',
            leadMs: 0,
            occurrence: { select: 'FIRST' },
            range: { endMs: 25_000, startMs: 20_000 },
            trailMs: 0,
            trigger: { kind: 'PHRASE', match: 'CONTAINS', phrase: 'apostles' },
          },
          type: 'REMOVE',
        }),
      ),
      input(),
      { model: 'gemini-3.6-flash', provider: 'gemini', usage },
    );

    expect(output.warnings.some((w) => w.includes('range'))).toBe(true);
    expect(output.editPlan.operations).toHaveLength(1);
  });

  it('still rejects output that is wrong beyond stray keys', () => {
    expect(() =>
      parseCreativeDirectorOutput(
        modelOutput(plan({ ...remove, type: 'TELEPORT' })),
        input(),
        { model: 'gemini-3.6-flash', provider: 'gemini', usage },
      ),
    ).toThrow();
  });

  it('produces a canonically validated timestamp-accurate EditPlan', () => {
    const output = parseCreativeDirectorOutput(
      modelOutput(plan(remove)),
      input(),
      {
        model: 'gemini-3.6-flash',
        provider: 'gemini',
        usage,
      },
    );
    expect(output.validationStatus).toBe('VALID');
    expect(output.editPlan.operations[0]?.target).toEqual({
      kind: 'TIME',
      range: { endMs: 8_000, startMs: 0 },
    });
    expect(output.editPlan.source.source).toBe('SOURCE_MEDIA');
  });

  it('resolves one grounded phrase occurrence deterministically', () => {
    const semantic = {
      easing: 'EASE_IN_OUT',
      endScale: 1.1,
      id: OP_ID,
      startScale: 1,
      target: {
        kind: 'SEMANTIC',
        occurrence: { select: 'FIRST' },
        trigger: { kind: 'PHRASE', match: 'CONTAINS', phrase: 'apostles' },
      },
      type: 'ZOOM',
    };
    const output = parseCreativeDirectorOutput(
      modelOutput(plan(semantic)),
      input(),
      {
        model: 'gemini-3.6-flash',
        provider: 'gemini',
        usage,
      },
    );
    expect(output.editPlan.operations[0]?.target).toEqual({
      kind: 'TIME',
      range: { endMs: 25_000, startMs: 20_000 },
    });
  });

  it('keeps ambiguous semantic intent unresolved instead of guessing', () => {
    const ambiguousInput = input({
      transcript: {
        diarized: true,
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        segments: [
          {
            endMs: 25_000,
            id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            speaker: 'Speaker 1',
            startMs: 20_000,
            text: 'The apostles carried the message.',
          },
          {
            endMs: 65_000,
            id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
            speaker: 'Speaker 1',
            startMs: 60_000,
            text: 'Later the apostles returned.',
          },
        ],
      },
    });
    const semantic = {
      id: OP_ID,
      target: {
        kind: 'SEMANTIC',
        occurrence: { select: 'ALL' },
        trigger: { kind: 'PHRASE', phrase: 'apostles' },
      },
      text: 'Apostles',
      type: 'TEXT',
    };
    const output = parseCreativeDirectorOutput(
      modelOutput(plan(semantic)),
      ambiguousInput,
      {
        model: 'gemini-3.6-flash',
        provider: 'gemini',
        usage,
      },
    );
    expect(output.validationStatus).toBe('UNRESOLVED');
    expect(output.unresolvedReferences[0]).toMatchObject({
      kind: 'PHRASE',
      reason: 'AMBIGUOUS',
    });
  });

  it('accepts a real user asset and rejects missing or false-provenance IDs', () => {
    const insertion = {
      asset: { assetId: ASSET_ID, source: 'USER_ASSET' },
      id: OP_ID,
      target: { kind: 'TIME', range: { endMs: 25_000, startMs: 20_000 } },
      type: 'INSERT_ASSET',
    };
    expect(
      parseCreativeDirectorOutput(modelOutput(plan(insertion)), input(), {
        model: 'gemini-3.6-flash',
        provider: 'gemini',
        usage,
      }).validationStatus,
    ).toBe('VALID');

    for (const asset of [
      { assetId: '99999999-9999-4999-8999-999999999999', source: 'USER_ASSET' },
      { assetId: ASSET_ID, source: 'LICENSED_ASSET' },
    ]) {
      expect(() =>
        parseCreativeDirectorOutput(
          modelOutput(plan({ ...insertion, asset })),
          input(),
          { model: 'gemini-3.6-flash', provider: 'gemini', usage },
        ),
      ).toThrow(CreativeDirectorProviderError);
    }
  });

  it('represents a missing requested asset as unresolved without inventing an ID', () => {
    const output = parseCreativeDirectorOutput(
      modelOutput(plan(remove), {
        unresolvedReferences: [
          {
            kind: 'ASSET',
            question: 'Which Rome video should I use?',
            reason: 'NOT_FOUND',
          },
        ],
        warnings: ['No available asset matched Rome video.'],
      }),
      input({ userInstruction: 'Insert my Rome video.' }),
      { model: 'gemini-3.6-flash', provider: 'gemini', usage },
    );
    expect(output.validationStatus).toBe('UNRESOLVED');
    expect(JSON.stringify(output.editPlan)).not.toContain('999999');
  });

  it('enforces required platform and non-destructive revision linkage', () => {
    expect(() =>
      parseCreativeDirectorOutput(
        modelOutput(plan(remove)),
        input({ platform: 'INSTAGRAM' }),
        {
          model: 'gemini-3.6-flash',
          provider: 'gemini',
          usage,
        },
      ),
    ).toThrow(/platform/i);

    const existing = plan(remove);
    const revision = plan(remove, {
      id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      metadata: { createdBy: 'AI', parentPlanId: PLAN_ID },
    });
    const output = parseCreativeDirectorOutput(
      modelOutput(revision),
      input({ existingEditPlan: existing as never }),
      { model: 'gemini-3.6-flash', provider: 'gemini', usage },
    );
    expect(output.editPlan.metadata.parentPlanId).toBe(PLAN_ID);
  });

  it('labels instruction layers in deterministic precedence order', () => {
    const prompt = creativeDirectorUserPrompt(
      input({
        brandDNA: { captionPreference: 'Animated', editingPrinciples: [] },
        creatorPreferences: { autonomy: 'BALANCED', captions: 'DYNAMIC' },
        projectInstructions: ['Use branded captions.'],
        referenceStyle: { captionBehavior: 'DYNAMIC' },
        userInstruction: 'Use static captions.',
      }),
    );
    expect(prompt.indexOf('currentUser')).toBeLessThan(
      prompt.indexOf('project'),
    );
    expect(prompt.indexOf('project')).toBeLessThan(prompt.indexOf('brandDNA'));
    expect(prompt.indexOf('brandDNA')).toBeLessThan(
      prompt.indexOf('referenceStyle'),
    );
    expect(prompt.indexOf('referenceStyle')).toBeLessThan(
      prompt.indexOf('creatorPreferences'),
    );
  });

  it('routes through the provider-neutral CreativeDirector service', async () => {
    const generate = vi.fn().mockResolvedValue({
      model: 'gemini-3.6-flash',
      provider: 'gemini',
      raw: modelOutput(plan(remove)),
      usage,
    });
    const provider: CreativeDirectorProvider = {
      generate,
    };
    const director = new CreativeDirector(provider, {
      systemPrompt: 'system',
    });
    await expect(
      director.direct(input(), { safetyIdentifier: 'tenant-hash' }),
    ).resolves.toMatchObject({
      validationStatus: 'VALID',
    });
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ safetyIdentifier: 'tenant-hash' }),
    );
  });

  it('rejects unsupported operations and incomplete output', () => {
    expect(() =>
      parseCreativeDirectorOutput(
        modelOutput(plan({ ...remove, type: 'REGENERATE_VIDEO' })),
        input(),
        { model: 'gemini-3.6-flash', provider: 'gemini', usage },
      ),
    ).toThrow(CreativeDirectorProviderError);
    expect(() =>
      parseCreativeDirectorOutput({ editPlan: plan(remove) }, input(), {
        model: 'gemini-3.6-flash',
        provider: 'gemini',
        usage,
      }),
    ).toThrow(CreativeDirectorProviderError);
  });

  it('ships all 17 required deterministic evaluation categories', () => {
    expect(creativeDirectorEvaluationFixtures).toHaveLength(17);
    for (const evaluation of creativeDirectorEvaluationFixtures) {
      expect(
        creativeDirectorInputSchema.safeParse(evaluation.input).success,
      ).toBe(true);
      expect(evaluation.measures).toContain('EDIT_PLAN_VALIDITY');
    }
  });
});
