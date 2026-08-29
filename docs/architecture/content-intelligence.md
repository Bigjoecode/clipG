# Content Intelligence Architecture

## Scope

Task 008 converts a completed, speaker-aware transcript into a durable summary,
topics, keywords, and source-timed Content Opportunities. It does not select a
final clip campaign, accept editing instructions, create an Edit Plan, or render
media.

## Flow

```text
User -> Next.js server action -> NestJS API
  -> PostgreSQL CONTENT_INTELLIGENCE job -> Redis / BullMQ
  -> worker -> transcript + project context
  -> versioned prompt -> ContentIntelligenceProvider
  -> schema and source-time validation
  -> PostgreSQL analysis + opportunities + SUCCEEDED job
```

The API verifies live organization membership, active project state, and a
successful transcript before recording intent. No model call runs in an HTTP
request. PostgreSQL is authoritative; Redis transports identifiers only, and
the worker re-reads all tenant and transcript data before processing.

## Provider and prompt boundary

`@clipgenius/ai` owns `ContentIntelligenceProvider`. Each adapter uses the
selected provider's schema-constrained API. Its output still passes a
local Zod schema and deterministic timing checks before persistence. The API key
is worker-only and must never use a `NEXT_PUBLIC_` prefix.

The prompt is `content-intelligence` version 1 in `@clipgenius/prompts`. Stored
analyses record provider, model, prompt id, prompt version, and the exact
`transcript.updatedAt` value used. Prompt or provider changes are therefore
inspectable rather than hidden application behavior.

The transcript is untrusted input. The prompt explicitly treats instructions
inside it as quoted content, and the provider has no tools, storage access,
credentials, or renderer access. A privacy-preserving hash of the organization
id is sent as the provider safety identifier; raw user ids are not sent for that
purpose.

## Opportunity contract

Every Content Opportunity is a first-class database record with:

- type, title, topic, hook, summary, and rationale;
- a verbatim evidence excerpt and continuous source start/end time;
- recommended duration and supported platforms; and
- 0–100 scores for hook, clarity, emotional impact, standalone value,
  retention potential, and platform fit.

Application validation and database constraints reject negative/reversed timing,
out-of-source selections, invalid scores, and non-positive durations. These
records are analysis evidence for later clip strategy and Edit Plan tasks; they
are not executable editing commands.

## Idempotency, revisions, and failure behavior

`(mediaAssetId, CONTENT_INTELLIGENCE)` is the durable job idempotency key.
Queued/running work is never disturbed. Repeated requests return the existing
fresh result unless `replaceExisting` is true. A failed job may be retried.

Re-transcription keeps the transcript identity but changes `updatedAt`. The
analysis stores the revision it consumed, so the API and UI mark older
intelligence stale; requesting analysis then regenerates it even without an
explicit replacement flag. Successful regeneration replaces opportunities in
one database transaction.

Provider timeouts, transport failures, rate limits, and malformed output retry
within a bounded BullMQ budget. Missing transcripts, oversized transcript input,
invalid domain state, authentication failures, and exhausted provider quota are
terminal and produce safe UI-visible failure text.
