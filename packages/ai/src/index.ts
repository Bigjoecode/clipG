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

export interface ContentIntelligenceSegment {
  readonly startSeconds: number;
  readonly endSeconds: number;
  readonly speaker: string | null;
  readonly text: string;
}

export interface ContentIntelligenceRequest {
  readonly systemPrompt: string;
  readonly safetyIdentifier: string;
  readonly durationSeconds: number;
  readonly language: string | null;
  readonly diarized: boolean;
  readonly speakerCount: number | null;
  readonly project: {
    readonly name: string;
    readonly description: string | null;
  };
  readonly segments: readonly ContentIntelligenceSegment[];
}

export interface ContentIntelligenceOpportunity {
  readonly type:
    | 'STORY'
    | 'ARGUMENT'
    | 'INSIGHT'
    | 'QUESTION_ANSWER'
    | 'QUOTE'
    | 'HOOK'
    | 'CALL_TO_ACTION'
    | 'EMOTIONAL_MOMENT'
    | 'VISUAL_OPPORTUNITY';
  readonly title: string;
  readonly topic: string;
  readonly hook: string;
  readonly summary: string;
  readonly rationale: string;
  readonly evidenceText: string;
  readonly startSeconds: number;
  readonly endSeconds: number;
  readonly recommendedDurationSeconds: number;
  readonly recommendedPlatforms: readonly (
    'YOUTUBE' | 'INSTAGRAM' | 'TIKTOK' | 'FACEBOOK'
  )[];
  readonly scores: {
    readonly hook: number;
    readonly clarity: number;
    readonly emotionalImpact: number;
    readonly standaloneValue: number;
    readonly retentionPotential: number;
    readonly platformFit: number;
  };
}

export interface ContentIntelligenceResult {
  readonly provider: string;
  readonly model: string;
  readonly summary: string;
  readonly topics: readonly string[];
  readonly keywords: readonly string[];
  readonly opportunities: readonly ContentIntelligenceOpportunity[];
  readonly usage: AiUsage;
}

export interface ContentIntelligenceProvider {
  analyze(
    request: ContentIntelligenceRequest,
  ): Promise<ContentIntelligenceResult>;
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
  /** Whether this provider attributed speech to speakers for this request. */
  readonly diarized: boolean;
  readonly speakerCount: number | null;
  readonly usage: AiUsage;
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
export { DeepgramTranscriptionProvider } from './deepgram-transcription.js';
export type { DeepgramTranscriptionProviderOptions } from './deepgram-transcription.js';
export { distinctSpeakerCount } from './speakers.js';
export {
  ContentIntelligenceProviderError,
  contentIntelligenceResultSchema,
  parseContentIntelligence,
} from './content-intelligence-result.js';
export { AnthropicContentIntelligenceProvider } from './anthropic-content-intelligence.js';
export type { AnthropicContentIntelligenceProviderOptions } from './anthropic-content-intelligence.js';
export {
  GeminiContentIntelligenceProvider,
  geminiApiRevision,
  geminiContentIntelligenceSchema,
} from './gemini-content-intelligence.js';
export type { GeminiContentIntelligenceProviderOptions } from './gemini-content-intelligence.js';
export { OpenAIContentIntelligenceProvider } from './openai-content-intelligence.js';
export type { OpenAIContentIntelligenceProviderOptions } from './openai-content-intelligence.js';
export { aiPricingCatalog, estimateAiCost } from './pricing.js';
export type {
  AiCostEstimate,
  AiOperation,
  AiPricingSnapshot,
} from './pricing.js';
export { emptyAiUsage, finiteUsageCount } from './usage.js';
export type { AiErrorCategory, AiUsage } from './usage.js';
export { aggregateAiUsage } from './aggregation.js';
export type { AiUsageLedgerRecord, AiUsageTotal } from './aggregation.js';

import type { AiUsage } from './usage.js';
