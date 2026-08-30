import { execFile } from 'node:child_process';
import { access, constants, stat } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { promisify } from 'node:util';

import {
  RenderError,
  type Renderer,
  type RenderRequest,
  type RenderResult,
} from './renderer.js';
import {
  compileRenderTimeline,
  type RenderTimeline,
  type TimelineRange,
} from './timeline.js';
import { FfprobeVideoProbe, VideoProbeError } from './ffprobe.js';
import type { VideoProbe } from './index.js';
import { ffmpegBinaryPath } from './ffmpeg-audio.js';

const execFileAsync = promisify(execFile);
const framesPerSecond = 30;
const defaultFontPath =
  process.platform === 'win32'
    ? 'C:/Windows/Fonts/arial.ttf'
    : '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';

export interface FfmpegRendererOptions {
  readonly timeoutMs: number;
  readonly probe?: VideoProbe;
}

function seconds(milliseconds: number): string {
  return (milliseconds / 1_000).toFixed(3);
}

function escapedFilterText(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll(':', '\\:')
    .replaceAll("'", "\\'")
    .replaceAll(',', '\\,')
    .replaceAll('[', '\\[')
    .replaceAll(']', '\\]')
    .replaceAll('%', '\\%')
    .replaceAll(';', '\\;');
}

function enable(range: TimelineRange): string {
  return `between(t,${seconds(range.startMs)},${seconds(range.endMs)})`;
}

function positionY(position: string): string {
  if (position === 'TOP') return 'h*0.05';
  if (position === 'UPPER_THIRD') return 'h*0.25-text_h/2';
  if (position === 'CENTER') return '(h-text_h)/2';
  if (position === 'BOTTOM') return 'h-text_h-h*0.05';
  return 'h*0.75-text_h/2';
}

function zoomProgress(easing: string, progress: string): string {
  if (easing === 'LINEAR') return progress;
  if (easing === 'EASE_IN') return `(${progress})*(${progress})`;
  if (easing === 'EASE_OUT') return `1-(1-(${progress}))*(1-(${progress}))`;
  return `if(lt(${progress},0.5),2*(${progress})*(${progress}),1-pow(-2*(${progress})+2,2)/2)`;
}

