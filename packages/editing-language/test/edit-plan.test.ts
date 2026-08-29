import { describe, expect, it } from 'vitest';

import {
  editPlanSchema,
  exampleAssetContext,
  exampleEditPlans,
  formatTimecode,
  parseEditPlan,
  rangesOverlap,
  removeOpeningExample,
  secondsToMilliseconds,
  serializeEditPlan,
  timeRangeSchema,
  validateEditPlan,
  type AssetContext,
  type EditPlan,
} from '../src/index.js';

const SOURCE_MEDIA_ID = '11111111-1111-4111-8111-111111111111';
const USER_VIDEO_ID = '22222222-2222-4222-8222-222222222222';
const USER_AUDIO_ID = '44444444-4444-4444-8444-444444444444';
const AI_IMAGE_ID = '55555555-5555-4555-8555-555555555555';

const context: AssetContext = {
  allowAiGeneratedAssets: false,
  assets: [
    { assetId: USER_VIDEO_ID, kind: 'VIDEO', source: 'USER_ASSET' },
    { assetId: USER_AUDIO_ID, kind: 'AUDIO', source: 'USER_ASSET' },
    { assetId: AI_IMAGE_ID, kind: 'IMAGE', source: 'AI_GENERATED_ASSET' },
  ],
  sourceDurationMs: 600_000,
  sourceMediaId: SOURCE_MEDIA_ID,
};

function plan(overrides: Partial<EditPlan> = {}): EditPlan {
  return {
    id: 'aaaaaaa9-0000-4000-8000-000000000001',
    metadata: { createdBy: 'AI' },
    objective: 'Test plan.',
    operations: [
      {
        id: 'bbbbbbb9-0000-4000-8000-000000000001',
        target: { kind: 'TIME', range: { endMs: 8_000, startMs: 0 } },
        type: 'REMOVE',
      },
    ],
    output: { aspectRatio: '16:9' },
    platform: 'NONE',
    retention: 'KEEP_ALL_EXCEPT_REMOVED',
    schemaVersion: '1.0',
    source: { durationMs: 600_000, mediaAssetId: SOURCE_MEDIA_ID },
    ...overrides,
  };
}

function issueCodes(result: ReturnType<typeof validateEditPlan>) {
  return result.ok ? [] : result.issues.map((issue) => issue.code);
}

describe('time', () => {
  it('rejects fractional and negative milliseconds', () => {
    expect(timeRangeSchema.safeParse({ endMs: 10.5, startMs: 0 }).success).toBe(
      false,
    );
    expect(timeRangeSchema.safeParse({ endMs: 10, startMs: -1 }).success).toBe(
      false,
    );
  });

  it('rejects a range that ends before or exactly when it starts', () => {
    expect(timeRangeSchema.safeParse({ endMs: 5, startMs: 10 }).success).toBe(
      false,
    );
    expect(timeRangeSchema.safeParse({ endMs: 10, startMs: 10 }).success).toBe(
      false,
    );
  });

  it('treats touching ranges as non-overlapping', () => {
    expect(
      rangesOverlap({ endMs: 10, startMs: 0 }, { endMs: 20, startMs: 10 }),
    ).toBe(false);
    expect(
      rangesOverlap({ endMs: 11, startMs: 0 }, { endMs: 20, startMs: 10 }),
    ).toBe(true);
  });

  it('converts seconds at the boundary and formats for display only', () => {
    expect(secondsToMilliseconds(20.5)).toBe(20_500);
    expect(secondsToMilliseconds(92.457)).toBe(92_457);
    expect(formatTimecode(65_250)).toBe('1:05.250');
  });
});

describe('schema version', () => {
  it('accepts the supported version', () => {
    expect(validateEditPlan(plan(), context).ok).toBe(true);
  });

  it('rejects an unknown version rather than reinterpreting it', () => {
    const result = validateEditPlan(
      { ...plan(), schemaVersion: '2.0' },
      context,
    );
    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toContain('UNSUPPORTED_SCHEMA_VERSION');
  });
});

