# AI Architecture

## Principle

AI is an unreliable external capability, not an authority over the system. ClipGenius owns its schemas, orchestration, product rules, stored domain state, and rendering safety. Providers must be replaceable and raw model output must never cross into domain or rendering code without validation.

## Source preservation boundary

The AI may analyze source media and decide how to edit it, but it must not replace the user's recorded footage with generated media unless the user explicitly requests that result. Clips reference time ranges from source media; editing operations transform or composite those ranges. Generated media is an optional supporting input, not the default output of content analysis.

Future asset and Edit Plan schemas must carry provenance for at least:

- original source media;
- user-uploaded supporting media;
- AI-generated media; and
- licensed external media.

An operation that references an asset must use its stored identity and provenance. Plans must not convert user media into an anonymous model input and present generated output as though it were the original. Source files remain immutable, and iterative prompts create new validated plan revisions rather than destructively rewriting media or prior plans.

When authorized by later milestones, editing instructions may resolve both explicit timing (`00:20`) and semantic timing (for example, when a topic is discussed or a phrase is spoken). Semantic resolution must produce inspectable time ranges before rendering; a renderer never executes an unresolved natural-language instruction.

## Reference-style boundary

A future Reference Style Analyzer may convert an authorized uploaded reference, a supported platform reference, or a natural-language description into a versioned `ReferenceStyleProfile`. The profile represents general editing characteristics rather than media to copy. Candidate fields include pacing and average shot duration, caption placement and emphasis, punch-in and reframing frequency, B-roll and overlay density, transition behavior, audio intensity, aspect ratio, energy, and visual rhythm.

```text
Authorized reference or style description
-> Reference Style Analyzer
-> schema-validated ReferenceStyleProfile
-> Creative Director + source media + user assets + user instruction
-> Edit Plan
```

Platform URLs must be resolved only through permitted provider capabilities and access granted for the intended analysis. Metadata or an embed alone must not be presented as full audiovisual analysis. The system must not add an unsupported scraper or downloader as a fallback; it should request an authorized upload or style description.

The Creative Director resolves preferences in this order:

1. safety, rights, and platform constraints;
2. the user's latest explicit instruction;
3. the project's selected reference style;
4. Brand DNA or saved user/organization defaults; and
5. AI-selected defaults.

Reference media and extracted profiles remain distinct from timeline assets. A profile may influence an Edit Plan, but the source reference cannot appear in a render unless it independently qualifies as an approved, provenance-aware asset.

## Conceptual pipeline

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

### Content Analyzer

Collects evidence from transcripts, audio, frames, speaker information, and the user's instruction. Later milestones will define the precise input contract.

### Content Intelligence

Produces a structured representation of topics, stories, arguments, insights, questions, answers, quotes, hooks, calls to action, emotional moments, and visual opportunities.

### Creative Director

Interprets the user's objective, audience, tone, pacing, Brand DNA, and platform needs. It selects a creative strategy without producing renderer commands.

### Edit Planner

Creates a schema-validated Edit Plan using the ClipGenius Editing Language. The plan is the contract between probabilistic AI reasoning and deterministic execution.

### Video Editor

Coordinates approved media operations and provider requests. It must not accept arbitrary executable commands from a model.

### Clip Strategist

Selects content opportunities that are coherent, valuable on their own, and appropriate in duration and structure.

### Platform Optimizer

Adapts framing, pacing, hook structure, captions, metadata, and output constraints for each supported platform.

### Campaign Generator

Organizes approved outputs into a coherent content campaign. This is outside the early implementation milestones.

## Provider boundary

`@clipgenius/ai` defines capability contracts rather than vendor-specific application services. Task 007 provides Deepgram (default) and optional OpenAI diarized transcription behind `TranscriptionProvider`. Task 008 provides Gemini (default), OpenAI, and optional Anthropic content intelligence behind `ContentIntelligenceProvider`. Vision, image-generation, and editing providers remain deferred.

Provider calls must eventually include:

