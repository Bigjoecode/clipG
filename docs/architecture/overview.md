# System Architecture

## Purpose

ClipGenius is structured as a TypeScript monorepo whose user interface, request/coordination API, and asynchronous processing workers can evolve and deploy independently. Task 001 establishes boundaries and local tooling; it does not implement the media pipeline.

## Runtime topology

```text
Browser
  |
  v
Next.js web application
  |
  v
NestJS API -----> PostgreSQL (metadata and future domain records)
  |
  v
Redis / BullMQ
  |
  v
NestJS worker -----> AI, media and storage providers
                          |
                          v
                    Object storage
```

The API should accept and validate requests, persist intent, and enqueue expensive work. It must not transcribe or render video in an HTTP request. Workers own long-running processing and store results before the API or a notification mechanism exposes them to the user.

## Application responsibilities

### `apps/web`

The Next.js App Router application owns presentation and interaction. It may use server components where useful, but domain decisions and privileged integrations belong behind the API.

### `apps/api`

The NestJS API will own REST endpoints, authorization enforcement, metadata coordination, and job creation. Task 001 exposes only `GET /health`; future Nest modules should follow domain boundaries rather than becoming one large application service.

### `apps/worker`

The standalone NestJS application is the host for BullMQ processors. Task 001 configures the queue connection boundary but deliberately registers no processors. Jobs added later must have explicit states, idempotency keys where appropriate, structured logs, retry policies, and diagnosable terminal failures.

## Package responsibilities

| Package                | Responsibility                                                             |
| ---------------------- | -------------------------------------------------------------------------- |
| `@clipgenius/ai`       | Replaceable AI, transcription, vision, and image-generation contracts      |
| `@clipgenius/config`   | Runtime environment validation and connection configuration                |
| `@clipgenius/database` | Prisma schema, migrations, generated client, and PostgreSQL client factory |
| `@clipgenius/prompts`  | Versioned prompt definitions, separate from controllers and services       |
| `@clipgenius/storage`  | Streaming object-storage contract; future R2 implementation boundary       |
| `@clipgenius/types`    | Small set of genuinely cross-runtime domain types                          |
| `@clipgenius/ui`       | Reusable presentation components with no business logic                    |
| `@clipgenius/video`    | Probe, processing, caption, and rendering contracts                        |

`@clipgenius/storage` is an intentional addition to the minimum package list because object storage is a required external boundary and does not belong to the AI, video, database, or generic types packages.

## Source and dependency conventions

- Workspace packages expose compiled ESM and declarations from `dist`.
- The portable pnpm scripts run workspace dependencies topologically before their
  consumers. Equivalent Turborepo scripts and caching configuration are retained
  for environments that can execute its native binary.
- Applications remain independently buildable and runnable.
- Environment schemas are scoped by runtime so a service does not require credentials for integrations it does not use.
- Vendor SDKs are added only with the feature that uses them.
- Task 002 adds only the user, organization, and membership tables required by
  the next authentication milestone. See the
  [identity and tenancy domain model](domain-model.md) for its invariants and
  deliberate deferrals.

## Future request and data flow

```text
1. The web application requests an upload session from the API.
2. The browser streams media directly to object storage.
3. The API records media metadata and enqueues analysis.
4. A worker probes, transcribes, and analyzes the stored media.
5. AI services produce validated domain data and an Edit Plan.
6. A video worker translates the Edit Plan into deterministic renderer actions.
7. Outputs are stored in object storage and referenced from PostgreSQL.
8. The user receives status and output metadata through the API.
```

Media bytes should not pass through PostgreSQL or be buffered wholesale in the API.

## Future AI pipeline

```text
Content Analyzer
-> Content Intelligence
-> Creative Director
-> Edit Planner
-> Video Editor
-> Clip Strategist
-> Platform Optimizer
-> Campaign Generator
```

Providers supply model capabilities, while ClipGenius owns orchestration, schemas, product rules, and the resulting content intelligence. Raw model output is untrusted and must be schema validated.

## Future video pipeline

```text
Media probe
-> normalized source metadata
-> validated Edit Plan
-> renderer-specific execution plan
-> FFmpeg/Remotion execution where appropriate
-> output probe and verification
-> object storage
```

AI selects editing intent; it never emits or executes arbitrary FFmpeg commands. Rendering adapters translate typed operations into constrained commands.

## Future background-job architecture

Job families will be introduced milestone by milestone: media probing, transcription, content analysis, opportunity discovery, Edit Plan generation, rendering, export, and publishing. Each handler must define its input schema, retry/timeout behavior, idempotency strategy, progress states, and structured error representation.

## Deferred decisions

Authentication, payment providers, production storage, AI vendors, deployment platforms, and detailed database models are deliberately deferred until their milestone supplies concrete requirements. Their future boundaries are documented without adding unused SDKs or fake implementations.
