export interface VideoSource {
  readonly uri: string;
}

export interface VideoMetadata {
  readonly durationSeconds: number;
  readonly height: number;
  readonly width: number;
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
