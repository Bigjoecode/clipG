import { execFile } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';

import type {
  AudioExtractionRequest,
  AudioExtractor,
  ExtractedAudio,
} from './index.js';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

export const ffmpegBinaryPath = require('ffmpeg-static') as string | null;

export class AudioExtractionError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'AudioExtractionError';
  }
}

export function audioExtractionArguments(
  request: AudioExtractionRequest,
): readonly string[] {
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-nostdin',
    '-y',
    '-i',
    request.sourcePath,
    '-vn',
    '-ac',
    '1',
    '-ar',
    '16000',
    '-b:a',
    '64k',
    '-f',
    'mp3',
    request.outputPath,
  ];
}

export interface FfmpegAudioExtractorOptions {
  readonly timeoutMs: number;
}

/**
 * Produces a compact speech-oriented MP3. Sending audio rather than the source
 * video minimizes network transfer and provider upload cost while preserving
 * the immutable original in object storage.
 */
export class FfmpegAudioExtractor implements AudioExtractor {
  public constructor(private readonly options: FfmpegAudioExtractorOptions) {}

  public async extract(
    request: AudioExtractionRequest,
  ): Promise<ExtractedAudio> {
    if (ffmpegBinaryPath === null) {
      throw new AudioExtractionError(
        'No ffmpeg binary is available for this worker platform.',
      );
    }
    try {
      await execFileAsync(
        ffmpegBinaryPath,
        [...audioExtractionArguments(request)],
        {
          maxBuffer: 2 * 1024 * 1024,
          timeout: this.options.timeoutMs,
        },
      );
      const output = await stat(request.outputPath);
      if (!output.isFile() || output.size === 0) {
        throw new AudioExtractionError('ffmpeg produced no audio output.');
      }
      return { path: request.outputPath, sizeBytes: output.size };
    } catch (error) {
      if (error instanceof AudioExtractionError) {
        throw error;
      }
      throw new AudioExtractionError(
        `ffmpeg could not extract audio: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }
}
