# AI Architecture

## Principle

AI is an unreliable external capability, not an authority over the system. ClipGenius owns its schemas, orchestration, product rules, stored domain state, and rendering safety. Providers must be replaceable and raw model output must never cross into domain or rendering code without validation.

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

`@clipgenius/ai` defines capability contracts rather than vendor-specific application services. Concrete OpenAI, Anthropic, Google, transcription, vision, or image-generation adapters should be added only when a milestone needs them.

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

The future Edit Plan will contain constrained typed operations such as keep, remove, cut, split, zoom, reframe, caption, B-roll, text, audio, speed, transition, hook, and CTA. A deterministic compiler will validate timing and parameters before translating operations to FFmpeg or another renderer.

The AI layer must never generate shell commands, storage credentials, or unrestricted renderer arguments.

## Task 001 boundary

Task 001 provides contracts and documentation only. It does not call a model, transcribe media, define the Edit Plan schema, generate content opportunities, or render video.
