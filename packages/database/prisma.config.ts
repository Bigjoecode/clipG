import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  ...(process.env.DATABASE_URL === undefined
    ? {}
    : {
        datasource: {
          url: process.env.DATABASE_URL,
        },
      }),
});
