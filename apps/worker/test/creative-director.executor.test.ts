import {
  CreativeDirectorProviderError,
  emptyAiUsage,
  type CreativeDirector,
  type CreativeDirectorInput,
  type CreativeDirectorOutput,
} from '@clipgenius/ai';
import type { PrismaClient } from '@clipgenius/database';
import { describe, expect, it, vi } from 'vitest';

import { CreativeDirectorExecutor } from '../src/creative-director/creative-director.executor.js';

const context = {
  attempt: 1,
  mediaAssetId: '11111111-1111-4111-8111-111111111111',
  mediaJobId: '22222222-2222-4222-8222-222222222222',
  model: 'gemini-3.6-flash',
  organizationId: '33333333-3333-4333-8333-333333333333',
  projectId: '44444444-4444-4444-8444-444444444444',
  provider: 'gemini',
};

function database() {
  return {
    aiRun: { create: vi.fn().mockResolvedValue({}) },
  };
}

describe('CreativeDirectorExecutor', () => {
  it('records one successful provider attempt in the existing ledger', async () => {
    const db = database();
    const output = {
      model: 'gemini-3.6-flash',
      provider: 'gemini',
      usage: {
        ...emptyAiUsage(44, 'provider-request'),
        inputTokens: 100,
        outputTokens: 40,
      },
      validationStatus: 'VALID',
    } as CreativeDirectorOutput;
    const director = {
      direct: vi.fn().mockResolvedValue(output),
    } as unknown as CreativeDirector;
    const executor = new CreativeDirectorExecutor(
      db as unknown as PrismaClient,
      director,
    );

    await expect(
      executor.execute({} as CreativeDirectorInput, context),
    ).resolves.toBe(output);
    const written = db.aiRun.create.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(written.data).toMatchObject({
      attempt: 1,
      mediaJobId: context.mediaJobId,
      operation: 'CREATIVE_DIRECTOR',
      providerRequestId: 'provider-request',
      status: 'SUCCEEDED',
    });
  });

  it('records categorized provider failure without storing the response or prompt', async () => {
    const db = database();
    const error = new CreativeDirectorProviderError(
      'rate limited',
      true,
      'RATE_LIMIT',
      emptyAiUsage(20, 'failed-request'),
    );
    const director = {
      direct: vi.fn().mockRejectedValue(error),
    } as unknown as CreativeDirector;
    const executor = new CreativeDirectorExecutor(
      db as unknown as PrismaClient,
      director,
    );

    await expect(
      executor.execute({} as CreativeDirectorInput, context),
    ).rejects.toBe(error);
    const written = db.aiRun.create.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(written.data).toMatchObject({
      errorCategory: 'RATE_LIMIT',
      operation: 'CREATIVE_DIRECTOR',
      providerRequestId: 'failed-request',
      status: 'FAILED',
    });
    expect(written.data).not.toHaveProperty('prompt');
    expect(written.data).not.toHaveProperty('response');
  });
});
