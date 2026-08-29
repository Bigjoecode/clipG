import { describe, expect, it } from 'vitest';

import {
  parseApiEnvironment,
  parseAuthEnvironment,
  parseContentIntelligenceEnvironment,
  parseContentIntelligenceJobEnvironment,
  parseDatabaseEnvironment,
  parseStorageEnvironment,
  parseTranscriptionEnvironment,
  parseTranscriptionJobEnvironment,
  parseWebEnvironment,
  parseWorkerEnvironment,
  redisConnectionOptionsFromUrl,
} from '../src/index.js';

describe('environment validation', () => {
  it('provides safe local defaults for application boot', () => {
    expect(parseApiEnvironment({})).toEqual({
      API_PORT: 4000,
      WEB_ORIGIN: 'http://localhost:3000',
    });
    expect(parseWorkerEnvironment({})).toEqual({
      REDIS_URL: 'redis://localhost:6379',
    });
  });

  it('requires Supabase public credentials for active auth clients', () => {
    expect(() => parseAuthEnvironment({})).toThrow();
    expect(() => parseWebEnvironment({})).toThrow();

    expect(
      parseAuthEnvironment({
        SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key',
        SUPABASE_URL: 'https://project.supabase.co',
      }),
    ).toEqual({
      SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key',
      SUPABASE_URL: 'https://project.supabase.co',
    });
  });

  it('rejects invalid ports and Redis URLs', () => {
    expect(() => parseApiEnvironment({ API_PORT: '70000' })).toThrow();
    expect(() => parseWorkerEnvironment({ REDIS_URL: 'not-a-url' })).toThrow();
  });

  it('requires a PostgreSQL connection string for database operations', () => {
    expect(() => parseDatabaseEnvironment({})).toThrow();
    expect(() =>
      parseDatabaseEnvironment({ DATABASE_URL: 'mysql://localhost/app' }),
    ).toThrow();
    expect(
      parseDatabaseEnvironment({
        DATABASE_URL:
          'postgresql://clipgenius:clipgenius@localhost:5432/clipgenius',
      }),
    ).toEqual({
      DATABASE_URL:
        'postgresql://clipgenius:clipgenius@localhost:5432/clipgenius',
    });
  });

  it('turns a secure Redis URL into connection options', () => {
    expect(
      redisConnectionOptionsFromUrl('rediss://worker:secret@redis.test:6380'),
    ).toEqual({
      host: 'redis.test',
      password: 'secret',
      port: 6380,
      tls: {},
      username: 'worker',
    });
  });

  it('uses a bounded source-video upload configuration', () => {
    expect(parseStorageEnvironment({})).toEqual({
      SOURCE_VIDEO_BUCKET: 'clipgenius-source-media',
      SOURCE_VIDEO_MAX_BYTES: 50 * 1024 * 1024,
    });
    expect(() =>
      parseStorageEnvironment({ SOURCE_VIDEO_MAX_BYTES: '0' }),
    ).toThrow();
  });

  it('validates worker-only transcription configuration', () => {
    expect(
      parseTranscriptionEnvironment({
        DEEPGRAM_API_KEY: 'dg-test-transcription-key',
      }),
    ).toMatchObject({
      TRANSCRIPTION_MAX_AUDIO_BYTES: 25 * 1024 * 1024,
      TRANSCRIPTION_PROVIDER: 'deepgram',
    });
    expect(parseTranscriptionJobEnvironment({})).toEqual({
      TRANSCRIPTION_ATTEMPTS: 3,
      TRANSCRIPTION_CONCURRENCY: 1,
    });
    expect(() => parseTranscriptionEnvironment({})).toThrow();
  });

  it('requires the key belonging to the selected transcription provider', () => {
    expect(() =>
      parseTranscriptionEnvironment({
        OPENAI_API_KEY: 'sk-test-transcription-key',
      }),
    ).toThrow(/DEEPGRAM_API_KEY is required/);
    expect(() =>
      parseTranscriptionEnvironment({
        DEEPGRAM_API_KEY: 'dg-test-transcription-key',
        TRANSCRIPTION_PROVIDER: 'openai',
      }),
    ).toThrow(/OPENAI_API_KEY is required/);
    expect(
      parseTranscriptionEnvironment({
        OPENAI_API_KEY: 'sk-test-transcription-key',
        TRANSCRIPTION_PROVIDER: 'openai',
      }),
    ).toMatchObject({ TRANSCRIPTION_PROVIDER: 'openai' });
  });

  it('leaves the transcription model unset so each provider defaults its own', () => {
    expect(
      parseTranscriptionEnvironment({
        DEEPGRAM_API_KEY: 'dg-test-transcription-key',
      }).TRANSCRIPTION_MODEL,
    ).toBeUndefined();
  });

  it('requires a server-only OpenAI key for bounded content intelligence', () => {
    expect(() => parseContentIntelligenceEnvironment({})).toThrow();
    expect(
      parseContentIntelligenceEnvironment({
        OPENAI_API_KEY: 'sk-test-content-intelligence-key',
      }),
    ).toMatchObject({
      CONTENT_INTELLIGENCE_MAX_TRANSCRIPT_CHARACTERS: 200_000,
      CONTENT_INTELLIGENCE_MODEL: 'gpt-5.6-terra',
      CONTENT_INTELLIGENCE_TIMEOUT_MS: 300_000,
    });
    expect(parseContentIntelligenceJobEnvironment({})).toEqual({
      CONTENT_INTELLIGENCE_ATTEMPTS: 3,
      CONTENT_INTELLIGENCE_CONCURRENCY: 1,
    });
  });
});
