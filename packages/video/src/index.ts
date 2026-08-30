export interface VideoSource {
  /** Absolute path to a readable local file. */
  readonly uri: string;
}

export interface VideoMetadata {
  readonly durationSeconds: number;
  readonly height: number;
  readonly width: number;
  readonly videoCodec: string | null;
  readonly audioCodec: string | null;
  readonly frameRate: number | null;
  readonly bitRate: number | null;
  readonly hasAudio: boolean;
}

export interface VideoProbe {
  probe(source: VideoSource): Promise<VideoMetadata>;
}

export interface AudioExtractionRequest {
  readonly sourcePath: string;
  readonly outputPath: string;
}

export interface ExtractedAudio {
  readonly path: string;
  readonly sizeBytes: number;
}

export interface AudioExtractor {
  extract(request: AudioExtractionRequest): Promise<ExtractedAudio>;
}

export interface VideoProcessor<TPlan = unknown> {
  process(source: VideoSource, plan: TPlan): Promise<VideoSource>;
}

export interface VideoRenderer<TPlan = unknown> {
  render(source: VideoSource, plan: TPlan): Promise<VideoSource>;
}

export interface CaptionRenderer<TCaptions = unknown> {
  renderCaptions(
    source: VideoSource,
    captions: TCaptions,
  ): Promise<VideoSource>;
}

export {
  FfprobeVideoProbe,
  VideoProbeError,
  ffprobeBinaryPath,
  parseFfprobeOutput,
} from './ffprobe.js';
export type { FfprobeVideoProbeOptions } from './ffprobe.js';
export {
  AudioExtractionError,
  FfmpegAudioExtractor,
  audioExtractionArguments,
  ffmpegBinaryPath,
} from './ffmpeg-audio.js';
export type { FfmpegAudioExtractorOptions } from './ffmpeg-audio.js';
export { RenderError, validatePlanForRendering } from './renderer.js';
export type {
  RenderErrorCategory,
  RenderedMedia,
  Renderer,
  RenderRequest,
  RenderResult,
  RenderSource,
  ResolvedRenderAsset,
  ValidatedEditPlan,
} from './renderer.js';
export { compileRenderTimeline } from './timeline.js';
export type {
  RenderDimensions,
  RenderTimeline,
  TimelineAudioLevel,
  TimelineOverlay,
  TimelineRange,
  TimelineSegment,
  TimelineText,
  TimelineZoom,
} from './timeline.js';
export { FfmpegRenderer, ffmpegRenderArguments } from './ffmpeg-renderer.js';
export type { FfmpegRendererOptions } from './ffmpeg-renderer.js';
export {
  renderAssetManifestSchema,
  storedRenderAssetSchema,
} from './render-manifest.js';
export type {
  RenderAssetManifest,
  StoredRenderAsset,
} from './render-manifest.js';
