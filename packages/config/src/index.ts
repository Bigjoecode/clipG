import { z } from 'zod';

const url = z.string().url();
const httpUrl = url.refine(
  (value) => ['http:', 'https:'].includes(new URL(value).protocol),
  { message: 'URL must use the http or https protocol.' },
);
const postgresUrl = url.refine(
  (value) => {
    const protocol = new URL(value).protocol;
    return protocol === 'postgres:' || protocol === 'postgresql:';
  },
  { message: 'DATABASE_URL must use the postgres or postgresql protocol.' },
);

export const apiEnvironmentSchema = z.object({
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  WEB_ORIGIN: httpUrl.default('http://localhost:3000'),
});

export const authEnvironmentSchema = z.object({
  SUPABASE_PUBLISHABLE_KEY: z.string().trim().min(20),
  SUPABASE_URL: httpUrl,
});

export const workerEnvironmentSchema = z.object({
  REDIS_URL: url.default('redis://localhost:6379'),
});

export const storageEnvironmentSchema = z.object({
  SOURCE_VIDEO_BUCKET: z
    .literal('clipgenius-source-media')
    .default('clipgenius-source-media'),
  SOURCE_VIDEO_MAX_BYTES: z.coerce
    .number()
    .int()
    .min(1)
    .max(50 * 1024 * 1024 * 1024)
    .default(50 * 1024 * 1024),
});

/**
 * Non-secret media job settings. Keeping them separate from the worker-only
 * credentials means neither the API producer nor an imported processor class
 * needs the Supabase secret key merely to describe how jobs are scheduled.
 */
export const mediaProbeEnvironmentSchema = z.object({
  MEDIA_PROBE_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
  MEDIA_PROBE_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(2),
});

export const transcriptionJobEnvironmentSchema = z.object({
  TRANSCRIPTION_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
  TRANSCRIPTION_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(1),
});

export const contentIntelligenceJobEnvironmentSchema = z.object({
  CONTENT_INTELLIGENCE_ATTEMPTS: z.coerce
    .number()
    .int()
    .min(1)
    .max(10)
    .default(3),
  CONTENT_INTELLIGENCE_CONCURRENCY: z.coerce
    .number()
    .int()
    .min(1)
    .max(8)
    .default(1),
});

export const contentIntelligenceEnvironmentSchema =
  contentIntelligenceJobEnvironmentSchema
    .extend({
      CONTENT_INTELLIGENCE_MAX_TRANSCRIPT_CHARACTERS: z.coerce
        .number()
        .int()
        .min(1_000)
        .max(1_000_000)
        .default(200_000),
      // Left without a default so each provider can apply its own; a shared
      // default would silently send one provider's model name to another.
      CONTENT_INTELLIGENCE_MODEL: z.string().trim().min(1).optional(),
      ANTHROPIC_API_KEY: z.string().trim().min(20).optional(),
      CONTENT_INTELLIGENCE_PROVIDER: z
        .enum(['openai', 'anthropic', 'gemini'])
        .default('gemini'),
      CONTENT_INTELLIGENCE_TIMEOUT_MS: z.coerce
        .number()
        .int()
        .min(1_000)
        .max(1_800_000)
        .default(300_000),
      GEMINI_API_KEY: z.string().trim().min(20).optional(),
      OPENAI_API_KEY: z.string().trim().min(20).optional(),
    })
    // Both keys are individually optional so a deployment carries only the
    // credential it uses, but the selected provider must have its own.
    .superRefine((environment, context) => {
      const required = (
        {
          anthropic: 'ANTHROPIC_API_KEY',
          gemini: 'GEMINI_API_KEY',
          openai: 'OPENAI_API_KEY',
        } as const
      )[environment.CONTENT_INTELLIGENCE_PROVIDER];
      if (environment[required] === undefined) {
        context.addIssue({
          code: 'custom',
          message: `${required} is required when CONTENT_INTELLIGENCE_PROVIDER is "${environment.CONTENT_INTELLIGENCE_PROVIDER}".`,
          path: [required],
        });
      }
    });

/**
 * Server-only configuration for the background worker. The Supabase secret key
 * bypasses Storage row-level security, so it must never reach the browser: the
 * schema rejects a publishable key pasted here by mistake.
 */
export const mediaProcessingEnvironmentSchema =
  mediaProbeEnvironmentSchema.extend({
    MEDIA_PROBE_MAX_BYTES: z.coerce
      .number()
      .int()
      .min(1)
      .max(50 * 1024 * 1024 * 1024)
      .default(50 * 1024 * 1024),
    MEDIA_PROBE_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(600_000)
      .default(120_000),
    UPLOAD_PENDING_MAX_AGE_HOURS: z.coerce
      .number()
      .int()
      .min(1)
      .max(168)
      .default(24),
    SUPABASE_SECRET_KEY: z
      .string()
      .trim()
      .min(20)
      .refine((value) => !value.startsWith('sb_publishable_'), {
        message:
          'SUPABASE_SECRET_KEY must be a Supabase secret key, not a publishable key.',
      }),
  });

