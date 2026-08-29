import { z } from 'zod';

import { millisecondsSchema, timeRangeSchema } from './time.js';

/**
 * A semantic trigger describes *where* something should happen in terms of what
 * is being said rather than when. "When I mention the apostles" is a real
 * instruction that has no timestamp until a transcript is consulted.
 *
 * Task 009 only defines the representation. Nothing here resolves a trigger to a
 * time range — that is the Creative Director's job in a later milestone, and a
 * plan that still contains unresolved triggers is explicitly not render-ready.
 *
 * The union is discriminated on `kind` so new trigger kinds can be added without
 * changing existing ones.
 */
export const phraseMatchModes = ['EXACT', 'CONTAINS'] as const;

export const semanticTriggerSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('PHRASE'),
      match: z.enum(phraseMatchModes).default('CONTAINS'),
      phrase: z.string().trim().min(1).max(300),
    })
    .strict(),
  z
    .object({
      kind: z.literal('TOPIC'),
      topic: z.string().trim().min(1).max(160),
    })
    .strict(),
  z
    .object({
      kind: z.literal('SPEAKER'),
      speaker: z.string().trim().min(1).max(64),
    })
    .strict(),
  z
    .object({
      description: z.string().trim().min(1).max(300),
      kind: z.literal('EVENT'),
    })
    .strict(),
]);

export type SemanticTrigger = z.infer<typeof semanticTriggerSchema>;

export const triggerOccurrences = ['FIRST', 'LAST', 'ALL', 'NTH'] as const;

export const occurrenceSchema = z
  .object({
    /** Required when `select` is NTH; 1-based. */
    index: z.number().int().positive().max(100).optional(),
    select: z.enum(triggerOccurrences).default('FIRST'),
  })
  .strict()
  .refine((value) => value.select !== 'NTH' || value.index !== undefined, {
    message: 'index is required when select is NTH.',
    path: ['index'],
  })
  .refine((value) => value.select === 'NTH' || value.index === undefined, {
    message: 'index is only meaningful when select is NTH.',
    path: ['index'],
  });

/**
 * Where an operation applies.
 *
 * TIME is resolved and renderable. SEMANTIC is intent that still needs a
 * transcript to become a time range; `leadMs`/`trailMs` let an instruction say
 * "start a moment before the phrase" without inventing a timestamp.
 */
export const operationTargetSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('TIME'),
      range: timeRangeSchema,
    })
    .strict(),
  z
    .object({
      /** How long the operation should last once the trigger is located. */
      durationMs: millisecondsSchema.optional(),
      kind: z.literal('SEMANTIC'),
      leadMs: millisecondsSchema.default(0),
      occurrence: occurrenceSchema.default({ select: 'FIRST' }),
      trailMs: millisecondsSchema.default(0),
      trigger: semanticTriggerSchema,
    })
    .strict(),
]);

export type OperationTarget = z.infer<typeof operationTargetSchema>;

export function isTimeTarget(
  target: OperationTarget,
): target is Extract<OperationTarget, { kind: 'TIME' }> {
  return target.kind === 'TIME';
}