- bounded timeouts;
- retry rules based on failure type;
- structured request and response metadata;
- model and prompt version tracking;
- cost and usage accounting;
- safe logging that excludes secrets and sensitive media; and
- schema validation before persistence or execution.

## Prompt management

Prompts live in `@clipgenius/prompts` as versioned assets. Controllers and job handlers refer to prompt identifiers and versions rather than embedding long prompt strings. Prompt changes should be reviewable and traceable to AI runs.

## Edit Plan safety boundary

The future Edit Plan will contain constrained typed operations such as keep, remove, cut, split, zoom, reframe, caption, B-roll, image, video, text, audio, music, speed, transition, hook, and CTA. Asset-backed operations will reference provenance-aware media records. A deterministic compiler will validate timing, asset access, and parameters before translating operations to FFmpeg or another renderer.

The AI layer must never generate shell commands, storage credentials, or unrestricted renderer arguments.

### Editing Language

Task 009 introduces the deterministic ClipGenius Editing Language in `packages/editing-language`: a versioned, typed, renderer-neutral description of what should happen to media. It is the contract between the future Creative Director and the future video engine, and it depends on no AI provider and no rendering technology. See [editing language](editing-language.md).

## Current milestone boundary

Task 008 turns a completed transcript into durable Content Intelligence and source-timed Content Opportunities. It does not create an Edit Plan, choose final clips, edit media, or render output.

The worker sends the versioned `content-intelligence` prompt, project context, transcript timing, and explicit diarization provenance through `ContentIntelligenceProvider`. Every adapter uses schema-constrained output; the worker validates source timing again before persistence. Provider, model, prompt identity, prompt version, and the exact transcript revision are recorded with every analysis.

`ContentOpportunity` is now a first-class domain record. It carries type, topic, hook, summary, rationale, source evidence, start/end timing, recommended duration and platforms, plus hook, clarity, emotional-impact, standalone-value, retention-potential, and platform-fit scores. These are recommendations for later strategy milestones, not renderer instructions.

### Content intelligence provider selection

Content intelligence sits behind `ContentIntelligenceProvider`, and `CONTENT_INTELLIGENCE_PROVIDER` selects the implementation: Google Gemini (the default), OpenAI Structured Outputs, or optional Anthropic. Each supplies its own model default so a shared default cannot send one provider's model name to another.

All three adapters send the canonical Zod schema; none maintains a second schema by hand.

Gemini uses the Interactions API (`POST /v1beta/interactions`) with `response_format: { type: 'text', mime_type: 'application/json', schema }`, pinning `Api-Revision: 2026-05-20` so a future default change cannot silently reinterpret the request. The schema is derived from the canonical Zod schema with `z.toJSONSchema()`.

That endpoint's validator rejects two JSON Schema keywords — `minItems` and `maxItems` — with a bare `400 invalid_request`. This was established by live bisection: the canonical schema is accepted with every other constraint intact (enums, nested objects, arrays of objects, `minimum`/`maximum`, `minLength`/`maxLength`, `additionalProperties`, `required`) and rejected the moment array bounds appear. The adapter strips exactly those two keywords at the provider boundary and nothing else.

Stripping them costs no correctness: array bounds stay enforced by the canonical schema when the response is validated on the way back, and a regression test feeds an over-length response through the adapter to prove the cap is still real. The earlier hand-written OpenAPI-subset schema and its parity test are gone — deriving the schema removes that drift risk entirely.

This replaces the legacy `generateContent` path, whose OpenAPI-subset validator rejected the complete opportunity schema.

**Verifying a provider is live.** A mocked adapter test cannot catch a provider rejecting the schema — every mocked Gemini test passed while the real call returned 400. `packages/ai/test/gemini-live.integration.test.ts` makes one real request against a tiny fixture and is skipped unless `CLIPGENIUS_LIVE_GEMINI=1` and `GEMINI_API_KEY` are both set, so `pnpm validate` still needs no key and costs nothing:

