import type {
  EditOperation,
  EditPlan,
  MediaSource,
  NormalizedPoint,
  NormalizedRect,
  TextStyle,
  TimeRange,
} from '@clipgenius/editing-language';

import {
  RenderError,
  type ResolvedRenderAsset,
  type ValidatedEditPlan,
} from './renderer.js';

export interface RenderDimensions {
  readonly height: number;
  readonly width: number;
}

export interface TimelineSegment {
  readonly outputEndMs: number;
  readonly outputStartMs: number;
  readonly sourceEndMs: number;
  readonly sourceStartMs: number;
}

export interface TimelineRange {
  readonly endMs: number;
  readonly startMs: number;
}

export interface TimelineOverlay extends TimelineRange {
  readonly assetId: string;
  readonly fit: 'CONTAIN' | 'COVER' | 'STRETCH';
  readonly kind: 'IMAGE' | 'VIDEO';
  readonly opacity: number;
  readonly path: string;
  readonly provenance: Exclude<MediaSource, 'SOURCE_MEDIA'>;
  readonly rect?: NormalizedRect;
}

export interface TimelineZoom extends TimelineRange {
  readonly easing: 'LINEAR' | 'EASE_IN' | 'EASE_OUT' | 'EASE_IN_OUT';
  readonly endScale: number;
  readonly focus: NormalizedPoint;
  readonly startScale: number;
}

export interface TimelineText extends TimelineRange {
  readonly style: TextStyle;
  readonly text: string;
}

export interface TimelineAudioLevel extends TimelineRange {
  readonly fadeInMs: number;
  readonly fadeOutMs: number;
  readonly gainDb?: number;
  readonly mute: boolean;
}

export interface RenderTimeline {
  readonly audioLevels: readonly TimelineAudioLevel[];
  readonly dimensions: RenderDimensions;
  readonly durationMs: number;
  readonly overlays: readonly TimelineOverlay[];
  readonly reframeFocus: NormalizedPoint;
  readonly segments: readonly TimelineSegment[];
  readonly texts: readonly TimelineText[];
  readonly zooms: readonly TimelineZoom[];
}

const dimensionsByAspectRatio = {
  '1:1': { height: 1080, width: 1080 },
  '16:9': { height: 720, width: 1280 },
  '9:16': { height: 1280, width: 720 },
} as const;

const supportedOperations = new Set<EditOperation['type']>([
  'REMOVE',
  'INSERT_ASSET',
  'ZOOM',
  'REFRAME',
  'TEXT',
  'AUDIO_LEVEL',
]);

function mergedRanges(ranges: readonly TimeRange[]): TimeRange[] {
  const sorted = [...ranges].sort(
    (left, right) => left.startMs - right.startMs,
  );
  const merged: TimeRange[] = [];
  for (const range of sorted) {
    const previous = merged.at(-1);
    if (previous !== undefined && range.startMs <= previous.endMs) {
      merged[merged.length - 1] = {
        endMs: Math.max(previous.endMs, range.endMs),
        startMs: previous.startMs,
      };
    } else {
      merged.push(range);
    }
  }
  return merged;
}

function retainedSegments(plan: EditPlan): TimelineSegment[] {
  const removed = mergedRanges(
    plan.operations
      .filter(
        (operation): operation is Extract<EditOperation, { type: 'REMOVE' }> =>
          operation.type === 'REMOVE',
      )
      .map((operation) => {
        if (operation.target.kind !== 'TIME') {
          throw new RenderError(
            'INVALID_EDIT_PLAN',
            `REMOVE ${operation.id} has an unresolved target.`,
          );
        }
        return operation.target.range;
      }),
  );
  const sourceRanges: TimeRange[] = [];
  let cursor = 0;
  for (const range of removed) {
    if (cursor < range.startMs) {
      sourceRanges.push({ endMs: range.startMs, startMs: cursor });
    }
    cursor = Math.max(cursor, range.endMs);
  }
  if (cursor < plan.source.durationMs) {
    sourceRanges.push({ endMs: plan.source.durationMs, startMs: cursor });
  }
  if (sourceRanges.length === 0) {
    throw new RenderError(
      'INVALID_EDIT_PLAN',
      'REMOVE operations discard the entire source video.',
    );
  }
  let outputCursor = 0;
  return sourceRanges.map((range) => {
    const duration = range.endMs - range.startMs;
    const segment = {
      outputEndMs: outputCursor + duration,
      outputStartMs: outputCursor,
      sourceEndMs: range.endMs,
      sourceStartMs: range.startMs,
    };
    outputCursor += duration;
    return segment;
  });
}

function mapRange(
  operation: EditOperation,
  segments: readonly TimelineSegment[],
): TimelineRange {
  if (operation.target.kind !== 'TIME') {
    throw new RenderError(
      'INVALID_EDIT_PLAN',
      `${operation.type} ${operation.id} has an unresolved semantic target.`,
    );
  }
  const range = operation.target.range;
  const segment = segments.find(
    (candidate) =>
      range.startMs >= candidate.sourceStartMs &&
      range.endMs <= candidate.sourceEndMs,
  );
  if (segment === undefined) {
    throw new RenderError(
      'UNSUPPORTED_OPERATION',
      `${operation.type} ${operation.id} crosses a removed interval and cannot be represented by the first renderer.`,
    );
  }
  return {
    endMs: segment.outputStartMs + range.endMs - segment.sourceStartMs,
    startMs: segment.outputStartMs + range.startMs - segment.sourceStartMs,
  };
}

