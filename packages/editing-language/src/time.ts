import { z } from 'zod';

/**
 * Time is stored as whole milliseconds, never as seconds and never as a
 * human-readable timecode string.
 *
 * Seconds are the wrong canonical unit here even though the rest of the domain
 * (transcripts, content opportunities) speaks seconds: edit ranges are compared
 * for overlap, summed, and subtracted, and binary floating point makes those
 * operations inexact. Integer milliseconds make range arithmetic and conflict
 * detection exact, which is what "deterministic" has to mean for a contract that
 * two different renderers must interpret identically.
 *
 * Conversion happens deliberately at the boundary — see `secondsToMilliseconds`.
 */
export const maxTimelineMilliseconds = 24 * 60 * 60 * 1_000;

export const millisecondsSchema = z
  .number()
  .int('Time must be whole milliseconds.')
  .min(0)
  .max(maxTimelineMilliseconds);

export const durationMillisecondsSchema = z
  .number()
  .int('Duration must be whole milliseconds.')
  .positive('Duration must be greater than zero.')
  .max(maxTimelineMilliseconds);

/**
 * A half-open range `[startMs, endMs)`.
 *
 * `endMs` must be strictly greater than `startMs`. A zero-length range is
 * always a no-op and is far more often a generation error than an intent, so it
 * is rejected rather than silently carried to the renderer.
 */
export const timeRangeSchema = z
  .object({
    endMs: millisecondsSchema,
    startMs: millisecondsSchema,
  })
  .strict()
  .refine((range) => range.endMs > range.startMs, {
    message: 'endMs must be greater than startMs.',
    path: ['endMs'],
  });

export type TimeRange = z.infer<typeof timeRangeSchema>;

export function rangeDurationMs(range: TimeRange): number {
  return range.endMs - range.startMs;
}

/** Half-open overlap: ranges that merely touch at a boundary do not overlap. */
export function rangesOverlap(left: TimeRange, right: TimeRange): boolean {
  return left.startMs < right.endMs && right.startMs < left.endMs;
}

export function rangeContains(outer: TimeRange, inner: TimeRange): boolean {
  return inner.startMs >= outer.startMs && inner.endMs <= outer.endMs;
}

/**
 * Converts seconds from upstream analysis (transcripts, content opportunities)
 * into the canonical unit. Rounding happens here, once, on purpose.
 */
export function secondsToMilliseconds(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new RangeError('Seconds must be a finite, non-negative number.');
  }
  return Math.round(seconds * 1_000);
}

export function millisecondsToSeconds(milliseconds: number): number {
  return milliseconds / 1_000;
}

/** `1:05.250`. For logs and fixtures only — never the stored value. */
export function formatTimecode(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const remainder = milliseconds % 1_000;
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(remainder).padStart(3, '0')}`;
}
