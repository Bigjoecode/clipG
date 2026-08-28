import {
  parseMediaProcessingEnvironment,
  parseTranscriptionEnvironment,
  parseTranscriptionJobEnvironment,
} from '@clipgenius/config';
import { OpenAITranscriptionProvider } from '@clipgenius/ai';
import { transcriptionQueueName } from '@clipgenius/types';
import { FfmpegAudioExtractor } from '@clipgenius/video';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import {
  AUDIO_EXTRACTOR,
  TRANSCRIPTION_PROVIDER,
  TRANSCRIPTION_SETTINGS,
  TranscriptionProcessor,
  type TranscriptionSettings,
} from './transcription.processor.js';

const signedUrlLifetimeSeconds = 60 * 60;

@Module({
  imports: [BullModule.registerQueue({ name: transcriptionQueueName })],
  providers: [
    {
      provide: AUDIO_EXTRACTOR,
      useFactory: (): FfmpegAudioExtractor => {
        const environment = parseTranscriptionEnvironment(process.env);
        return new FfmpegAudioExtractor({
          timeoutMs: environment.AUDIO_EXTRACTION_TIMEOUT_MS,
        });
      },
    },
    {
      provide: TRANSCRIPTION_PROVIDER,
      useFactory: (): OpenAITranscriptionProvider => {
        const environment = parseTranscriptionEnvironment(process.env);
        return new OpenAITranscriptionProvider({
          apiKey: environment.OPENAI_API_KEY,
          model: environment.TRANSCRIPTION_MODEL,
          timeoutMs: environment.TRANSCRIPTION_TIMEOUT_MS,
        });
      },
    },
    {
      provide: TRANSCRIPTION_SETTINGS,
      useFactory: (): TranscriptionSettings => {
        const transcription = parseTranscriptionEnvironment(process.env);
        const jobs = parseTranscriptionJobEnvironment(process.env);
        const media = parseMediaProcessingEnvironment(process.env);
        return {
          attempts: jobs.TRANSCRIPTION_ATTEMPTS,
          maxAudioBytes: transcription.TRANSCRIPTION_MAX_AUDIO_BYTES,
          maxSourceBytes: media.MEDIA_PROBE_MAX_BYTES,
          signedUrlLifetimeSeconds,
        };
      },
    },
    TranscriptionProcessor,
  ],
})
export class TranscriptionModule {}