describe('structure', () => {
  it('rejects an unknown operation type', () => {
    const result = validateEditPlan(
      plan({
        operations: [
          {
            id: 'bbbbbbb9-0000-4000-8000-000000000002',
            target: { kind: 'TIME', range: { endMs: 10, startMs: 0 } },
            type: 'TELEPORT',
          },
        ] as never,
      }),
      context,
    );
    expect(result.ok).toBe(false);
  });

  it('rejects unknown fields instead of silently dropping them', () => {
    const result = editPlanSchema.safeParse({
      ...plan(),
      ffmpegFilter: 'scale=1280:720',
    });
    expect(result.success).toBe(false);
  });

  it('requires at least one operation', () => {
    expect(validateEditPlan(plan({ operations: [] }), context).ok).toBe(false);
  });

  it('rejects duplicate operation ids', () => {
    const duplicate = {
      id: 'bbbbbbb9-0000-4000-8000-000000000003',
      target: { kind: 'TIME' as const, range: { endMs: 5_000, startMs: 0 } },
      type: 'REMOVE' as const,
    };
    const result = validateEditPlan(
      plan({
        operations: [
          duplicate,
          {
            ...duplicate,
            target: { kind: 'TIME', range: { endMs: 30_000, startMs: 20_000 } },
          },
        ],
      }),
      context,
    );
    expect(issueCodes(result)).toContain('DUPLICATE_OPERATION_ID');
  });
});

describe('temporal validation', () => {
  it('rejects an operation that runs past the end of the source', () => {
    const result = validateEditPlan(
      plan({
        operations: [
          {
            id: 'bbbbbbb9-0000-4000-8000-000000000004',
            target: { kind: 'TIME', range: { endMs: 900_000, startMs: 0 } },
            type: 'REMOVE',
          },
        ],
      }),
      context,
    );
    expect(issueCodes(result)).toContain('RANGE_OUTSIDE_SOURCE');
  });

  it('rejects a transition longer than the range it occupies', () => {
    const result = validateEditPlan(
      plan({
        operations: [
          {
            id: 'bbbbbbb9-0000-4000-8000-000000000005',
            target: { kind: 'TIME', range: { endMs: 1_400, startMs: 1_000 } },
            transition: { durationMs: 2_000, type: 'FADE' },
            type: 'TRANSITION',
          },
        ],
      }),
      context,
    );
    expect(issueCodes(result)).toContain('TRANSITION_LONGER_THAN_RANGE');
  });
});