function assetFor(
  operation: Extract<EditOperation, { type: 'INSERT_ASSET' }>,
  assets: readonly ResolvedRenderAsset[],
): ResolvedRenderAsset & { readonly kind: 'IMAGE' | 'VIDEO' } {
  const asset = assets.find(
    (candidate) => candidate.assetId === operation.asset.assetId,
  );
  if (asset === undefined) {
    throw new RenderError(
      'MISSING_ASSET',
      `Resolved asset ${operation.asset.assetId} is missing.`,
    );
  }
  if (asset.source !== operation.asset.source) {
    throw new RenderError(
      'INVALID_EDIT_PLAN',
      `Resolved asset ${asset.assetId} provenance does not match the EditPlan.`,
    );
  }
  if (asset.kind === 'AUDIO') {
    throw new RenderError(
      'UNSUPPORTED_OPERATION',
      `INSERT_ASSET cannot render audio asset ${asset.assetId}.`,
    );
  }
  return asset as ResolvedRenderAsset & { readonly kind: 'IMAGE' | 'VIDEO' };
}

export function compileRenderTimeline(
  validated: ValidatedEditPlan,
  assets: readonly ResolvedRenderAsset[],
): RenderTimeline {
  const plan = validated.plan;
  const dimensions =
    plan.output.aspectRatio === '4:5'
      ? undefined
      : dimensionsByAspectRatio[plan.output.aspectRatio];
  if (dimensions === undefined) {
    throw new RenderError(
      'UNSUPPORTED_OPERATION',
      `Output aspect ratio ${plan.output.aspectRatio} is not supported by renderer version 1.`,
    );
  }
  const unsupported = plan.operations.find(
    (operation) => !supportedOperations.has(operation.type),
  );
  if (unsupported !== undefined) {
    throw new RenderError(
      'UNSUPPORTED_OPERATION',
      `${unsupported.type} is not supported by renderer version 1.`,
    );
  }
  const segments = retainedSegments(plan);
  const durationMs = segments.at(-1)?.outputEndMs ?? 0;
  if (
    plan.output.targetDurationMs !== undefined &&
    plan.output.targetDurationMs !== durationMs
  ) {
    throw new RenderError(
      'UNSUPPORTED_OPERATION',
      `Renderer version 1 cannot synthesize target duration ${plan.output.targetDurationMs}ms from a ${durationMs}ms timeline.`,
    );
  }
  const overlays: TimelineOverlay[] = [];
  const zooms: TimelineZoom[] = [];
  const texts: TimelineText[] = [];
  const audioLevels: TimelineAudioLevel[] = [];
  let reframeFocus: NormalizedPoint = { x: 0.5, y: 0.5 };
  let sawReframe = false;

  for (const operation of plan.operations) {
    if (operation.type === 'REMOVE') continue;
    if (operation.type === 'REFRAME') {
      if (operation.strategy === 'PRIMARY_SPEAKER') {
        throw new RenderError(
          'UNSUPPORTED_OPERATION',
          'PRIMARY_SPEAKER reframe requires tracking data that Task 011 does not provide.',
        );
      }
      if (operation.aspectRatio !== plan.output.aspectRatio) {
        throw new RenderError(
          'INVALID_EDIT_PLAN',
          'REFRAME aspect ratio must match the EditPlan output aspect ratio.',
        );
      }
      if (
        operation.target.kind !== 'TIME' ||
        operation.target.range.startMs !== 0 ||
        operation.target.range.endMs !== plan.source.durationMs
      ) {
        throw new RenderError(
          'UNSUPPORTED_OPERATION',
          'Renderer version 1 requires REFRAME to cover the full source timeline.',
        );
      }
      if (sawReframe) {
        throw new RenderError(
          'UNSUPPORTED_OPERATION',
          'Renderer version 1 supports one global REFRAME operation.',
        );
      }
      if (
        operation.strategy === 'FIXED_POINT' &&
        operation.focus === undefined
      ) {
        throw new RenderError(
          'INVALID_EDIT_PLAN',
          'FIXED_POINT reframe requires an explicit focus point.',
        );
      }
      reframeFocus = operation.focus ?? reframeFocus;
      sawReframe = true;
      continue;
    }
    const range = mapRange(operation, segments);
    if (operation.type === 'INSERT_ASSET') {
      if (operation.audioGainDb !== undefined) {
        throw new RenderError(
          'UNSUPPORTED_OPERATION',
          'Renderer version 1 inserts video assets as muted visuals only.',
        );
      }
      const asset = assetFor(operation, assets);
      overlays.push({
        assetId: asset.assetId,
        endMs: range.endMs,
        fit: operation.fit,
        kind: asset.kind,
        opacity: operation.opacity,
        path: asset.path,
        provenance: asset.source,
        ...(operation.rect === undefined ? {} : { rect: operation.rect }),
        startMs: range.startMs,
      });
    } else if (operation.type === 'ZOOM') {
      zooms.push({
        easing: operation.easing,
        endMs: range.endMs,
        endScale: operation.endScale,
        focus: operation.focus ?? { x: 0.5, y: 0.5 },
        startMs: range.startMs,
        startScale: operation.startScale,
      });
    } else if (operation.type === 'TEXT') {
      texts.push({ ...range, style: operation.style, text: operation.text });
    } else if (operation.type === 'AUDIO_LEVEL') {
      audioLevels.push({
        ...range,
        fadeInMs: operation.fadeInMs,
        fadeOutMs: operation.fadeOutMs,
        ...(operation.gainDb === undefined ? {} : { gainDb: operation.gainDb }),
        mute: operation.mute,
      });
    }
  }
  return {
    audioLevels,
    dimensions,
    durationMs,
    overlays,
    reframeFocus,
    segments,
    texts,
    zooms,
  };
}
