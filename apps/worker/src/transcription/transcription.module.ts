import {
  parseMediaProcessingEnvironment,
  parseTranscriptionEnvironment,
  parseTranscriptionJobEnvironment,
} from '@clipgenius/config';
import {
  DeepgramTranscriptionProvider,
  OpenAITranscriptionProvider,
  type TranscriptionProvider,
} from '@clipgenius/ai';
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

/**
 * Per-provider model defaults. Both diarize, which Task 008 depends on; override
 * with TRANSCRIPTION_MODEL only for a model that also returns speaker labels.
 */
const defaultDeepgramModel = 'nova-2';
const defaultOpenAIModel = 'gpt-4o-transcribe-diarize';

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
      useFactory: (): TranscriptionProvider => {
        const environment = parseTranscriptionEnvironment(process.env);
        if (environment.TRANSCRIPTION_PROVIDER === 'openai') {
          return new OpenAITranscriptionProvider({
            // The environment schema guarantees the selected provider's key.
            apiKey: environment.OPENAI_API_KEY ?? '',
            model: environment.TRANSCRIPTION_MODEL ?? defaultOpenAIModel,
            timeoutMs: environment.TRANSCRIPTION_TIMEOUT_MS,
          });
        }
        return new DeepgramTranscriptionProvider({
          apiKey: environment.DEEPGRAM_API_KEY ?? '',
          model: environment.TRANSCRIPTION_MODEL ?? defaultDeepgramModel,
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
          provider: transcription.TRANSCRIPTION_PROVIDER,
          model:
            transcription.TRANSCRIPTION_MODEL ??
            (transcription.TRANSCRIPTION_PROVIDER === 'deepgram'
              ? defaultDeepgramModel
              : defaultOpenAIModel),
        };
      },
    },
    TranscriptionProcessor,
  ],
})
export class TranscriptionModule {}
