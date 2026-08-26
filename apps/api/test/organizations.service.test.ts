import type { PrismaClient } from '@clipgenius/database';
import { describe, expect, it, vi } from 'vitest';

import { OrganizationsService } from '../src/organizations/organizations.service.js';

describe('OrganizationsService', () => {
  it('creates an organization and its owner membership in one transaction', async () => {
    const organization = {
      createdAt: new Date('2026-08-26T12:00:00.000Z'),
      id: '5ea74442-0c18-4e90-a009-300fa2f39cbd',
      name: 'Creator Studio',
      slug: 'creator-studio',
      updatedAt: new Date('2026-08-26T12:00:00.000Z'),
    };
    const createOrganization = vi.fn(() => Promise.resolve(organization));
    const createMembership = vi.fn(
      (input: { readonly data: { readonly role: string } }) =>
        Promise.resolve({
          organization,
          role: input.data.role as 'OWNER',
        }),
    );
    const transactionClient = {
      organization: { create: createOrganization },
      organizationMembership: { create: createMembership },
    };
    const runTransaction = vi.fn(
      (operation: (transaction: typeof transactionClient) => unknown) =>
        Promise.resolve(operation(transactionClient)),
    );
    const service = new OrganizationsService({
      $transaction: runTransaction,
    } as unknown as PrismaClient);

    await expect(
      service.create(
        {
          avatarUrl: null,
          displayName: null,
          email: 'owner@example.com',
          id: 'ff2b9fef-ec23-48f2-a7bd-8e9c75edbb44',
        },
        { name: 'Creator Studio' },
      ),
    ).resolves.toEqual({
      ...organization,
      createdAt: '2026-08-26T12:00:00.000Z',
      role: 'OWNER',
      updatedAt: '2026-08-26T12:00:00.000Z',
    });
    expect(runTransaction).toHaveBeenCalledOnce();
    expect(createMembership).toHaveBeenCalledOnce();
    expect(createMembership.mock.calls[0]?.[0].data.role).toBe('OWNER');
  });
});
