# ClipGenius

ClipGenius is an AI Content Production Engine that turns one raw video into polished, platform-optimized content.

The repository currently includes the engineering foundation, PostgreSQL domain
model, Supabase authentication and organizations, projects, secure source-video
uploads, and background media analysis. Transcription, AI editing, rendering,
billing, and publishing are not yet implemented.

## Prerequisites

- Node.js 24 or newer
- Corepack
- A Supabase project for the current hosted PostgreSQL, authentication, and Storage workflow
- Docker Desktop with Docker Compose only when using local PostgreSQL and Redis

## Local setup

```powershell
corepack enable
corepack pnpm install
copy .env.example .env
corepack pnpm db:migrate:deploy
corepack pnpm dev
```

Set the Supabase URL, publishable keys, and PostgreSQL connection string in `.env`
before applying migrations. On macOS or Linux, use `cp .env.example .env` instead
of `copy`. Docker is not required when using hosted Supabase.

For source-video uploads, run
[`infrastructure/supabase/source-media.sql`](infrastructure/supabase/source-media.sql)
once in the Supabase SQL Editor after the database migrations. It provisions the
private Storage bucket and its row-level security policies. The optional
`SOURCE_VIDEO_*` variables have safe defaults documented in `.env.example`.

Background media analysis needs Redis and a server-only Supabase secret key. Set
`REDIS_URL` to a plain Redis TCP endpoint (BullMQ speaks the Redis protocol, so an
HTTP REST proxy will not work) and `SUPABASE_SECRET_KEY` to the project's secret
key. That key bypasses Storage row-level security: keep it out of the browser and
out of any `NEXT_PUBLIC_` variable. FFmpeg does not need to be installed — the
worker uses the platform ffprobe binary bundled with `@clipgenius/video`. See
[media processing architecture](docs/architecture/media-processing.md).

To use local PostgreSQL and Redis instead, start Docker Desktop and run
`corepack pnpm services:up` before applying migrations. Supabase Auth and Storage
are still required for the currently implemented authentication and upload flow.

The services start at:

- Web: http://localhost:3000
- API: http://localhost:4000
- API health: http://localhost:4000/health

## Validation

```bash
pnpm db:generate
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Run all code-quality checks with `pnpm validate`.

The default scripts use pnpm's portable topological workspace runner. Equivalent
Turborepo entry points are available as `pnpm build:turbo`, `pnpm dev:turbo`,
`pnpm lint:turbo`, `pnpm test:turbo`, and `pnpm typecheck:turbo` for development
and CI environments that support Turborepo's native executable.

## Database workflow

After configuring `.env` and making PostgreSQL available:

```bash
corepack pnpm db:validate
corepack pnpm db:generate
corepack pnpm db:migrate
```

Use `corepack pnpm db:migrate:deploy` to apply committed migrations in staging or
production. The current identity and tenancy model is documented in
[`docs/architecture/domain-model.md`](docs/architecture/domain-model.md).

## Workspace

```text
apps/            Deployable web, API, and worker applications
packages/        Shared domain and infrastructure boundaries
docs/            Product, AI, and system architecture documentation
infrastructure/  Local development infrastructure
```

See [the architecture overview](docs/architecture/overview.md) and [product vision](docs/product/vision.md) for the intended evolution of the system.
