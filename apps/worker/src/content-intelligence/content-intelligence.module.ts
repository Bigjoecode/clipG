import {
  parseContentIntelligenceEnvironment,
  parseContentIntelligenceJobEnvironment,
} from '@clipgenius/config';
import {
  AnthropicContentIntelligenceProvider,
  GeminiContentIntelligenceProvider,
  OpenAIContentIntelligenceProvider,
  type ContentIntelligenceProvider,
} from '@clipgenius/ai';
import { contentIntelligencePrompt } from '@clipgenius/prompts';
import { contentIntelligenceQueueName } from '@clipgenius/types';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import {
  CONTENT_INTELLIGENCE_PROVIDER,
  CONTENT_INTELLIGENCE_SETTINGS,
  ContentIntelligenceProcessor,
  type ContentIntelligenceSettings,
} from './content-intelligence.processor.js';

/**
 * Per-provider model defaults. Both support schema-constrained decoding, which
 * this analysis depends on: every malformed response costs a full retry over a
 * long transcript.
 */
const defaultAnthropicModel = 'claude-opus-5';
const defaultGeminiModel = 'gemini-3.6-flash';
const defaultOpenAIModel = 'gpt-5.6-terra';

@Module({
  imports: [BullModule.registerQueue({ name: contentIntelligenceQueueName })],
  providers: [
    {
      provide: CONTENT_INTELLIGENCE_PROVIDER,
      useFactory: (): ContentIntelligenceProvider => {
        const environment = parseContentIntelligenceEnvironment(process.env);
        if (environment.CONTENT_INTELLIGENCE_PROVIDER === 'anthropic') {
          return new AnthropicContentIntelligenceProvider({
            // The environment schema guarantees the selected provider's key.
            apiKey: environment.ANTHROPIC_API_KEY ?? '',
            model:
              environment.CONTENT_INTELLIGENCE_MODEL ?? defaultAnthropicModel,
            timeoutMs: environment.CONTENT_INTELLIGENCE_TIMEOUT_MS,
          });
        }
        if (environment.CONTENT_INTELLIGENCE_PROVIDER === 'gemini') {
          return new GeminiContentIntelligenceProvider({
            // The environment schema guarantees the selected provider's key.
            apiKey: environment.GEMINI_API_KEY ?? '',
            model: environment.CONTENT_INTELLIGENCE_MODEL ?? defaultGeminiModel,
            timeoutMs: environment.CONTENT_INTELLIGENCE_TIMEOUT_MS,
          });
        }
        return new OpenAIContentIntelligenceProvider({
          apiKey: environment.OPENAI_API_KEY ?? '',
          model: environment.CONTENT_INTELLIGENCE_MODEL ?? defaultOpenAIModel,
          timeoutMs: environment.CONTENT_INTELLIGENCE_TIMEOUT_MS,
        });
      },
    },
    {
      provide: CONTENT_INTELLIGENCE_SETTINGS,
      useFactory: (): ContentIntelligenceSettings => {
        const environment = parseContentIntelligenceEnvironment(process.env);
        const jobs = parseContentIntelligenceJobEnvironment(process.env);
        return {
          attempts: jobs.CONTENT_INTELLIGENCE_ATTEMPTS,
          maxTranscriptCharacters:
            environment.CONTENT_INTELLIGENCE_MAX_TRANSCRIPT_CHARACTERS,
          promptId: contentIntelligencePrompt.id,
          promptVersion: contentIntelligencePrompt.version,
          systemPrompt: contentIntelligencePrompt.template,
          provider: environment.CONTENT_INTELLIGENCE_PROVIDER,
          model:
            environment.CONTENT_INTELLIGENCE_MODEL ??
            (environment.CONTENT_INTELLIGENCE_PROVIDER === 'anthropic'
              ? defaultAnthropicModel
              : environment.CONTENT_INTELLIGENCE_PROVIDER === 'gemini'
                ? defaultGeminiModel
                : defaultOpenAIModel),
        };
      },
    },
    ContentIntelligenceProcessor,
  ],
})
export class ContentIntelligenceModule {}
