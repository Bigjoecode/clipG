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

`@clipgenius/ai` defines capability contracts rather than vendor-specific application services. Concrete provider adapters are added only when a milestone needs them. Task 007 introduces the first one: an OpenAI diarized-transcription adapter behind the `TranscriptionProvider` contract. It validates timestamped speaker segments before persistence and leaves retry ownership with the BullMQ worker. Content-intelligence, vision, image-generation, and editing providers remain deferred.

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

## Current milestone boundary

Task 007 transcribes an analyzed source into full text and timestamped speaker segments. It does not define content intelligence, an Edit Plan, content opportunities, or rendering behavior.
