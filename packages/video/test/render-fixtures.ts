import type { AssetContext } from '@clipgenius/editing-language';

export const sourceId = '11111111-1111-4111-8111-111111111111';
export const imageId = '22222222-2222-4222-8222-222222222222';
export const videoId = '33333333-3333-4333-8333-333333333333';

export const context: AssetContext = {
  allowAiGeneratedAssets: false,
  assets: [
    { assetId: imageId, kind: 'IMAGE', source: 'USER_ASSET' },
    {
      assetId: videoId,
      durationMs: 2_000,
      kind: 'VIDEO',
      source: 'USER_ASSET',
    },
  ],
  sourceDurationMs: 10_000,
  sourceMediaId: sourceId,
};

export const target = (startMs: number, endMs: number) => ({
  kind: 'TIME' as const,
  range: { endMs, startMs },
});

export function planWith(operations: readonly unknown[], aspectRatio = '16:9') {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    metadata: { createdBy: 'USER' },
    objective: 'Deterministic render fixture',
    operations,
    output: { aspectRatio },
    platform: 'NONE',
    retention: 'KEEP_ALL_EXCEPT_REMOVED',
    schemaVersion: '1.0',
    source: {
      durationMs: 10_000,
      mediaAssetId: sourceId,
      source: 'SOURCE_MEDIA',
    },
  };
}

export const remove = {
  id: '10000000-0000-4000-8000-000000000001',
  target: target(0, 2_000),
  type: 'REMOVE',
};

export const reframe = (aspectRatio: '16:9' | '9:16' | '1:1') => ({
  aspectRatio,
  id: '10000000-0000-4000-8000-000000000002',
  strategy: 'CENTER',
  target: target(0, 10_000),
  type: 'REFRAME',
});

export const text = {
  id: '10000000-0000-4000-8000-000000000003',
  style: {
    bold: true,
    fontScale: 1,
    position: 'LOWER_THIRD',
    uppercase: false,
  },
  target: target(3_000, 6_000),
  text: 'ClipGenius',
  type: 'TEXT',
};
