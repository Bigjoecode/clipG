import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, describe, it } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { AUTHENTICATION_PROVIDER } from '../src/auth/authentication-provider.js';
import { DATABASE_CLIENT } from '../src/database/database.module.js';

import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';

let application: INestApplication | undefined;

afterEach(async () => {
  await application?.close();
  application = undefined;
});

describe('GET /health', () => {
  it('reports the API service as healthy', async () => {
    const moduleReference = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DATABASE_CLIENT)
      .useValue({ $disconnect: () => Promise.resolve() })
      .overrideProvider(AUTHENTICATION_PROVIDER)
      .useValue({
        verifyAccessToken: () =>
          Promise.reject(new Error('Not used by the health endpoint.')),
      })
      .compile();

    application = moduleReference.createNestApplication();
    await application.init();

    await request(application.getHttpServer() as Server)
      .get('/health')
      .expect(200)
      .expect({
        service: 'clipgenius-api',
        status: 'ok',
      });
  });
});
