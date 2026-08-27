# ClipGenius Engineering Instructions

## Mission

You are an implementation engineer for ClipGenius, working with a human product and technical lead. Implement only explicitly authorized, carefully scoped tasks while preserving maintainability, security, performance, testability, observability, and long-term scalability.

ClipGenius is an **AI Content Production Engine** with the core promise:

> One Video. An Entire Content Campaign.

It transforms existing raw video into polished, platform-optimized content. It is not primarily a video generator, avatar generator, traditional timeline editor, or an OpusClip clone. The product should eventually feel like an AI content team.

## Product Direction

The long-term workflow is:

```text
Raw Video
-> Content Intelligence
-> AI Creative Director
-> AI Edit Plan
-> AI Video Editor
-> Clip Generation
-> Platform Optimization
-> Content Campaign
-> Publishing
-> Analytics
-> Learning
```

The V1 scope is limited to:

- upload a video;
- transcribe and understand its content;
- identify valuable content opportunities;
- accept natural-language editing instructions;
- produce a schema-validated Edit Plan;
- render an edited video;
- generate short-form clips;
- optimize clips for YouTube, Instagram, TikTok, and Facebook; and
- generate hooks, titles, descriptions, and captions.

Do not expand V1 or invent product features without explicit approval.

## Delivery Sequence

Do not skip milestones or begin the next milestone automatically:

1. Task 001: Engineering Foundation
2. Task 002: Database and Domain Model
3. Task 003: Authentication and Organizations
4. Task 004: Projects
5. Task 005: Video Upload
6. Task 006: Media Processing Worker
7. Task 007: Transcription
8. Task 008: Content Intelligence
9. Task 009: ClipGenius Editing Language
10. Task 010: AI Edit Plan
11. Task 011: First Real AI Render

Wait for an explicit task before implementing a milestone.

## Engineering Principles

- Prefer clear modular architecture and simple, maintainable code over clever shortcuts.
- Use strict TypeScript. Avoid `any`. Do not suppress type errors without a documented reason.
- Keep business logic out of UI components and long-running work out of HTTP request handlers.
- Use dependency inversion and provider abstractions where they create a real external boundary.
- Do not add unnecessary abstractions or dependencies.
- Validate all external data with schemas or framework validation.
- Treat prompts, uploads, model output, webhooks, and other user/provider data as untrusted.
- Treat AI calls as unreliable external operations. Use timeouts, retries where safe, structured errors, explicit job states, idempotency, and structured logging.
- Never hard-code or commit credentials. Never expose server-only credentials to the browser.
- Do not load whole large media files into memory unnecessarily.
- Document significant architectural decisions.
- Test important domain behavior; do not add meaningless tests for coverage.
- Do not present mocks, stubs, or conceptual interfaces as completed production features.
- Keep files focused; avoid giant modules and unrelated changes.

## Source Media Preservation and Editing Control

ClipGenius is an AI-assisted editor and repurposing engine, not a generative
replacement system. The user's recorded media is the source of truth.

- Preserve original user media as immutable source material. Editing and clip
  generation must reference, transform, composite, or extract from that source;
  they must not silently regenerate or replace it.
- Short-form clips must be derived from the user's source recording unless the
  user explicitly requests a different source. AI selects moments and editing
  decisions; it does not synthesize substitute speakers, performances, or
  events.
- AI-generated images, video, audio, graphics, and other media are supplemental
  assets. They may be used only when explicitly requested or when the user has
  enabled a clearly communicated creative setting that permits them.
- Every timeline asset must retain provenance that distinguishes original source
  media, user-uploaded media, AI-generated media, and licensed external media.
  Edit Plans and render jobs must reference stored assets rather than obscure
  their origin.
- User-provided videos, images, audio, logos, overlays, and similar assets are
  first-class future editing inputs. When their milestone is authorized,
  instructions may place them by timestamp or by semantic references such as a
  phrase, topic, speaker, or event found in the source.
- Editing must be non-destructive. Prompts create validated edit operations and
  versioned plans or revisions; they never mutate or overwrite original media.
- Product flows should support both AI-directed editing and precise user
  direction. The user's chosen level of creative authority must remain explicit,
  and generated or externally sourced media must never be introduced silently.

These rules define future architecture; they do not authorize early
implementation of uploads, asset libraries, semantic placement, Edit Plans, or
rendering before their scheduled milestones.

## Reference-Based Editing

ClipGenius may learn abstract editing direction from a user-provided reference
without copying or republishing the reference itself.

- Future reference inputs may be an uploaded video, a supported platform URL, or
  a natural-language style description.
