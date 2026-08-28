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
