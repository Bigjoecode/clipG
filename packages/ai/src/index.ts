export interface AIRequest {
  readonly systemPrompt: string;
  readonly userPrompt: string;
}

export interface AIProvider {
  generateStructured<TOutput>(
    request: AIRequest,
    validate: (value: unknown) => TOutput,
  ): Promise<TOutput>;
}

export interface TranscriptionRequest {
  readonly mediaUri: string;
  readonly language?: string;
}

export interface TranscriptionResult {
  readonly text: string;
}

export interface TranscriptionProvider {
  transcribe(request: TranscriptionRequest): Promise<TranscriptionResult>;
}

export interface VisionProvider {
  analyzeFrame(imageUri: string, instruction: string): Promise<unknown>;
}

export interface ImageGenerationProvider {
  generateImage(instruction: string): Promise<{ readonly uri: string }>;
}