export const transcriptionEnvironmentSchema = transcriptionJobEnvironmentSchema
  .extend({
    AUDIO_EXTRACTION_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(1_800_000)
      .default(300_000),
    DEEPGRAM_API_KEY: z.string().trim().min(20).optional(),
    OPENAI_API_KEY: z.string().trim().min(20).optional(),
    TRANSCRIPTION_PROVIDER: z.enum(['deepgram', 'openai']).default('deepgram'),
    TRANSCRIPTION_MAX_AUDIO_BYTES: z.coerce
      .number()
      .int()
      .min(1)
      .max(100 * 1024 * 1024)
      .default(25 * 1024 * 1024),
    // Left without a default so each provider can apply its own; a shared
    // default would silently send an OpenAI model name to Deepgram.
    TRANSCRIPTION_MODEL: z.string().trim().min(1).optional(),
    TRANSCRIPTION_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(1_800_000)
      .default(600_000),
  })
  // Both keys are individually optional so a deployment only carries the
  // credential it actually uses, but the selected provider must have its own.
  .superRefine((environment, context) => {
    const required =
      environment.TRANSCRIPTION_PROVIDER === 'deepgram'
        ? 'DEEPGRAM_API_KEY'
        : 'OPENAI_API_KEY';
    if (environment[required] === undefined) {
      context.addIssue({
        code: 'custom',
        message: `${required} is required when TRANSCRIPTION_PROVIDER is "${environment.TRANSCRIPTION_PROVIDER}".`,
        path: [required],
      });
    }
  });

export const webEnvironmentSchema = z.object({
  API_URL: url.default('http://localhost:4000'),
  NEXT_PUBLIC_APP_URL: url.default('http://localhost:3000'),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().trim().min(20),
  NEXT_PUBLIC_SUPABASE_URL: httpUrl,
});

export const databaseEnvironmentSchema = z.object({
  DATABASE_URL: postgresUrl,
});

export type ApiEnvironment = z.infer<typeof apiEnvironmentSchema>;
export type AuthEnvironment = z.infer<typeof authEnvironmentSchema>;
export type DatabaseEnvironment = z.infer<typeof databaseEnvironmentSchema>;
export type WebEnvironment = z.infer<typeof webEnvironmentSchema>;
export type WorkerEnvironment = z.infer<typeof workerEnvironmentSchema>;
export type StorageEnvironment = z.infer<typeof storageEnvironmentSchema>;
export type MediaProbeEnvironment = z.infer<typeof mediaProbeEnvironmentSchema>;
export type MediaProcessingEnvironment = z.infer<
  typeof mediaProcessingEnvironmentSchema
>;
export type TranscriptionJobEnvironment = z.infer<
  typeof transcriptionJobEnvironmentSchema
>;
export type TranscriptionEnvironment = z.infer<
  typeof transcriptionEnvironmentSchema
>;
export type ContentIntelligenceJobEnvironment = z.infer<
  typeof contentIntelligenceJobEnvironmentSchema
>;
export type ContentIntelligenceEnvironment = z.infer<
  typeof contentIntelligenceEnvironmentSchema
>;

export function parseApiEnvironment(
  source: Record<string, string | undefined>,
): ApiEnvironment {
  return apiEnvironmentSchema.parse(source);
}

export function parseAuthEnvironment(
  source: Record<string, string | undefined>,
): AuthEnvironment {
  return authEnvironmentSchema.parse(source);
}

export function parseDatabaseEnvironment(
  source: Record<string, string | undefined>,
): DatabaseEnvironment {
  return databaseEnvironmentSchema.parse(source);
}

export function parseWebEnvironment(
  source: Record<string, string | undefined>,
): WebEnvironment {
  return webEnvironmentSchema.parse(source);
}

export function parseWorkerEnvironment(
  source: Record<string, string | undefined>,
): WorkerEnvironment {
  return workerEnvironmentSchema.parse(source);
}

export function parseStorageEnvironment(
  source: Record<string, string | undefined>,
): StorageEnvironment {
  return storageEnvironmentSchema.parse(source);
}

export function parseMediaProbeEnvironment(
  source: Record<string, string | undefined>,
): MediaProbeEnvironment {
  return mediaProbeEnvironmentSchema.parse(source);
}

export function parseMediaProcessingEnvironment(
  source: Record<string, string | undefined>,
): MediaProcessingEnvironment {
  return mediaProcessingEnvironmentSchema.parse(source);
}

export function parseTranscriptionJobEnvironment(
  source: Record<string, string | undefined>,
): TranscriptionJobEnvironment {
  return transcriptionJobEnvironmentSchema.parse(source);
}

export function parseTranscriptionEnvironment(
  source: Record<string, string | undefined>,
): TranscriptionEnvironment {
  return transcriptionEnvironmentSchema.parse(source);
}

export function parseContentIntelligenceJobEnvironment(
  source: Record<string, string | undefined>,
): ContentIntelligenceJobEnvironment {
  return contentIntelligenceJobEnvironmentSchema.parse(source);
}

export function parseContentIntelligenceEnvironment(
  source: Record<string, string | undefined>,
): ContentIntelligenceEnvironment {
  return contentIntelligenceEnvironmentSchema.parse(source);
}

export interface RedisConnectionOptions {
  readonly host: string;
  readonly port: number;
  readonly username?: string;
  readonly password?: string;
  readonly tls?: Record<string, never>;
}

export function redisConnectionOptionsFromUrl(
  connectionUrl: string,
): RedisConnectionOptions {
  const urlValue = new URL(connectionUrl);

  if (urlValue.protocol !== 'redis:' && urlValue.protocol !== 'rediss:') {
    throw new Error('REDIS_URL must use the redis or rediss protocol.');
  }

  return {
    host: urlValue.hostname,
    port: urlValue.port === '' ? 6379 : Number.parseInt(urlValue.port, 10),
    ...(urlValue.username === ''
      ? {}
      : { username: decodeURIComponent(urlValue.username) }),
    ...(urlValue.password === ''
      ? {}
      : { password: decodeURIComponent(urlValue.password) }),
    ...(urlValue.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}