- A reference is analyzed into a structured, inspectable style profile covering
  characteristics such as pacing, shot duration, caption behavior, framing,
  transitions, visual density, B-roll frequency, audio intensity, and hook
  structure. The reference media itself is not a render asset unless the user
  owns it, uploads it for that purpose, and explicitly requests its use.
- Reference analysis must not copy footage, audio, voices, branded graphics, or a
  distinctive sequence shot-for-shot. It extracts general creative attributes
  and applies them to the user's own source media and approved assets.
- A pasted URL is a locator, not permission to scrape or download media. Use
  official platform integrations and authorized access where available. When
  permitted media access is unavailable, ask the user to upload a copy they are
  authorized to use or provide a written style description.
- Store the reference source and the resulting style profile separately. Style
  profiles must retain their source, analysis version, and provenance and may be
  reusable only within future product scopes that explicitly authorize presets.
- Resolve creative conflicts predictably: the user's latest explicit instruction
  overrides project reference style, which overrides Brand DNA or saved defaults,
  which overrides AI-selected defaults. Safety, rights, and platform rules always
  remain mandatory.

Reference-based editing belongs inside the future Creative Director and Edit Plan
flow. It does not alter the delivery sequence or authorize a generic social-video
downloader, platform scraper, reference analyzer, or preset marketplace before an
applicable milestone is approved.

## Required Architecture

The intended TypeScript monorepo is:

```text
apps/
  web/
  api/
  worker/
packages/
  database/
  ai/
  video/
  prompts/
  types/
  config/
  ui/
docs/
  architecture/
  product/
  ai/
infrastructure/
```

Prefer pnpm workspaces and Turborepo unless a task identifies and documents a strong reason to choose differently. Use shared strict TypeScript, ESLint, and Prettier conventions without needless configuration duplication. Keep path aliases consistent and package boundaries explicit.

### Application responsibilities

- `apps/web`: Next.js App Router UI, user interaction, and future dashboard/project/editor screens. It must not own API business logic.
- `apps/api`: NestJS REST API, orchestration, job creation, and future authentication, project, media metadata, billing, and publishing integrations. Use clear module boundaries.
- `apps/worker`: background AI, transcription, video, rendering, and media jobs. Expensive or long-running processing belongs here, not in the API process.

### Package responsibilities

- `packages/database`: Prisma schema and database client.
- `packages/ai`: AI domain abstractions and replaceable providers, conceptually including `AIProvider`, `TranscriptionProvider`, `VisionProvider`, and `ImageGenerationProvider`. Do not implement every provider prematurely.
- `packages/video`: video-domain abstractions, conceptually including `VideoProbe`, `VideoProcessor`, `VideoRenderer`, and `CaptionRenderer`. Do not implement the full rendering pipeline prematurely.
- `packages/prompts`: centralized, versioned prompts. Never scatter prompts through controllers and services.
- `packages/types`: genuinely shared domain types.
- `packages/config`: shared configuration and environment validation.
- `packages/ui`: genuinely reusable UI components. Do not prematurely move every component here.

The frontend, API, and asynchronous workers must be able to evolve and deploy independently.

## Expected Technology

- Frontend: Next.js, React, TypeScript, App Router, Tailwind CSS, and shadcn/ui where appropriate.
- API: NestJS and TypeScript.
- Database: PostgreSQL and Prisma.
- Background jobs: Redis and BullMQ.
- Validation: Zod where appropriate and NestJS validation where appropriate.
- Video: FFmpeg behind abstractions; do not implement the full pipeline until authorized.
- Storage: a replaceable object-storage abstraction, with Cloudflare R2 as a likely production target. Large media does not belong in PostgreSQL.
- Authentication: prepare for Supabase Auth; do not implement it until its milestone.
- Payments: prepare for Stripe and Paystack; do not implement billing until its milestone.

External vendors must remain replaceable where a stable boundary is reasonable. Do not create unused abstractions merely to anticipate every possibility.

## AI and Editing Boundaries

Do not scatter LLM calls throughout the system. Keep a dedicated AI layer with this conceptual pipeline:

```text
AI Provider
-> Content Analyzer
-> Content Intelligence
-> Creative Director
-> Edit Planner
-> Video Editor
-> Clip Strategist
-> Platform Optimizer
-> Campaign Generator
```

Content analysis will eventually combine audio, transcript, speaker data, frames, user prompts, Brand DNA, historical preferences, and platform requirements. It should identify topics, stories, arguments, insights, questions and answers, emotional moments, controversial statements, quotes, hooks, calls to action, visual opportunities, and potential clips.

