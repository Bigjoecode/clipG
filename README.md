# ClipGenius

ClipGenius is an AI Content Production Engine that turns one raw video into polished, platform-optimized content.

This repository currently contains the Task 001 engineering foundation only. Product features such as upload, transcription, AI editing, rendering, billing, and publishing are intentionally not implemented yet.

## Prerequisites

- Node.js 24 or newer
- Corepack
- Docker Desktop with Docker Compose (for PostgreSQL and Redis)

## Local setup

```bash
corepack enable
pnpm install
copy .env.example .env
pnpm services:up
pnpm dev
```

On macOS or Linux, use `cp .env.example .env` instead of `copy`.

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

After copying `.env.example` to `.env` and starting PostgreSQL:

```bash
pnpm db:validate
pnpm db:generate
pnpm db:migrate
```

Use `pnpm db:migrate:deploy` to apply committed migrations in staging or
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
