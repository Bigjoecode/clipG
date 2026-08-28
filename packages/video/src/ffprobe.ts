import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import { z } from 'zod';

import type { VideoMetadata, VideoProbe, VideoSource } from './index.js';

const execFileAsync = promisify(execFile);

/** Absolute path to the platform ffprobe binary bundled with the workspace. */
export const ffprobeBinaryPath: string = ffprobeInstaller.path;

export class VideoProbeError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'VideoProbeError';
  }
}

const numericString = z.union([z.string(), z.number()]);

const ffprobeStreamSchema = z.object({
  avg_frame_rate: z.string().optional(),
  bit_rate: numericString.optional(),
  codec_name: z.string().optional(),
  codec_type: z.string().optional(),
  duration: numericString.optional(),
  height: z.number().optional(),
  r_frame_rate: z.string().optional(),
  width: z.number().optional(),
});

const ffprobeOutputSchema = z.object({
  format: z
    .object({
      bit_rate: numericString.optional(),
      duration: numericString.optional(),
    })
    .optional(),
  streams: z.array(ffprobeStreamSchema).optional(),
});

function finiteNumber(value: string | number | undefined): number | null {
  if (value === undefined) {
    return null;
  }
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * ffprobe reports frame rates as a rational string such as `30000/1001`.
 * A zero denominator or a `0/0` placeholder means "unknown", not zero.
 */
function parseFrameRate(value: string | undefined): number | null {
  if (value === undefined) {
    return null;
  }
  const [numerator, denominator] = value.split('/');
  const top = finiteNumber(numerator);
  const bottom = denominator === undefined ? 1 : finiteNumber(denominator);
  if (top === null || bottom === null || bottom === 0 || top === 0) {
    return null;
  }
  return Math.round((top / bottom) * 1000) / 1000;
}

/**
 * Turns raw ffprobe JSON into the technical metadata ClipGenius stores. Exported
 * separately from process execution so container quirks can be covered by tests
 * without spawning a binary.
 */
export function parseFfprobeOutput(raw: string): VideoMetadata {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    throw new VideoProbeError('ffprobe returned output that was not JSON.');
  }

  const result = ffprobeOutputSchema.safeParse(parsedJson);
  if (!result.success) {
    throw new VideoProbeError('ffprobe returned an unexpected report shape.');
  }

  const streams = result.data.streams ?? [];
  const videoStream = streams.find(
    (stream) => stream.codec_type === 'video' && stream.width !== undefined,
  );
  const audioStream = streams.find((stream) => stream.codec_type === 'audio');

  if (videoStream === undefined) {
    throw new VideoProbeError('The file does not contain a video stream.');
  }

  const width = videoStream.width;
  const height = videoStream.height;
  if (
    width === undefined ||
    height === undefined ||
    width <= 0 ||
    height <= 0
  ) {
    throw new VideoProbeError(
      'The video stream reported no usable dimensions.',
    );
  }

  // WebM and fragmented MP4 frequently omit format-level duration, so fall back
  // to the video stream before giving up.
  const durationSeconds =
    finiteNumber(result.data.format?.duration) ??
    finiteNumber(videoStream.duration);
  if (durationSeconds === null || durationSeconds <= 0) {
    throw new VideoProbeError('The video reported no usable duration.');
  }

  const bitRate =
    finiteNumber(result.data.format?.bit_rate) ??
    finiteNumber(videoStream.bit_rate);

  return {
    audioCodec: audioStream?.codec_name ?? null,
    bitRate: bitRate === null ? null : Math.round(bitRate),
    durationSeconds: Math.round(durationSeconds * 1000) / 1000,
    frameRate:
      parseFrameRate(videoStream.avg_frame_rate) ??
      parseFrameRate(videoStream.r_frame_rate),
    hasAudio: audioStream !== undefined,
    height,
    videoCodec: videoStream.codec_name ?? null,
    width,
  };
}

export interface FfprobeVideoProbeOptions {
  readonly timeoutMs: number;
}

/**
 * Reads technical metadata from a local file with the bundled ffprobe binary.
 * ffprobe only inspects headers, so it never loads the media into memory and the
 * caller keeps ownership of the file's lifetime.
 */
export class FfprobeVideoProbe implements VideoProbe {
  private readonly timeoutMs: number;

  public constructor(options: FfprobeVideoProbeOptions) {
    this.timeoutMs = options.timeoutMs;
  }

  public async probe(source: VideoSource): Promise<VideoMetadata> {
    let stdout: string;
    try {
      const result = await execFileAsync(
        ffprobeBinaryPath,
        [
          '-v',
          'error',
          '-print_format',
          'json',
          '-show_format',
          '-show_streams',
          source.uri,
        ],
        { maxBuffer: 8 * 1024 * 1024, timeout: this.timeoutMs },
      );
      stdout = result.stdout;
    } catch (error) {
      throw new VideoProbeError(
        `ffprobe could not read the media file: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }

    return parseFfprobeOutput(stdout);
  }
}
