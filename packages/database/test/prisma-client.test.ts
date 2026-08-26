import { organizationRoles } from '@clipgenius/types';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createDatabaseClient,
  OrganizationRole as PrismaOrganizationRole,
} from '../src/index.js';

import type { PrismaClient } from '../src/index.js';

let client: PrismaClient | undefined;

afterEach(async () => {
  await client?.$disconnect();
  client = undefined;
});

describe('database client', () => {
  it('constructs a PostgreSQL-backed Prisma client without connecting eagerly', () => {
    client = createDatabaseClient({
      connectionString:
        'postgresql://clipgenius:clipgenius@localhost:5432/clipgenius',
    });

    expect(client).toBeDefined();
  });

  it('keeps shared organization roles aligned with the generated schema', () => {
    expect(Object.values(PrismaOrganizationRole)).toEqual(organizationRoles);
  });
});
