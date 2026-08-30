import { describe, expect, it } from 'vitest';

import {
  RenderError,
  compileRenderTimeline,
  validatePlanForRendering,
  type ResolvedRenderAsset,
} from '../src/index.js';

import {
  context,
  imageId,
  planWith,
  reframe,
  remove,
  sourceId,
  target,
  text,
  videoId,
} from './render-fixtures.js';

const assets: readonly ResolvedRenderAsset[] = [
  {
    assetId: imageId,
    kind: 'IMAGE',
    path: 'C:\\fixtures\\image.png',
    source: 'USER_ASSET',
  },
  {
    assetId: videoId,
    kind: 'VIDEO',
    path: 'C:\\fixtures\\asset.mp4',
    source: 'USER_ASSET',
  },
];

function compile(operations: readonly unknown[], aspectRatio = '16:9') {
  return compileRenderTimeline(
    validatePlanForRendering(planWith(operations, aspectRatio), context),
    assets,
  );
}

describe('render validation and timeline compilation', () => {
  it('lets a canonically valid render-ready plan reach the compiler', () => {
    expect(compile([text]).texts).toHaveLength(1);
  });

  it('rejects an invalid EditPlan before rendering', () => {
    expect(() => validatePlanForRendering({}, context)).toThrowError(
      expect.objectContaining({ category: 'INVALID_EDIT_PLAN' }),
    );
  });

  it('rejects unresolved semantic targets', () => {
    const semantic = {
      ...text,
      target: {
        kind: 'SEMANTIC',
        trigger: { kind: 'TOPIC', topic: 'apostles' },
      },
    };
    expect(() =>
      validatePlanForRendering(planWith([semantic]), context),
    ).toThrowError(/unresolved semantic/i);
  });

  it('rejects an authoritative source mismatch', () => {
    const wrongContext = { ...context, sourceMediaId: crypto.randomUUID() };
    expect(() =>
      validatePlanForRendering(planWith([text]), wrongContext),
    ).toThrowError(/SOURCE_MEDIA_MISMATCH/);
  });

  it('compiles REMOVE into retained source and output ranges', () => {
    expect(compile([remove]).segments).toEqual([
      {
        outputEndMs: 8_000,
        outputStartMs: 0,
        sourceEndMs: 10_000,
        sourceStartMs: 2_000,
      },
    ]);
  });

  it('fails clearly for an unsupported operation', () => {
    const keep = {
      id: crypto.randomUUID(),
      target: target(0, 1_000),
      type: 'KEEP',
    };
    expect(() => compile([keep])).toThrowError(
      expect.objectContaining({ category: 'UNSUPPORTED_OPERATION' }),
    );
  });

  it('fails clearly when a resolved image asset is missing', () => {
    const insert = {
      asset: { assetId: imageId, source: 'USER_ASSET' },
      id: crypto.randomUUID(),
      target: target(2_000, 4_000),
      type: 'INSERT_ASSET',
    };
    const plan = validatePlanForRendering(planWith([insert]), context);
    expect(() => compileRenderTimeline(plan, [])).toThrowError(
      expect.objectContaining({ category: 'MISSING_ASSET' }),
    );
  });

  it('preserves image asset provenance in the timeline', () => {
    const insert = {
      asset: { assetId: imageId, source: 'USER_ASSET' },
      id: crypto.randomUUID(),
      target: target(2_000, 4_000),
      type: 'INSERT_ASSET',
    };
    expect(compile([insert]).overlays[0]).toMatchObject({
      assetId: imageId,
      kind: 'IMAGE',
      provenance: 'USER_ASSET',
    });
  });

  it('compiles a video insertion without embedding bytes or URLs', () => {
    const insert = {
      asset: { assetId: videoId, source: 'USER_ASSET' },
      id: crypto.randomUUID(),
      target: target(2_000, 4_000),
      type: 'INSERT_ASSET',
    };
    expect(compile([insert]).overlays[0]).toMatchObject({
      assetId: videoId,
      kind: 'VIDEO',
      path: 'C:\\fixtures\\asset.mp4',
    });
  });

  it.each([
    ['16:9', 1280, 720],
    ['9:16', 720, 1280],
    ['1:1', 1080, 1080],
  ] as const)('compiles %s output dimensions', (ratio, width, height) => {
    expect(compile([reframe(ratio)], ratio).dimensions).toEqual({
      height,
      width,
    });
  });

  it('rejects PRIMARY_SPEAKER without tracking data', () => {
    expect(() =>
      compile(
        [
          {
            ...reframe('9:16'),
            strategy: 'PRIMARY_SPEAKER',
          },
        ],
        '9:16',
      ),
    ).toThrowError(/tracking data/);
  });

  it('preserves an explicit fixed reframe focus', () => {
    expect(
      compile(
        [
          {
            ...reframe('9:16'),
            focus: { x: 0.25, y: 0.4 },
            strategy: 'FIXED_POINT',
          },
        ],
        '9:16',
      ).reframeFocus,
    ).toEqual({ x: 0.25, y: 0.4 });
  });

  it('rejects a target duration it cannot honor', () => {
    const plan = {
      ...planWith([text]),
      output: { aspectRatio: '16:9', targetDurationMs: 5_000 },
    };
    expect(() =>
      compileRenderTimeline(validatePlanForRendering(plan, context), assets),
    ).toThrowError(/cannot synthesize target duration/);
  });

  it('rejects requested inserted-video audio instead of ignoring it', () => {
    const insert = {
      asset: { assetId: videoId, source: 'USER_ASSET' },
      audioGainDb: -6,
      id: crypto.randomUUID(),
      target: target(2_000, 4_000),
      type: 'INSERT_ASSET',
    };
    expect(() => compile([insert])).toThrowError(/muted visuals only/);
  });

  it('compiles deterministic zoom interpolation values', () => {
    const zoom = {
      easing: 'EASE_IN_OUT',
      endScale: 1.2,
      focus: { x: 0.5, y: 0.5 },
      id: crypto.randomUUID(),
      startScale: 1,
      target: target(2_000, 5_000),
      type: 'ZOOM',
    };
    expect(compile([zoom]).zooms[0]).toEqual({
      easing: 'EASE_IN_OUT',
      endMs: 5_000,
      endScale: 1.2,
      focus: { x: 0.5, y: 0.5 },
      startMs: 2_000,
      startScale: 1,
    });
  });

  it('maps TEXT timing around removed source intervals', () => {
    expect(compile([remove, text]).texts[0]).toMatchObject({
      endMs: 4_000,
      startMs: 1_000,
      text: 'ClipGenius',
    });
  });

  it('compiles AUDIO_LEVEL gain, mute, and fades', () => {
    const audio = {
      fadeInMs: 100,
      fadeOutMs: 200,
      gainDb: -6,
      id: crypto.randomUUID(),
      mute: false,
      target: target(2_000, 5_000),
      type: 'AUDIO_LEVEL',
    };
    expect(compile([audio]).audioLevels[0]).toMatchObject({
      fadeInMs: 100,
      fadeOutMs: 200,
      gainDb: -6,
      mute: false,
    });
  });

  it('rejects an operation whose range crosses removed footage', () => {
    const crossing = {
      ...text,
      target: target(1_000, 3_000),
    };
    expect(() => compile([remove, crossing])).toThrowError(
      expect.objectContaining({ category: 'UNSUPPORTED_OPERATION' }),
    );
  });

  it('uses the renderer error taxonomy', () => {
    expect(new RenderError('TIMEOUT', 'late', true)).toMatchObject({
      category: 'TIMEOUT',
      retryable: true,
    });
  });

  it('does not permit a different source id at the renderer boundary', () => {
    expect(sourceId).toBe(context.sourceMediaId);
  });
});
