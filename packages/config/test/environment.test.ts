import { describe, expect, it } from 'vitest';

import {
  parseApiEnvironment,
  parseWorkerEnvironment,
  redisConnectionOptionsFromUrl,
} from '../src/index.js';

describe('environment validation', () => {
  it('provides safe local defaults for application boot', () => {
    expect(parseApiEnvironment({})).toEqual({ API_PORT: 4000 });
    expect(parseWorkerEnvironment({})).toEqual({
      REDIS_URL: 'redis://localhost:6379',
    });
  });

  it('rejects invalid ports and Redis URLs', () => {
    expect(() => parseApiEnvironment({ API_PORT: '70000' })).toThrow();
    expect(() => parseWorkerEnvironment({ REDIS_URL: 'not-a-url' })).toThrow();
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
