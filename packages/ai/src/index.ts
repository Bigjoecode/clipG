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
  /** Absolute path to a worker-local audio file. */
  readonly mediaUri: string;
  readonly language?: string;
}

export interface TranscriptionSegment {
  readonly startSeconds: number;
  readonly endSeconds: number;
  readonly speaker: string | null;
  readonly text: string;
}

export interface TranscriptionResult {
  readonly durationSeconds: number | null;
  readonly language: string | null;
  readonly model: string;
  readonly provider: string;
  readonly segments: readonly TranscriptionSegment[];
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

export {
  OpenAITranscriptionProvider,
  TranscriptionProviderError,
} from './openai-transcription.js';
export type { OpenAITranscriptionProviderOptions } from './openai-transcription.js';
