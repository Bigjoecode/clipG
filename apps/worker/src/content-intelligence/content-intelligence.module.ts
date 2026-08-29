import {
  parseContentIntelligenceEnvironment,
  parseContentIntelligenceJobEnvironment,
} from '@clipgenius/config';
import {
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

@Module({
  imports: [BullModule.registerQueue({ name: contentIntelligenceQueueName })],
  providers: [
    {
      provide: CONTENT_INTELLIGENCE_PROVIDER,
      useFactory: (): ContentIntelligenceProvider => {
        const environment = parseContentIntelligenceEnvironment(process.env);
        return new OpenAIContentIntelligenceProvider({
          apiKey: environment.OPENAI_API_KEY,
          model: environment.CONTENT_INTELLIGENCE_MODEL,
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
        };
      },
    },
    ContentIntelligenceProcessor,
  ],
})
export class ContentIntelligenceModule {}
