import { z } from 'zod';

const url = z.string().url();
const postgresUrl = url.refine(
  (value) => {
    const protocol = new URL(value).protocol;
    return protocol === 'postgres:' || protocol === 'postgresql:';
  },
  { message: 'DATABASE_URL must use the postgres or postgresql protocol.' },
);

export const apiEnvironmentSchema = z.object({
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
});

export const workerEnvironmentSchema = z.object({
  REDIS_URL: url.default('redis://localhost:6379'),
});

export const webEnvironmentSchema = z.object({
  API_URL: url.default('http://localhost:4000'),
  NEXT_PUBLIC_APP_URL: url.default('http://localhost:3000'),
});

export const databaseEnvironmentSchema = z.object({
  DATABASE_URL: postgresUrl,
});

export type ApiEnvironment = z.infer<typeof apiEnvironmentSchema>;
export type DatabaseEnvironment = z.infer<typeof databaseEnvironmentSchema>;
export type WebEnvironment = z.infer<typeof webEnvironmentSchema>;
export type WorkerEnvironment = z.infer<typeof workerEnvironmentSchema>;

export function parseApiEnvironment(
  source: Record<string, string | undefined>,
): ApiEnvironment {
  return apiEnvironmentSchema.parse(source);
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