```bash
CLIPGENIUS_LIVE_GEMINI=1 corepack pnpm --filter @clipgenius/ai test
# optionally: CLIPGENIUS_LIVE_GEMINI_MODEL=gemini-3.7-flash
```

Both `gemini-3.6-flash` and `gemini-3.7-flash` have been verified live end to end. `gemini-3.6-flash` remains the default: the fix is API-level rather than model-level, and there is no measured reason to move.

Both constrain decoding to a schema rather than merely requesting JSON. That is a selection constraint: the opportunity schema is large, and every malformed response costs a full retry over an entire transcript, so a provider that can only be asked politely for JSON is materially more expensive to run.

Schema validation and transcript grounding are shared by every provider in `parseContentIntelligence`, not implemented per adapter. Model output is untrusted, and a cheaper or weaker model is more likely to invent a quote or a timestamp rather than less, so an adapter must not be able to skip the checks. Every returned opportunity must fit inside the recording, describe a positive time window, and quote evidence that actually occurs in the segments its window spans.

**Data handling is part of this choice.** ClipGenius sends transcript text and project context to the selected content-intelligence provider, not source-video bytes. Deployment owners must review the current terms for their selected provider and service tier.

### AI usage ledger and pricing

One immutable `AiRun` is appended for every actual external transcription, content-intelligence, or Creative Director attempt, including each worker retry. Pre-provider validation failures create no run because no vendor request occurred. A fresh/idempotently cached analysis also creates no run. Each row records tenant/project/job context, operation, provider/model, normalized token and audio usage, latency, provider request id, retry attempt, outcome, and normalized error category. Secrets, full provider responses, prompts, and raw transcripts are never written to this ledger.

### Creative Director

Task 010 adds the provider-neutral Creative Director between existing evidence and the Editing Language. It accepts current user direction plus optional transcript, Content Intelligence, available assets, platform constraints, preferences, Brand DNA, reference-style characteristics, and revision context. The provider returns a schema-constrained candidate, but only deterministic semantic grounding and canonical `validateEditPlan()` can make it trusted.

The priority order is system/platform, current user, project, Brand DNA, reference style, creator preferences, then defaults. Semantic ambiguity remains structured and unresolved. Original `SOURCE_MEDIA` identity and duration stay authoritative, and no renderer technology is visible to the model or domain contract. See [creative-director.md](creative-director.md).

Pricing is a versioned code catalog expressed in integer micro-dollars. The selected catalog version, effective date, and all component rates are copied onto the run with the estimate, so later catalog edits cannot rewrite historical math. `actualCostMicros` is separate and remains null until a provider invoice or billing feed supplies it. An unknown or unapproved provider/model price produces a null estimate rather than a fabricated value. Indexes support bounded aggregation by organization, project, operation, provider, model, and date; `aggregateAiUsage` provides the deterministic rollup used by a future usage API. This is accounting infrastructure, not subscription enforcement.

### Transcription provider selection

Transcription sits behind the domain-level `TranscriptionProvider` contract, and `TRANSCRIPTION_PROVIDER` selects the implementation. Deepgram is the default and OpenAI remains available; both return speaker-attributed segments.

Diarization is a selection constraint rather than a preference. This document commits Task 007 to "timestamped speaker segments", and the engineering instructions name speaker data as a Content Intelligence input, so a provider that returns only plain segments would silently narrow what Task 008 can be built on. Adopting one requires changing those commitments first, deliberately.

Because a segment's `speaker` may legitimately be null even under a diarizing provider, capability is recorded explicitly on the transcript rather than inferred from the data: `diarized` states whether attribution was actually performed, and `speakerCount` records how many distinct speakers were found. Downstream analysis reads the flag instead of guessing from missing values.

Transcripts are derived data, never source media. A source video is immutable and a transcript can always be re-derived from it, so re-transcription is supported: `POST .../media/:mediaId/transcribe` with `{ "replaceExisting": true }` re-queues a finished transcript and replaces it in place. Without the flag the endpoint stays idempotent, and work already queued or running is never disturbed. This is what keeps provider choice reversible when pricing, quality, or credit availability changes.