describe('asset provenance', () => {
  it('accepts a user asset that exists in the context', () => {
    const result = validateEditPlan(
      plan({
        operations: [
          {
            asset: { assetId: USER_VIDEO_ID, source: 'USER_ASSET' },
            fit: 'COVER',
            id: 'bbbbbbb9-0000-4000-8000-000000000006',
            opacity: 1,
            target: { kind: 'TIME', range: { endMs: 25_000, startMs: 20_000 } },
            type: 'INSERT_ASSET',
          },
        ],
      }),
      context,
    );
    expect(result.ok).toBe(true);
  });

  it('rejects an asset that is not available to the project', () => {
    const result = validateEditPlan(
      plan({
        operations: [
          {
            asset: {
              assetId: '99999999-9999-4999-8999-999999999999',
              source: 'USER_ASSET',
            },
            fit: 'COVER',
            id: 'bbbbbbb9-0000-4000-8000-000000000007',
            opacity: 1,
            target: { kind: 'TIME', range: { endMs: 25_000, startMs: 20_000 } },
            type: 'INSERT_ASSET',
          },
        ],
      }),
      context,
    );
    expect(issueCodes(result)).toContain('ASSET_NOT_IN_CONTEXT');
  });

  it('rejects a claim that misstates an asset’s provenance', () => {
    const result = validateEditPlan(
      plan({
        operations: [
          {
            asset: { assetId: AI_IMAGE_ID, source: 'USER_ASSET' },
            fit: 'COVER',
            id: 'bbbbbbb9-0000-4000-8000-000000000008',
            opacity: 1,
            target: { kind: 'TIME', range: { endMs: 25_000, startMs: 20_000 } },
            type: 'INSERT_ASSET',
          },
        ],
      }),
      context,
    );
    expect(issueCodes(result)).toContain('ASSET_PROVENANCE_MISMATCH');
  });

  it('refuses to treat original source media as an insertable overlay', () => {
    const result = validateEditPlan(
      plan({
        operations: [
          {
            asset: { assetId: SOURCE_MEDIA_ID, source: 'SOURCE_MEDIA' },
            fit: 'COVER',
            id: 'bbbbbbb9-0000-4000-8000-000000000009',
            opacity: 1,
            target: { kind: 'TIME', range: { endMs: 25_000, startMs: 20_000 } },
            type: 'INSERT_ASSET',
          },
        ],
      }),
      context,
    );
    expect(issueCodes(result)).toContain('SOURCE_MEDIA_NOT_INSERTABLE');
  });

  it('refuses AI-generated media unless it was explicitly permitted', () => {
    const operations = [
      {
        asset: { assetId: AI_IMAGE_ID, source: 'AI_GENERATED_ASSET' as const },
        fit: 'CONTAIN' as const,
        id: 'bbbbbbb9-0000-4000-8000-000000000010',
        opacity: 1,
        target: {
          kind: 'TIME' as const,
          range: { endMs: 25_000, startMs: 20_000 },
        },
        type: 'INSERT_ASSET' as const,
      },
    ];
    expect(
      issueCodes(validateEditPlan(plan({ operations }), context)),
    ).toContain('AI_ASSET_NOT_PERMITTED');
    expect(
      validateEditPlan(plan({ operations }), {
        ...context,
        allowAiGeneratedAssets: true,
      }).ok,
    ).toBe(true);
  });

  it('rejects an audio asset used as a visual insert', () => {
    const result = validateEditPlan(
      plan({
        operations: [
          {
            asset: { assetId: USER_AUDIO_ID, source: 'USER_ASSET' },
            fit: 'COVER',
            id: 'bbbbbbb9-0000-4000-8000-000000000011',
            opacity: 1,
            target: { kind: 'TIME', range: { endMs: 25_000, startMs: 20_000 } },
            type: 'INSERT_ASSET',
          },
        ],
      }),
      context,
    );
    expect(issueCodes(result)).toContain('ASSET_KIND_INVALID');
  });
});

describe('semantic targets', () => {
  it('accepts an unresolved trigger but marks the plan not render-ready', () => {
    const result = validateEditPlan(
      plan({
        operations: [
          {
            asset: { assetId: USER_VIDEO_ID, source: 'USER_ASSET' },
            fit: 'CONTAIN',
            id: 'bbbbbbb9-0000-4000-8000-000000000012',
            opacity: 1,
            target: {
              durationMs: 4_000,
              kind: 'SEMANTIC',
              leadMs: 0,
              occurrence: { select: 'ALL' },
              trailMs: 0,
              trigger: {
                kind: 'PHRASE',
                match: 'CONTAINS',
                phrase: 'apostles',
              },
            },
            type: 'INSERT_ASSET',
          },
        ],
      }),
      context,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.renderReady).toBe(false);
      expect(result.unresolvedOperationIds).toHaveLength(1);
    }
  });

  it('requires an index only when selecting the nth occurrence', () => {
    const withTrigger = (occurrence: unknown) =>
      validateEditPlan(
        plan({
          operations: [
            {
              id: 'bbbbbbb9-0000-4000-8000-000000000013',
              target: {
                kind: 'SEMANTIC',
                leadMs: 0,
                occurrence,
                trailMs: 0,
                trigger: { kind: 'TOPIC', topic: 'faith' },
              },
              type: 'REMOVE',
            },
          ] as never,
        }),
        context,
      );
    expect(withTrigger({ select: 'NTH' }).ok).toBe(false);
    expect(withTrigger({ index: 2, select: 'NTH' }).ok).toBe(true);
    expect(withTrigger({ index: 2, select: 'FIRST' }).ok).toBe(false);
  });
});

