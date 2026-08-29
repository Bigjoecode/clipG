import { z } from 'zod';

import { durationMillisecondsSchema } from './time.js';

/**
 * Effect parameters are expressed in renderer-neutral terms: normalized
 * coordinates, scale multipliers, decibels, and named easing curves. There is
 * deliberately no filter string, no shell fragment, and no library-specific
 * option anywhere in this file — translating these into FFmpeg filters or
 * Remotion props is the rendering layer's job, and putting any of it here would
 * lock the contract to one engine.
 */
export const easings = [
  'LINEAR',
  'EASE_IN',
  'EASE_OUT',
  'EASE_IN_OUT',
] as const;

export const easingSchema = z.enum(easings).default('EASE_IN_OUT');

/** A point in normalized frame space: 0,0 is top-left and 1,1 is bottom-right. */
export const normalizedPointSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
  })
  .strict();

export type NormalizedPoint = z.infer<typeof normalizedPointSchema>;

/** A rectangle in normalized frame space. */
export const normalizedRectSchema = z
  .object({
    height: z.number().gt(0).max(1),
    width: z.number().gt(0).max(1),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
  })
  .strict()
  .refine((rect) => rect.x + rect.width <= 1 && rect.y + rect.height <= 1, {
    message: 'Rectangle must stay inside the frame.',
  });

export type NormalizedRect = z.infer<typeof normalizedRectSchema>;

export const aspectRatios = ['16:9', '9:16', '1:1', '4:5'] as const;
export const aspectRatioSchema = z.enum(aspectRatios);

export const transitionTypes = [
  'CUT',
  'FADE',
  'DISSOLVE',
  'SLIDE',
  'WIPE',
] as const;

export const transitionSchema = z
  .object({
    durationMs: durationMillisecondsSchema.max(5_000),
    type: z.enum(transitionTypes),
  })
  .strict();

/** How media that does not match the frame should be fitted into it. */
export const fitModes = ['CONTAIN', 'COVER', 'STRETCH'] as const;

export const textPositions = [
  'TOP',
  'UPPER_THIRD',
  'CENTER',
  'LOWER_THIRD',
  'BOTTOM',
] as const;

/**
 * Caption and text sizing is a multiplier rather than a pixel size. Pixel sizes
 * are meaningless until an output resolution is chosen, which the renderer owns.
 */
export const textStyleSchema = z
  .object({
    bold: z.boolean().default(false),
    fontScale: z.number().gt(0).max(4).default(1),
    position: z.enum(textPositions).default('LOWER_THIRD'),
    uppercase: z.boolean().default(false),
  })
  .strict();

export type TextStyle = z.infer<typeof textStyleSchema>;

export const gainDecibelsSchema = z.number().min(-60).max(12);
