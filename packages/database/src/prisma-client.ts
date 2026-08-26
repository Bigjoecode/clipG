import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../generated/client/client.js';

export interface CreateDatabaseClientOptions {
  readonly connectionString: string;
  readonly connectionTimeoutMillis?: number;
  readonly maxConnections?: number;
}

export function createDatabaseClient({
  connectionString,
  connectionTimeoutMillis = 5_000,
  maxConnections = 10,
}: CreateDatabaseClientOptions): PrismaClient {
  const adapter = new PrismaPg({
    connectionString,
    connectionTimeoutMillis,
    max: maxConnections,
  });

  return new PrismaClient({ adapter });
}
