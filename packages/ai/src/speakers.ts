import type { TranscriptionSegment } from './index.js';

/**
 * Counts distinct attributed speakers. Returns null when nothing was
 * attributed, so a diarizing provider that found no speakers is not reported as
 * having found zero of them.
 */
export function distinctSpeakerCount(
  segments: readonly TranscriptionSegment[],
): number | null {
  const speakers = new Set<string>();
  for (const segment of segments) {
    if (segment.speaker !== null) {
      speakers.add(segment.speaker);
    }
  }
  return speakers.size === 0 ? null : speakers.size;
}