/** Builds arguments only; execution always uses execFile and never a shell. */
export function ffmpegRenderArguments(
  request: RenderRequest,
  timeline: RenderTimeline,
): readonly string[] {
  const args: string[] = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-nostdin',
    '-y',
    '-i',
    request.source.path,
  ];
  for (const overlay of timeline.overlays) {
    if (overlay.kind === 'IMAGE') {
      args.push('-loop', '1', '-framerate', String(framesPerSecond));
    }
    args.push('-i', overlay.path);
  }

  const filters: string[] = [];
  const videoSegments: string[] = [];
  const audioSegments: string[] = [];
  timeline.segments.forEach((segment, index) => {
    const video = `vseg${index}`;
    filters.push(
      `[0:v]trim=start=${seconds(segment.sourceStartMs)}:end=${seconds(segment.sourceEndMs)},setpts=PTS-STARTPTS,scale=${timeline.dimensions.width}:${timeline.dimensions.height}:force_original_aspect_ratio=increase,crop=${timeline.dimensions.width}:${timeline.dimensions.height}:(iw-${timeline.dimensions.width})*${timeline.reframeFocus.x}:(ih-${timeline.dimensions.height})*${timeline.reframeFocus.y},setsar=1[${video}]`,
    );
    videoSegments.push(`[${video}]`);
    if (request.source.hasAudio) {
      const audio = `aseg${index}`;
      filters.push(
        `[0:a]atrim=start=${seconds(segment.sourceStartMs)}:end=${seconds(segment.sourceEndMs)},asetpts=PTS-STARTPTS[${audio}]`,
      );
      audioSegments.push(`[${audio}]`);
    }
  });

  if (videoSegments.length === 1) {
    filters.push(`${videoSegments[0]}null[basev]`);
  } else {
    filters.push(
      `${videoSegments.join('')}concat=n=${videoSegments.length}:v=1:a=0[basev]`,
    );
  }
  if (request.source.hasAudio) {
    if (audioSegments.length === 1) {
      filters.push(`${audioSegments[0]}anull[basea]`);
    } else {
      filters.push(
        `${audioSegments.join('')}concat=n=${audioSegments.length}:v=0:a=1[basea]`,
      );
    }
  } else {
    filters.push(
      `anullsrc=r=48000:cl=stereo,atrim=duration=${seconds(timeline.durationMs)}[basea]`,
    );
  }

  let videoLabel = 'basev';
  timeline.zooms.forEach((zoom, index) => {
    const next = `zoom${index}`;
    const start = seconds(zoom.startMs);
    const duration = seconds(zoom.endMs - zoom.startMs);
    const progress = `max(0,min(1,(on/${framesPerSecond}-${start})/${duration}))`;
    const eased = zoomProgress(zoom.easing, progress);
    const scale = `${zoom.startScale}+(${zoom.endScale}-${zoom.startScale})*(${eased})`;
    filters.push(
      `[${videoLabel}]zoompan=z='if(between(on/${framesPerSecond},${start},${seconds(zoom.endMs)}),${scale},1)':x='iw*${zoom.focus.x}-iw/zoom*${zoom.focus.x}':y='ih*${zoom.focus.y}-ih/zoom*${zoom.focus.y}':d=1:s=${timeline.dimensions.width}x${timeline.dimensions.height}:fps=${framesPerSecond}[${next}]`,
    );
    videoLabel = next;
  });

  timeline.overlays.forEach((overlay, index) => {
    const input = index + 1;
    const prepared = `overlayasset${index}`;
    const next = `overlay${index}`;
    const rect = overlay.rect ?? { height: 1, width: 1, x: 0, y: 0 };
    const width = Math.max(
      2,
      Math.round(timeline.dimensions.width * rect.width),
    );
    const height = Math.max(
      2,
      Math.round(timeline.dimensions.height * rect.height),
    );
    const x = Math.round(timeline.dimensions.width * rect.x);
    const y = Math.round(timeline.dimensions.height * rect.y);
    const fit =
      overlay.fit === 'STRETCH'
        ? `scale=${width}:${height}`
        : overlay.fit === 'CONTAIN'
          ? `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black@0`
          : `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
    filters.push(
      `[${input}:v]${fit},format=rgba,colorchannelmixer=aa=${overlay.opacity},trim=duration=${seconds(overlay.endMs - overlay.startMs)},setpts=PTS-STARTPTS+${seconds(overlay.startMs)}/TB[${prepared}]`,
    );
    filters.push(
      `[${videoLabel}][${prepared}]overlay=${x}:${y}:eof_action=pass:enable='${enable(overlay)}'[${next}]`,
    );
    videoLabel = next;
  });

  timeline.texts.forEach((text, index) => {
    const next = `text${index}`;
    const fontSize = Math.round(48 * text.style.fontScale);
    const renderedText = text.style.uppercase
      ? text.text.toUpperCase()
      : text.text;
    filters.push(
      `[${videoLabel}]drawtext=text='${escapedFilterText(renderedText)}':fontfile='${defaultFontPath.replace(':', '\\:')}':fontsize=${fontSize}:fontcolor=white:borderw=${text.style.bold ? 4 : 2}:bordercolor=black:x=(w-text_w)/2:y=${positionY(text.style.position)}:enable='${enable(text)}'[${next}]`,
    );
    videoLabel = next;
  });

  let audioLabel = 'basea';
  timeline.audioLevels.forEach((level, index) => {
    const next = `audio${index}`;
    const volume = level.mute ? '0' : `pow(10,${String(level.gainDb ?? 0)}/20)`;
    const chain = [`volume='${volume}':enable='${enable(level)}'`];
    if (level.fadeInMs > 0) {
      chain.push(
        `afade=t=in:st=${seconds(level.startMs)}:d=${seconds(level.fadeInMs)}`,
      );
    }
    if (level.fadeOutMs > 0) {
      chain.push(
        `afade=t=out:st=${seconds(level.endMs - level.fadeOutMs)}:d=${seconds(level.fadeOutMs)}`,
      );
    }
    filters.push(`[${audioLabel}]${chain.join(',')}[${next}]`);
    audioLabel = next;
  });

  args.push(
    '-filter_complex',
    filters.join(';'),
    '-map',
    `[${videoLabel}]`,
    '-map',
    `[${audioLabel}]`,
    '-t',
    seconds(timeline.durationMs),
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-movflags',
    '+faststart',
    request.outputPath,
  );
  return args;
}

async function readableFile(path: string, category: RenderError['category']) {
  if (!isAbsolute(path)) {
    throw new RenderError(category, `Renderer path must be absolute: ${path}`);
  }
  try {
    await access(path, constants.R_OK);
    const details = await stat(path);
    if (!details.isFile()) throw new Error('not a file');
  } catch {
    throw new RenderError(category, `Renderer input is not readable: ${path}`);
  }
}

export class FfmpegRenderer implements Renderer {
  private readonly probe: VideoProbe;

  public constructor(private readonly options: FfmpegRendererOptions) {
    this.probe =
      options.probe ?? new FfprobeVideoProbe({ timeoutMs: options.timeoutMs });
  }

  public async render(request: RenderRequest): Promise<RenderResult> {
    if (ffmpegBinaryPath === null) {
      throw new RenderError(
        'RENDERER_FAILURE',
        'No FFmpeg binary is available for this worker platform.',
      );
    }
    if (request.source.mediaAssetId !== request.plan.plan.source.mediaAssetId) {
      throw new RenderError(
        'INVALID_EDIT_PLAN',
        'Resolved source media does not match the validated EditPlan.',
      );
    }
    if (
      !isAbsolute(request.outputPath) ||
      !request.outputPath.endsWith('.mp4')
    ) {
      throw new RenderError(
        'RENDERER_FAILURE',
        'Render output must be an absolute MP4 path.',
      );
    }
    if (resolve(request.source.path) === resolve(request.outputPath)) {
      throw new RenderError(
        'RENDERER_FAILURE',
        'Render output must never overwrite source media.',
      );
    }
    await readableFile(request.source.path, 'MISSING_SOURCE_MEDIA');
    for (const asset of request.assets) {
      await readableFile(asset.path, 'MISSING_ASSET');
    }
    const timeline = compileRenderTimeline(request.plan, request.assets);
    const startedAt = Date.now();
    try {
      await execFileAsync(
        ffmpegBinaryPath,
        [...ffmpegRenderArguments(request, timeline)],
        { maxBuffer: 8 * 1024 * 1024, timeout: this.options.timeoutMs },
      );
    } catch (error) {
      const timedOut =
        error instanceof Error && 'killed' in error && error.killed === true;
      throw new RenderError(
        timedOut ? 'TIMEOUT' : 'RENDERER_FAILURE',
        `FFmpeg render failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        !timedOut,
      );
    }
    const output = await stat(request.outputPath);
    try {
      const metadata = await this.probe.probe({ uri: request.outputPath });
      return {
        backend: 'ffmpeg',
        media: {
          audioCodec: metadata.audioCodec,
          container: 'mp4',
          durationMs: Math.round(metadata.durationSeconds * 1_000),
          height: metadata.height,
          path: request.outputPath,
          sizeBytes: output.size,
          videoCodec: metadata.videoCodec ?? 'h264',
          width: metadata.width,
        },
        renderDurationMs: Date.now() - startedAt,
        status: 'SUCCEEDED',
        version: '1.0.0',
        warnings: [],
      };
    } catch (error) {
      throw new RenderError(
        error instanceof VideoProbeError
          ? 'UNSUPPORTED_CODEC'
          : 'RENDERER_FAILURE',
        `Rendered output could not be verified: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }
}
