import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  FfprobeVideoProbe,
  VideoProbeError,
  ffprobeBinaryPath,
  parseFfprobeOutput,
} from '../src/index.js';

function report(value: unknown): string {
  return JSON.stringify(value);
}

describe('parseFfprobeOutput', () => {
  it('extracts technical metadata from a typical MP4 report', () => {
    const metadata = parseFfprobeOutput(
      report({
        format: { bit_rate: '2500000', duration: '92.457000' },
        streams: [
          {
            avg_frame_rate: '30000/1001',
            codec_name: 'h264',
            codec_type: 'video',
            height: 1080,
            width: 1920,
          },
          { codec_name: 'aac', codec_type: 'audio' },
        ],
      }),
    );

    expect(metadata).toEqual({
      audioCodec: 'aac',
      bitRate: 2_500_000,
      durationSeconds: 92.457,
      frameRate: 29.97,
      hasAudio: true,
      height: 1080,
      videoCodec: 'h264',
      width: 1920,
    });
  });

  it('falls back to stream duration when the container omits it', () => {
    const metadata = parseFfprobeOutput(
      report({
        format: {},
        streams: [
          {
            avg_frame_rate: '25/1',
            codec_name: 'vp9',
            codec_type: 'video',
            duration: '12.5',
            height: 720,
            width: 1280,
          },
        ],
      }),
    );

    expect(metadata.durationSeconds).toBe(12.5);
    expect(metadata.frameRate).toBe(25);
  });

  it('reports a silent video as having no audio track', () => {
    const metadata = parseFfprobeOutput(
      report({
        format: { duration: '4' },
        streams: [
          {
            codec_name: 'h264',
            codec_type: 'video',
            height: 480,
            width: 640,
          },
        ],
      }),
    );

    expect(metadata.hasAudio).toBe(false);
    expect(metadata.audioCodec).toBeNull();
  });

  it('treats an unknown frame rate as null rather than zero', () => {
    const metadata = parseFfprobeOutput(
      report({
        format: { duration: '4' },
        streams: [
          {
            avg_frame_rate: '0/0',
            codec_name: 'h264',
            codec_type: 'video',
            height: 480,
            width: 640,
          },
        ],
      }),
    );

    expect(metadata.frameRate).toBeNull();
  });

  it('rejects a file that carries no video stream', () => {
    expect(() =>
      parseFfprobeOutput(
        report({
          format: { duration: '30' },
          streams: [{ codec_name: 'mp3', codec_type: 'audio' }],
        }),
      ),
    ).toThrow(VideoProbeError);
  });

  it('rejects a report without a usable duration', () => {
    expect(() =>
      parseFfprobeOutput(
        report({
          format: { duration: 'N/A' },
          streams: [
            {
              codec_name: 'h264',
              codec_type: 'video',
              height: 480,
              width: 640,
            },
          ],
        }),
      ),
    ).toThrow(VideoProbeError);
  });

  it('rejects output that is not JSON', () => {
    expect(() => parseFfprobeOutput('not json')).toThrow(VideoProbeError);
  });
});

describe('FfprobeVideoProbe', () => {
  let directory: string;

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'clipgenius-probe-'));
  });

  afterAll(async () => {
    await rm(directory, { force: true, recursive: true });
  });

  it('resolves a bundled ffprobe binary for this platform', () => {
    expect(ffprobeBinaryPath).toMatch(/ffprobe(\.exe)?$/);
  });

  it('surfaces a domain error when the file is not media', async () => {
    const path = join(directory, 'not-a-video.mp4');
    await writeFile(path, 'this is definitely not an MP4');
    const probe = new FfprobeVideoProbe({ timeoutMs: 30_000 });

    await expect(probe.probe({ uri: path })).rejects.toBeInstanceOf(
      VideoProbeError,
    );
  });

  it('surfaces a domain error when the file is missing', async () => {
    const probe = new FfprobeVideoProbe({ timeoutMs: 30_000 });

    await expect(
      probe.probe({ uri: join(directory, 'absent.mp4') }),
    ).rejects.toBeInstanceOf(VideoProbeError);
  });
});
