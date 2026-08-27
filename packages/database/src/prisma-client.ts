import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../generated/client/client.js';

export interface CreateDatabaseClientOptions {
  readonly connectionString: string;
  readonly connectionTimeoutMillis?: number;
  readonly maxConnections?: number;
}

export function createDatabaseClient({
  connectionString,
  connectionTimeoutMillis = 15_000,
  maxConnections = 10,
}: CreateDatabaseClientOptions): PrismaClient {
  const adapter = new PrismaPg({
    connectionString,
    connectionTimeoutMillis,
    idleTimeoutMillis: 30_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    max: maxConnections,
  });

  return new PrismaClient({ adapter });
}
