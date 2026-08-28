import { describe, expect, it } from 'vitest';

import {
  AudioExtractionError,
  FfmpegAudioExtractor,
  audioExtractionArguments,
  ffmpegBinaryPath,
} from '../src/index.js';

describe('FfmpegAudioExtractor', () => {
  it('builds a bounded speech-oriented extraction command', () => {
    expect(
      audioExtractionArguments({
        outputPath: 'C:/temp/audio.mp3',
        sourcePath: 'C:/temp/source.mp4',
      }),
    ).toEqual([
      '-hide_banner',
      '-loglevel',
      'error',
      '-nostdin',
      '-y',
      '-i',
      'C:/temp/source.mp4',
      '-vn',
      '-ac',
      '1',
      '-ar',
      '16000',
      '-b:a',
      '64k',
      '-f',
      'mp3',
      'C:/temp/audio.mp3',
    ]);
  });

  it('ships a platform ffmpeg binary', () => {
    expect(ffmpegBinaryPath).toMatch(/ffmpeg(?:\.exe)?$/i);
  });

  it('reports an unreadable source as an extraction failure', async () => {
    const extractor = new FfmpegAudioExtractor({ timeoutMs: 10_000 });

    await expect(
      extractor.extract({
        outputPath: 'C:/definitely-missing/output.mp3',
        sourcePath: 'C:/definitely-missing/source.mp4',
      }),
    ).rejects.toBeInstanceOf(AudioExtractionError);
  });
});
