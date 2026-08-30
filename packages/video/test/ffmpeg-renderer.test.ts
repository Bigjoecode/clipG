import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

import {
  FfmpegRenderer,
  RenderError,
  ffmpegBinaryPath,
  ffmpegRenderArguments,
  compileRenderTimeline,
  validatePlanForRendering,
  type RenderRequest,
} from '../src/index.js';

import {
  context,
  imageId,
  planWith,
  reframe,
  remove,
  sourceId,
  target,
  text,
} from './render-fixtures.js';

const execFileAsync = promisify(execFile);
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { force: true, recursive: true })),
  );
});

function hash(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

async function goldenInputs() {
  if (ffmpegBinaryPath === null) throw new Error('FFmpeg unavailable');
  const directory = await mkdtemp(join(tmpdir(), 'clipgenius-render-'));
  temporaryDirectories.push(directory);
  const sourcePath = join(directory, 'source.mp4');
  const imagePath = join(directory, 'asset.png');
  await execFileAsync(ffmpegBinaryPath, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=640x360:rate=30:duration=10',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:sample_rate=48000:duration=10',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-shortest',
    sourcePath,
  ]);
  await execFileAsync(ffmpegBinaryPath, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=purple:size=240x160',
    '-frames:v',
    '1',
    imagePath,
  ]);
  return { directory, imagePath, sourcePath };
}

function goldenPlan() {
  return planWith(
    [
      remove,
      reframe('9:16'),
      {
        easing: 'LINEAR',
        endScale: 1.1,
        id: crypto.randomUUID(),
        startScale: 1,
        target: target(2_000, 7_000),
        type: 'ZOOM',
      },
      {
        asset: { assetId: imageId, source: 'USER_ASSET' },
        fit: 'CONTAIN',
        id: crypto.randomUUID(),
        opacity: 0.9,
        rect: { height: 0.3, width: 0.4, x: 0.55, y: 0.05 },
        target: target(4_000, 6_000),
        type: 'INSERT_ASSET',
      },
      text,
      {
        fadeInMs: 0,
        fadeOutMs: 0,
        gainDb: -3,
        id: crypto.randomUUID(),
        mute: false,
        target: target(2_000, 10_000),
        type: 'AUDIO_LEVEL',
      },
    ],
    '9:16',
  );
}

describe('FFmpeg renderer', () => {
  it('builds safe argument arrays rather than shell commands', () => {
    const plan = validatePlanForRendering(goldenPlan(), context);
    const request: RenderRequest = {
      assets: [
        {
          assetId: imageId,
          kind: 'IMAGE',
          path: resolve('image.png'),
          source: 'USER_ASSET',
        },
      ],
      outputPath: resolve('output.mp4'),
      plan,
      source: {
        hasAudio: true,
        mediaAssetId: sourceId,
        path: resolve('in.mp4'),
      },
    };
    const args = ffmpegRenderArguments(
      request,
      compileRenderTimeline(plan, request.assets),
    );
    expect(args).toContain('-filter_complex');
    expect(args).not.toContain('sh');
    expect(args.at(-1)).toBe(request.outputPath);
  });

  it('classifies a missing source before invoking FFmpeg', async () => {
    const plan = validatePlanForRendering(planWith([text]), context);
    const renderer = new FfmpegRenderer({ timeoutMs: 5_000 });
    await expect(
      renderer.render({
        assets: [],
        outputPath: resolve('out.mp4'),
        plan,
        source: {
          hasAudio: true,
          mediaAssetId: sourceId,
          path: resolve('missing.mp4'),
        },
      }),
    ).rejects.toMatchObject({ category: 'MISSING_SOURCE_MEDIA' });
  });

  it('refuses to overwrite immutable source media', async () => {
    const { sourcePath } = await goldenInputs();
    const plan = validatePlanForRendering(planWith([text]), context);
    const renderer = new FfmpegRenderer({ timeoutMs: 5_000 });
    await expect(
      renderer.render({
        assets: [],
        outputPath: sourcePath,
        plan,
        source: { hasAudio: true, mediaAssetId: sourceId, path: sourcePath },
      }),
    ).rejects.toEqual(
      new RenderError(
        'RENDERER_FAILURE',
        'Render output must never overwrite source media.',
      ),
    );
  });

  it(
    'golden-renders REMOVE, REFRAME, ZOOM, INSERT_ASSET, TEXT, and AUDIO_LEVEL',
    { timeout: 120_000 },
    async () => {
      const { directory, imagePath, sourcePath } = await goldenInputs();
      const sourceBefore = await readFile(sourcePath);
      const outputPath = join(directory, 'rendered.mp4');
      const renderer = new FfmpegRenderer({ timeoutMs: 120_000 });
      const result = await renderer.render({
        assets: [
          {
            assetId: imageId,
            kind: 'IMAGE',
            path: imagePath,
            source: 'USER_ASSET',
          },
        ],
        outputPath,
        plan: validatePlanForRendering(goldenPlan(), context),
        source: { hasAudio: true, mediaAssetId: sourceId, path: sourcePath },
      });

      expect(result).toMatchObject({
        backend: 'ffmpeg',
        media: {
          audioCodec: 'aac',
          container: 'mp4',
          height: 1280,
          videoCodec: 'h264',
          width: 720,
        },
        status: 'SUCCEEDED',
        version: '1.0.0',
      });
      expect(result.media.durationMs).toBeGreaterThanOrEqual(7_900);
      expect(result.media.durationMs).toBeLessThanOrEqual(8_100);
      expect(result.media.sizeBytes).toBeGreaterThan(0);
      expect(hash(await readFile(sourcePath))).toBe(hash(sourceBefore));
      process.stdout.write(
        `\nGOLDEN_RENDER=${JSON.stringify({
          outputDurationMs: result.media.durationMs,
          renderDurationMs: result.renderDurationMs,
          renderRatio: result.renderDurationMs / result.media.durationMs,
          sourceDurationMs: 10_000,
        })}\n`,
      );
    },
  );
});
