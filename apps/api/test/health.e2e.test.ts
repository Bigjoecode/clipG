import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { AUTHENTICATION_PROVIDER } from '../src/auth/authentication-provider.js';
import { DATABASE_CLIENT } from '../src/database/database.module.js';
import { DIRECT_UPLOAD_STORAGE } from '../src/storage/storage.module.js';

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
      .overrideProvider(DIRECT_UPLOAD_STORAGE)
      .useValue({})
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

describe('GET /organizations', () => {
  it('resolves explicit guard and controller dependencies in development', async () => {
    const authenticatedUser = {
      avatarUrl: null,
      displayName: null,
      email: 'owner@example.com',
      id: 'ff2b9fef-ec23-48f2-a7bd-8e9c75edbb44',
    };
    const verifyAccessToken = vi.fn(() =>
      Promise.resolve({
        email: authenticatedUser.email,
        subject: authenticatedUser.id,
      }),
    );
    const upsertUser = vi.fn(() => Promise.resolve(authenticatedUser));
    const listMemberships = vi.fn(() => Promise.resolve([]));
    const moduleReference = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DATABASE_CLIENT)
      .useValue({
        $disconnect: () => Promise.resolve(),
        organizationMembership: { findMany: listMemberships },
        user: { upsert: upsertUser },
      })
      .overrideProvider(AUTHENTICATION_PROVIDER)
      .useValue({ verifyAccessToken })
      .overrideProvider(DIRECT_UPLOAD_STORAGE)
      .useValue({})
      .compile();

    application = moduleReference.createNestApplication();
    await application.init();

    await request(application.getHttpServer() as Server)
      .get('/organizations')
      .set('Authorization', 'Bearer test-access-token')
      .expect(200)
      .expect([]);

    expect(verifyAccessToken).toHaveBeenCalledWith('test-access-token');
    expect(upsertUser).toHaveBeenCalledOnce();
    expect(listMemberships).toHaveBeenCalledOnce();
  });
});
