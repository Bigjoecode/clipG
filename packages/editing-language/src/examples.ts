import type { AssetContext } from './assets.js';
import type { EditPlan } from './edit-plan.js';
import { secondsToMilliseconds } from './time.js';

/**
 * Worked examples of the language.
 *
 * These show how an instruction is *represented*; none of them performs an edit.
 * They double as the fixtures the test suite validates, so a change to the
 * language that breaks a real-world instruction fails the build.
 */
const SOURCE_MEDIA_ID = '11111111-1111-4111-8111-111111111111';
const JERUSALEM_VIDEO_ID = '22222222-2222-4222-8222-222222222222';
const APOSTLE_IMAGE_ONE = '33333333-3333-4333-8333-333333333331';
const APOSTLE_IMAGE_TWO = '33333333-3333-4333-8333-333333333332';
const APOSTLE_IMAGE_THREE = '33333333-3333-4333-8333-333333333333';

const s = secondsToMilliseconds;

export const exampleAssetContext: AssetContext = {
  allowAiGeneratedAssets: false,
  assets: [
    { assetId: JERUSALEM_VIDEO_ID, kind: 'VIDEO', source: 'USER_ASSET' },
    { assetId: APOSTLE_IMAGE_ONE, kind: 'IMAGE', source: 'USER_ASSET' },
    { assetId: APOSTLE_IMAGE_TWO, kind: 'IMAGE', source: 'USER_ASSET' },
    { assetId: APOSTLE_IMAGE_THREE, kind: 'IMAGE', source: 'USER_ASSET' },
  ],
  sourceDurationMs: s(2_700),
  sourceMediaId: SOURCE_MEDIA_ID,
};

const planBase = {
  metadata: { createdBy: 'USER' as const },
  output: { aspectRatio: '16:9' as const },
  platform: 'NONE' as const,
  retention: 'KEEP_ALL_EXCEPT_REMOVED' as const,
  schemaVersion: '1.0' as const,
  source: { durationMs: s(2_700), mediaAssetId: SOURCE_MEDIA_ID },
};

/** "Remove the first 8 seconds." */
export const removeOpeningExample: EditPlan = {
  ...planBase,
  id: 'aaaaaaa1-0000-4000-8000-000000000001',
  objective: 'Remove the first eight seconds.',
  operations: [
    {
      id: 'bbbbbbb1-0000-4000-8000-000000000001',
      target: { kind: 'TIME', range: { endMs: s(8), startMs: 0 } },
      type: 'REMOVE',
    },
  ],
};

/** "At 20 seconds, insert my uploaded video for 5 seconds." */
export const insertUserVideoExample: EditPlan = {
  ...planBase,
  id: 'aaaaaaa1-0000-4000-8000-000000000002',
  objective: 'Insert the uploaded Jerusalem video at twenty seconds.',
  operations: [
    {
      asset: { assetId: JERUSALEM_VIDEO_ID, source: 'USER_ASSET' },
      fit: 'COVER',
      id: 'bbbbbbb1-0000-4000-8000-000000000002',
      opacity: 1,
      target: { kind: 'TIME', range: { endMs: s(25), startMs: s(20) } },
      type: 'INSERT_ASSET',
    },
  ],
};

/**
 * "When I mention the apostles, show these three uploaded images."
 *
 * The trigger is unresolved on purpose: this plan is structurally valid and
 * storable, but `validateEditPlan` reports it as not render-ready.
 */
export const apostlesImagesExample: EditPlan = {
  ...planBase,
  id: 'aaaaaaa1-0000-4000-8000-000000000003',
  objective: 'Show the apostle images whenever the apostles are mentioned.',
  operations: [APOSTLE_IMAGE_ONE, APOSTLE_IMAGE_TWO, APOSTLE_IMAGE_THREE].map(
    (assetId, index) => ({
      asset: { assetId, source: 'USER_ASSET' as const },
      fit: 'CONTAIN' as const,
      id: `bbbbbbb1-0000-4000-8000-00000000001${index}`,
      intent: 'BROLL' as const,
      opacity: 1,
      target: {
        durationMs: s(4),
        kind: 'SEMANTIC' as const,
        leadMs: 0,
        occurrence: { select: 'ALL' as const },
        trailMs: 0,
        trigger: {
          kind: 'PHRASE' as const,
          match: 'CONTAINS' as const,
          phrase: 'apostles',
        },
      },
      type: 'INSERT_ASSET' as const,
    }),
  ),
};

/** "Give the images a slow cinematic zoom." */
export const slowZoomExample: EditPlan = {
  ...planBase,
  id: 'aaaaaaa1-0000-4000-8000-000000000004',
  objective: 'Apply a slow cinematic zoom across the inserted images.',
  operations: [
    {
      easing: 'EASE_IN_OUT',
      endScale: 1.12,
      id: 'bbbbbbb1-0000-4000-8000-000000000004',
      startScale: 1,
      target: { kind: 'TIME', range: { endMs: s(24), startMs: s(20) } },
      type: 'ZOOM',
    },
  ],
};

/** "Make the captions smaller." */
export const smallerCaptionsExample: EditPlan = {
  ...planBase,
  id: 'aaaaaaa1-0000-4000-8000-000000000005',
  objective: 'Render smaller captions across the whole video.',
  operations: [
    {
      emphasis: { keywords: [], mode: 'ACTIVE_WORD' },
      id: 'bbbbbbb1-0000-4000-8000-000000000005',
      style: {
        bold: false,
        fontScale: 0.75,
        position: 'LOWER_THIRD',
        uppercase: false,
      },
      target: { kind: 'TIME', range: { endMs: s(2_700), startMs: 0 } },
      transcriptSource: 'TRANSCRIPT',
      type: 'CAPTION',
    },
  ],
};

/** "Reframe this 16:9 source into 9:16 while keeping the speaker in frame." */
export const reframeVerticalExample: EditPlan = {
  ...planBase,
  id: 'aaaaaaa1-0000-4000-8000-000000000006',
  objective: 'Reframe the landscape source to vertical, following the speaker.',
  operations: [
    {
      aspectRatio: '9:16',
      id: 'bbbbbbb1-0000-4000-8000-000000000006',
      strategy: 'PRIMARY_SPEAKER',
      target: { kind: 'TIME', range: { endMs: s(2_700), startMs: 0 } },
      type: 'REFRAME',
    },
  ],
  output: { aspectRatio: '9:16' },
  platform: 'TIKTOK',
};

/** "Remove the boring introduction but preserve everything else." */
export const trimIntroExample: EditPlan = {
  ...planBase,
  id: 'aaaaaaa1-0000-4000-8000-000000000007',
  objective: 'Drop the slow introduction and keep the rest untouched.',
  operations: [
    {
      id: 'bbbbbbb1-0000-4000-8000-000000000007',
      note: 'Introduction runs long before the first point.',
      target: { kind: 'TIME', range: { endMs: s(95), startMs: 0 } },
      type: 'REMOVE',
    },
  ],
  retention: 'KEEP_ALL_EXCEPT_REMOVED',
};

export const exampleEditPlans = [
  removeOpeningExample,
  insertUserVideoExample,
  apostlesImagesExample,
  slowZoomExample,
  smallerCaptionsExample,
  reframeVerticalExample,
  trimIntroExample,
] as const;