describe('conflict detection', () => {
  it('rejects two replacements claiming the same range', () => {
    const result = validateEditPlan(
      plan({
        operations: [
          {
            asset: { assetId: USER_VIDEO_ID, source: 'USER_ASSET' },
            fit: 'COVER',
            id: 'bbbbbbb9-0000-4000-8000-000000000014',
            keepSourceAudio: true,
            opacity: 1,
            target: { kind: 'TIME', range: { endMs: 30_000, startMs: 20_000 } },
            type: 'REPLACE_ASSET',
          },
          {
            id: 'bbbbbbb9-0000-4000-8000-000000000015',
            target: { kind: 'TIME', range: { endMs: 35_000, startMs: 25_000 } },
            type: 'REMOVE',
          },
        ],
      }),
      context,
    );
    expect(issueCodes(result)).toContain('CONFLICTING_OPERATIONS');
  });

  it('rejects a range that is both removed and kept', () => {
    const result = validateEditPlan(
      plan({
        operations: [
          {
            id: 'bbbbbbb9-0000-4000-8000-000000000016',
            target: { kind: 'TIME', range: { endMs: 20_000, startMs: 10_000 } },
            type: 'REMOVE',
          },
          {
            id: 'bbbbbbb9-0000-4000-8000-000000000017',
            target: { kind: 'TIME', range: { endMs: 25_000, startMs: 15_000 } },
            type: 'KEEP',
          },
        ],
      }),
      context,
    );
    expect(issueCodes(result)).toContain('CONFLICTING_OPERATIONS');
  });

  it('allows legitimate layering such as a zoom over a caption', () => {
    const result = validateEditPlan(
      plan({
        operations: [
          {
            easing: 'EASE_IN_OUT',
            endScale: 1.2,
            id: 'bbbbbbb9-0000-4000-8000-000000000018',
            startScale: 1,
            target: { kind: 'TIME', range: { endMs: 30_000, startMs: 20_000 } },
            type: 'ZOOM',
          },
          {
            emphasis: { keywords: [], mode: 'ACTIVE_WORD' },
            id: 'bbbbbbb9-0000-4000-8000-000000000019',
            style: {
              bold: false,
              fontScale: 1,
              position: 'LOWER_THIRD',
              uppercase: false,
            },
            target: { kind: 'TIME', range: { endMs: 40_000, startMs: 0 } },
            transcriptSource: 'TRANSCRIPT',
            type: 'CAPTION',
          },
        ],
      }),
      context,
    );
    expect(result.ok).toBe(true);
  });

  it('rejects selecting-only retention with nothing selected', () => {
    const result = validateEditPlan(
      plan({ retention: 'KEEP_ONLY_SELECTED' }),
      context,
    );
    expect(issueCodes(result)).toContain('RETENTION_WITHOUT_SELECTION');
  });
});

describe('serialization', () => {
  it('round-trips a plan without changing its meaning', () => {
    const serialized = serializeEditPlan(removeOpeningExample);
    const result = parseEditPlan(serialized, exampleAssetContext);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.plan).toEqual(removeOpeningExample);
    }
  });

  it('rejects malformed JSON rather than throwing', () => {
    const result = parseEditPlan('{ not json', exampleAssetContext);
    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toContain('SCHEMA_INVALID');
  });
});

describe('worked examples', () => {
  it.each(exampleEditPlans.map((example) => [example.objective, example]))(
    'validates: %s',
    (_objective, example) => {
      const result = validateEditPlan(example, exampleAssetContext);
      expect(result.ok).toBe(true);
    },
  );

  it('marks only the semantic example as not render-ready', () => {
    const readiness = exampleEditPlans.map((example) => {
      const result = validateEditPlan(example, exampleAssetContext);
      return result.ok ? result.renderReady : null;
    });
    expect(readiness.filter((ready) => ready === false)).toHaveLength(1);
    expect(readiness).not.toContain(null);
  });
});

describe('renderer independence', () => {
  it('exposes no renderer-specific vocabulary in the operation surface', () => {
    const serialized = exampleEditPlans
      .map((example) => serializeEditPlan(example))
      .join(' ')
      .toLowerCase();
    for (const forbidden of [
      'ffmpeg',
      'filter_complex',
      'remotion',
      'libx264',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
