import { describe, expect, it } from 'vitest';

import {
  parseApiEnvironment,
  parseAuthEnvironment,
  parseDatabaseEnvironment,
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
});
