import { z } from 'zod';

import { assetReferenceSchema } from './assets.js';
import {
  aspectRatioSchema,
  easingSchema,
  fitModes,
  gainDecibelsSchema,
  normalizedPointSchema,
  normalizedRectSchema,
  textStyleSchema,
  transitionSchema,
} from './effects.js';
import { operationTargetSchema } from './targets.js';
import { durationMillisecondsSchema, millisecondsSchema } from './time.js';

/**
 * Editorial purpose, kept separate from the mechanical operation.
 *
 * HOOK, CTA, BROLL, EMPHASIZE and HIGHLIGHT are not distinct things a renderer
 * does — a hook is a piece of text or an asset placed at the start, and B-roll
 * is an inserted asset. Modelling them as their own operation types would mean
 * several near-identical operations whose only difference is why they exist, so
 * purpose is recorded here and the mechanics stay in `type`.
 */
export const operationIntents = [
  'HOOK',
  'CTA',
  'BROLL',
  'EMPHASIS',
  'BRANDING',
] as const;

const operationBase = {
  id: z.uuid(),
  intent: z.enum(operationIntents).optional(),
  note: z.string().trim().max(500).optional(),
  target: operationTargetSchema,
};

const defaultTextStyle = {
  bold: false,
  fontScale: 1,
  position: 'LOWER_THIRD',
  uppercase: false,
} as const;

const assetPlacement = {
  fit: z.enum(fitModes).default('COVER'),
  opacity: z.number().min(0).max(1).default(1),
  /** Omitted means full frame. */
  rect: normalizedRectSchema.optional(),
};

/**
 * The operation union.
 *
 * Every member is fully typed — there is no `parameters: unknown` escape hatch,
 * because the whole point of the contract is that an invalid combination fails
 * validation instead of reaching a renderer.
 *
 * Deliberately absent, with reasons:
 * - CUT / SPLIT: on a plan that describes intent, a split with no follow-up
 *   changes nothing about the output. Removing a span is REMOVE; shortening the
 *   piece that survives is expressed by the plan's retention mode.
 * - MOVE_ASSET / RESIZE_ASSET: an inserted asset already carries its own
 *   placement and timing, so moving or resizing it means editing that operation
 *   rather than adding a second one that mutates the first.
 * - IMAGE / VIDEO_OVERLAY: both are INSERT_ASSET with an asset whose kind is
 *   IMAGE or VIDEO.
 * - EMPHASIZE / HIGHLIGHT: caption emphasis, expressed on the CAPTION operation.
 */
export const editOperationSchema = z.discriminatedUnion('type', [
  z.object({ ...operationBase, type: z.literal('REMOVE') }).strict(),
  z.object({ ...operationBase, type: z.literal('KEEP') }).strict(),
  z
    .object({
      ...operationBase,
      rate: z.number().gt(0.25).max(4),
      type: z.literal('SPEED'),
    })
    .strict(),
  z
    .object({
      ...operationBase,
      ...assetPlacement,
      asset: assetReferenceSchema,
      /** Muted by default so an inserted visual cannot talk over the speaker. */
      audioGainDb: gainDecibelsSchema.optional(),
      type: z.literal('INSERT_ASSET'),
    })
    .strict(),
  z
    .object({
      ...operationBase,
      ...assetPlacement,
      asset: assetReferenceSchema,
      /** Replacing the picture normally keeps the original speech. */
      keepSourceAudio: z.boolean().default(true),
      type: z.literal('REPLACE_ASSET'),
    })
    .strict(),
  z
    .object({
      ...operationBase,
      easing: easingSchema,
      endScale: z.number().gte(1).max(4),
      focus: normalizedPointSchema.optional(),
      startScale: z.number().gte(1).max(4),
      type: z.literal('ZOOM'),
    })
    .strict(),
  z
    .object({
      ...operationBase,
      easing: easingSchema,
      end: normalizedPointSchema,
      start: normalizedPointSchema,
      type: z.literal('PAN'),
    })
    .strict(),
  z
    .object({
      ...operationBase,
      rect: normalizedRectSchema,
      type: z.literal('CROP'),
    })
    .strict(),
  z
    .object({
      ...operationBase,
      aspectRatio: aspectRatioSchema,
      focus: normalizedPointSchema.optional(),
      strategy: z.enum(['PRIMARY_SPEAKER', 'CENTER', 'FIXED_POINT']),
      type: z.literal('REFRAME'),
    })
    .strict(),
  z
    .object({
      ...operationBase,
      transition: transitionSchema,
      type: z.literal('TRANSITION'),
    })
    .strict(),
  z
    .object({
      ...operationBase,
      emphasis: z
        .object({
          keywords: z
            .array(z.string().trim().min(1).max(80))
            .max(50)
            .default([]),
          mode: z.enum(['NONE', 'ACTIVE_WORD', 'KEYWORDS']).default('NONE'),
        })
        .strict()
        .default({ keywords: [], mode: 'NONE' }),
      style: textStyleSchema.default(defaultTextStyle),
      /**
       * Captions are generated from the stored transcript rather than carrying a
       * copy of the words, so the plan cannot drift out of sync with it.
       */
      transcriptSource: z.literal('TRANSCRIPT').default('TRANSCRIPT'),
      type: z.literal('CAPTION'),
    })
    .strict(),
  z
    .object({
      ...operationBase,
      style: textStyleSchema.default(defaultTextStyle),
      text: z.string().trim().min(1).max(500),
      type: z.literal('TEXT'),
    })
    .strict(),
  z
    .object({
      ...operationBase,
      asset: assetReferenceSchema,
      duckUnderSpeech: z.boolean().default(true),
      fadeInMs: millisecondsSchema.default(0),
      fadeOutMs: millisecondsSchema.default(0),
      gainDb: gainDecibelsSchema.default(-18),
      type: z.literal('MUSIC'),
    })
    .strict(),
  z
    .object({
      ...operationBase,
      fadeInMs: millisecondsSchema.default(0),
      fadeOutMs: millisecondsSchema.default(0),
      gainDb: gainDecibelsSchema.optional(),
      mute: z.boolean().default(false),
      type: z.literal('AUDIO_LEVEL'),
    })
    .strict()
    .refine((value) => value.mute || value.gainDb !== undefined, {
      message: 'AUDIO_LEVEL requires either mute or gainDb.',
      path: ['gainDb'],
    }),
]);

export type EditOperation = z.infer<typeof editOperationSchema>;
export type EditOperationType = EditOperation['type'];

/** Operations that reference an asset, for provenance checks. */
export type AssetBearingOperation = Extract<EditOperation, { asset: unknown }>;

export function operationAsset(
  operation: EditOperation,
): AssetBearingOperation['asset'] | undefined {
  return 'asset' in operation ? operation.asset : undefined;
}

export const editOperationTypes = [
  'REMOVE',
  'KEEP',
  'SPEED',
  'INSERT_ASSET',
  'REPLACE_ASSET',
  'ZOOM',
  'PAN',
  'CROP',
  'REFRAME',
  'TRANSITION',
  'CAPTION',
  'TEXT',
  'MUSIC',
  'AUDIO_LEVEL',
] as const satisfies readonly EditOperationType[];

export { durationMillisecondsSchema };
