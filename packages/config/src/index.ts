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