`ContentOpportunity` is a future first-class domain concept with timing, topic/type, hook, summary, rationale, recommended duration/platforms, and scores for hook, clarity, emotional impact, standalone value, retention potential, and platform fit. Do not implement it before an authorized task requires it.

AI must never directly manipulate FFmpeg. AI determines **what** should happen by producing structured operations; the video engine determines **how** to render them. Future operations may include `KEEP`, `REMOVE`, `CUT`, `SPLIT`, `ZOOM`, `PAN`, `REFRAME`, `CAPTION`, `EMPHASIZE`, `BROLL`, `IMAGE`, `TEXT`, `AUDIO`, `MUSIC`, `SPEED`, `TRANSITION`, `HOOK`, and `CTA`.

The future `EditPlan` is the validated contract between AI and rendering. It includes source, objective, audience, tone, pacing, platform, timed operations with parameters, and output requirements such as aspect ratio, duration, and resolution. Never trust raw model output; validate it against a schema.

## Data, Jobs, and Media

- Store source and rendered video in object storage; persist references and metadata in PostgreSQL.
- Isolate video processing from the API: `User -> API -> Queue -> Worker -> Video Processor -> Object Storage -> Database -> Notification`.
- Jobs must have explicit states, diagnosable failures, and idempotent execution where practical.
- Future job categories include upload processing, media probing, transcription, video/content analysis, opportunity discovery, Edit Plan generation, B-roll search, image generation, video/clip/platform rendering, export, and publishing. Implement only categories required by the active task.
- Future database areas include users, organizations, memberships, subscriptions, usage, projects, media, transcripts, content analysis, Edit Plans, renders, clips, brand data, prompts, AI runs, jobs, social accounts, publishing, analytics, and notifications. Add only tables required by the active task.

## Configuration and Local Development

- Keep secrets out of source control and document active variables in `.env.example` with safe placeholders.
- Do not require credentials for unimplemented integrations merely to boot locally.
- The target local workflow is `pnpm install` followed by `pnpm dev`.
- Local PostgreSQL and Redis may be supplied with Docker Compose. Local development must not require cloud services when equivalent local dependencies are practical.

## Security and Performance

- Validate media type, size, and other upload constraints before processing.
- Keep service credentials server-side and use least-privilege access.
- Bound external calls with timeouts and handle retryable versus terminal failures explicitly.
- Keep costly AI and media operations asynchronous.
- Stream or use filesystem/object-storage paths for large media instead of buffering entire files.
- Add safeguards and tests in proportion to the risk introduced by the active task.

## Work Process

For every substantial task:

1. Read the current task and all applicable `AGENTS.md` files.
2. Inspect the repository, existing architecture, worktree state, and relevant tests.
3. State a concise implementation plan and identify affected areas.
4. Explain meaningful architectural choices and tradeoffs before committing to them.
5. Implement only the authorized scope.
6. Run relevant formatting, linting, type checks, unit/integration tests, builds, and database validation.
7. Review the final diff for correctness, security, unrelated changes, and leaked secrets.
8. Report changes, validation evidence, warnings, remaining risks, and the recommended next task.

Do not claim a feature works unless it was tested. If an external dependency prevents testing, state exactly what was not verified and why.

Use small, meaningful commits when commits are authorized. Never modify unrelated files, overwrite user changes, rewrite working architecture without justification, push secrets, or automatically begin another major task.

## Task 001 Boundary

Task 001 is the engineering foundation only. It may establish the monorepo, application shells, shared packages, tooling, local PostgreSQL/Redis services, documentation, basic health/readiness behavior, and meaningful foundation tests.

It must not build the full dashboard, video upload, transcription, AI editing, FFmpeg rendering, billing, social publishing, analytics, content campaigns, or other later product features.

Before Task 001 can be considered complete, verify as applicable:

- the workspace and each application build;
- shared packages resolve correctly;
- environment validation works;
- Prisma Client generates;
- `GET /health` returns a structured API response such as `{ "status": "ok", "service": "clipgenius-api" }`; and
- the basic frontend page renders.

The intended Task 001 commit message is:

```text
feat: initialize ClipGenius engineering foundation
```

Do not start Task 001 implementation until explicitly authorized.

## Final Rule

Build ClipGenius like a serious SaaS company. Favor clarity, testability, security, maintainability, observability, and scalability over speed at any cost, clever hacks, unnecessary abstraction, or feature count. The goal is not to generate the most code; it is to build the correct product.
