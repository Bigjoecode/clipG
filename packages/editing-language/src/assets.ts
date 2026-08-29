import { z } from 'zod';

import { durationMillisecondsSchema } from './time.js';

/**
 * Where a piece of media came from. This is provenance, not file type, and it is
 * deliberately not inferable from the asset id: the engineering instructions
 * require that every timeline asset stay distinguishable as original source
 * media, user-supplied media, AI-generated media, or licensed media.
 */
export const mediaSources = [
  'SOURCE_MEDIA',
  'USER_ASSET',
  'AI_GENERATED_ASSET',
  'LICENSED_ASSET',
] as const;

export const assetKinds = ['VIDEO', 'IMAGE', 'AUDIO'] as const;

export type MediaSource = (typeof mediaSources)[number];
export type AssetKind = (typeof assetKinds)[number];

/**
 * A reference to media by stable id. An operation never carries bytes, a URL, a
 * storage key, or a signed link — resolving an id to actual media is the
 * renderer's job, and keeping it out of the plan is what makes a plan safe to
 * store, diff, and replay.
 */
export const assetReferenceSchema = z
  .object({
    assetId: z.uuid(),
    source: z.enum(mediaSources),
  })
  .strict();

export type AssetReference = z.infer<typeof assetReferenceSchema>;

export const availableAssetSchema = z
  .object({
    assetId: z.uuid(),
    durationMs: durationMillisecondsSchema.optional(),
    kind: z.enum(assetKinds),
    source: z.enum(mediaSources),
  })
  .strict();

export type AvailableAsset = z.infer<typeof availableAssetSchema>;

/**
 * What the validator is allowed to assume exists. A plan is only meaningful
 * against a context: the same plan is valid for one project and invalid for
 * another whose assets differ.
 *
 * `allowAiGeneratedAssets` defaults to false at every call site. AI-generated
 * media is supplemental and may only appear when the user has explicitly asked
 * for it or enabled a clearly communicated setting, so the language refuses it
 * unless that permission is passed in.
 */
export const assetContextSchema = z
  .object({
    allowAiGeneratedAssets: z.boolean().default(false),
    assets: z.array(availableAssetSchema).default([]),
    sourceDurationMs: durationMillisecondsSchema,
    sourceMediaId: z.uuid(),
  })
  .strict();

export type AssetContext = z.infer<typeof assetContextSchema>;
