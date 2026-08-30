import { z } from 'zod';

import { aspectRatioSchema } from './effects.js';
import { editOperationSchema } from './operations.js';
import { durationMillisecondsSchema } from './time.js';

/**
 * The only schema version this build understands.
 *
 * Adding a version means adding a literal here and a branch in
 * `parseEditPlan` — never loosening this to `z.string()`. A stored plan must
 * either be understood exactly or rejected loudly; silently reinterpreting an
 * old plan under new rules would change what a user's saved edit means.
 */
export const editPlanSchemaVersion = '1.0' as const;
export const supportedEditPlanSchemaVersions = ['1.0'] as const;

export const editPlatforms = [
  'YOUTUBE',
  'INSTAGRAM',
  'TIKTOK',
  'FACEBOOK',
  'NONE',
] as const;

/**
 * How the timeline treats spans nobody mentioned.
 *
 * KEEP_ALL_EXCEPT_REMOVED expresses "remove the boring intro, leave the rest".
 * KEEP_ONLY_SELECTED expresses "pull these three moments out", which is what
 * clip generation needs. Without this flag a bare list of KEEP and REMOVE
 * operations is ambiguous about everything it does not mention.
 */
export const retentionModes = [
  'KEEP_ALL_EXCEPT_REMOVED',
  'KEEP_ONLY_SELECTED',
] as const;

export const editPlanSourceSchema = z
  .object({
    durationMs: durationMillisecondsSchema,
    mediaAssetId: z.uuid(),
    /** The base timeline is always the user's original, immutable upload. */
    source: z.literal('SOURCE_MEDIA'),
  })
  .strict();

export const editPlanOutputSchema = z
  .object({
    aspectRatio: aspectRatioSchema,
    targetDurationMs: durationMillisecondsSchema.optional(),
  })
  .strict();

export const editPlanMetadataSchema = z
  .object({
    /** Who authored this plan. AI-authored plans are not privileged. */
    createdBy: z.enum(['USER', 'AI']),
    notes: z.string().trim().max(2_000).optional(),
    /**
     * The plan this one revises. Editing is non-destructive: a change produces a
     * new plan that points back rather than mutating the previous one. Task 009
     * records the link only; the revision system itself comes later.
     */
    parentPlanId: z.uuid().optional(),
  })
  .strict();

export const editPlanSchema = z
  .object({
    id: z.uuid(),
    metadata: editPlanMetadataSchema,
    objective: z.string().trim().min(1).max(500),
    operations: z.array(editOperationSchema).min(1).max(200),
    output: editPlanOutputSchema,
    platform: z.enum(editPlatforms).default('NONE'),
    retention: z.enum(retentionModes).default('KEEP_ALL_EXCEPT_REMOVED'),
    schemaVersion: z.literal(supportedEditPlanSchemaVersions),
    source: editPlanSourceSchema,
  })
  .strict();

export type EditPlan = z.infer<typeof editPlanSchema>;
export type EditPlanSource = z.infer<typeof editPlanSourceSchema>;
export type EditPlanMetadata = z.infer<typeof editPlanMetadataSchema>;
