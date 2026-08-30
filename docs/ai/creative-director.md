# ClipGenius Creative Director

## Purpose

The Creative Director converts natural-language creative direction into a validated ClipGenius `EditPlan`.

```text
user instruction + source + evidence + assets + preferences
  -> provider-neutral Creative Director
  -> schema-constrained provider response
  -> deterministic grounding
  -> canonical Editing Language validation
  -> valid or unresolved EditPlan
  -> future renderer
```

It is the decision layer, not the video editor. It describes **what** should happen and never emits FFmpeg filters, Remotion components, browser commands, or another rendering implementation.

## Input and output

`CreativeDirectorInput` requires only a current `userInstruction` and authoritative `sourceMedia`. Timestamped transcript segments, Content Intelligence, available assets, platform, project and previous instructions, creator preferences, autonomy, a small Brand DNA boundary, `ReferenceStyleProfile`, and an existing EditPlan are optional. The service does not invent missing evidence or rerun transcription or Content Intelligence.

`CreativeDirectorOutput` contains a canonically validated `editPlan`, concise `decisionSummary` entries, structured `unresolvedReferences`, bounded `warnings`, `VALID` or `UNRESOLVED` status, and normalized provider/model/usage metadata. It never exposes raw model output or chain-of-thought as trusted state.

Transcript text is untrusted content. Instructions inside it remain quoted evidence rather than system directions.

## Provider boundary

`CreativeDirector` depends on `CreativeDirectorProvider`, not Gemini. The current adapter is `GeminiCreativeDirectorProvider`, with `gemini-3.6-flash` as its operational default. Gemini uses the Interactions API and a JSON schema derived from the canonical response schema. Its adapter removes only provider-unsupported `minItems` and `maxItems`; complete Zod and Editing Language constraints run after the response returns. The API key is a header, never a URL parameter.

No OpenAI billing or OpenAI Creative Director adapter is introduced by Task 010.

## Instruction precedence

Evidence is labelled in deterministic priority order:

1. system, safety, and platform constraints;
2. explicit current user instruction;
3. project-specific instructions;
4. Brand DNA;
5. reference style;
6. creator preferences;
7. AI defaults.

Higher priority wins. Reference style cannot override a current instruction, and explicit timestamps beat semantic inference.

## Semantic resolution

The model may express a `PHRASE`, `TOPIC`, `SPEAKER`, or `EVENT` target using the Task 009 language. A deterministic post-processor grounds it against existing transcript segments or Content Intelligence opportunities.

- One candidate resolves to integer milliseconds.
- `FIRST`, `LAST`, or `NTH` resolves multiple candidates only when the current user instruction explicitly selects that occurrence.
- `ALL`, no match, or multiple unselected matches remain semantic and return a structured clarification.
- A semantic operation left unresolved without an explanation is rejected.

This prevents the model from quietly choosing the first convenient mention.

## Assets and source preservation

The source is always explicit `SOURCE_MEDIA`; its ID and duration must match the authoritative context. It cannot be inserted as a user asset or replaced with generated media.

Supplemental assets use stable IDs and exact `USER_ASSET`, `AI_GENERATED_ASSET`, or `LICENSED_ASSET` provenance. No binary data, signed URLs, or storage credentials enter a plan. Canonical validation rejects unavailable IDs and provenance lies. AI-generated media requires explicit permission. A missing named asset becomes an `ASSET/NOT_FOUND` unresolved reference rather than an invented ID.

## Reference style and revisions

`ReferenceStyleProfile` describes pacing, captions, creative energy, framing, visual rhythm, zoom and transition frequency, and B-roll density. Task 010 does not retrieve, analyze, copy, or reuse reference media.

When `existingEditPlan` is present, the new plan must set `metadata.parentPlanId` to that exact ID. The prior plan is not mutated. Complete persistence and revision history are intentionally deferred.

## Validation and failure behavior

Invalid JSON, unsupported operations, incomplete output, false asset IDs, provenance mismatches, source substitution, impossible ranges, invalid revisions, unexplained semantic operations, platform violations, and canonical conflicts are rejected as untrusted provider output. Only explicitly defined deterministic semantic grounding is allowed; arbitrary model output is never silently repaired.

## Usage accounting

`CreativeDirectorExecutor` is the worker-side attempt boundary. It writes successful and failed calls through the existing append-only `AiRun` ledger as `CREATIVE_DIRECTOR`, including tenant/project/media/job context, attempt, provider/model, latency, request ID, normalized usage, estimated cost, status, and error category. Prompts and full provider responses are not stored.

## Examples

### Exact timestamp

> Remove the first 8 seconds.

Produces `REMOVE` over `[0, 8000)` milliseconds without semantic inference.

### User asset

> At 20 seconds, insert my Jerusalem video for 5 seconds.

The provider must use the supplied stable ID and emit `INSERT_ASSET` over `[20000, 25000)`. Validation confirms `USER_ASSET` provenance.

### Ambiguous topic

> When I mention faith, add emphasis.

Several mentions without an occurrence choice produce candidate ranges and a clarification question, not a silent first-match decision.

### Reference conflict

If reference style asks for dynamic captions but the user says “Do not animate captions,” the current user wins.

## Evaluation and limitations

The deterministic evaluation set contains 17 fixtures covering timestamps, assets, phrase/topic/speaker/event references, captions, visual and platform direction, autonomy, conflicts, ambiguity, missing assets, provenance, reference precedence, source preservation, and revisions. It measures instruction fidelity, timing, asset accuracy, semantic resolution, source preservation, and EditPlan validity. It is coverage, not proof of broad model quality.

Normal tests mock providers and make no paid calls. Task 010 does not add a public queue endpoint, UI, EditPlan persistence, reference retrieval, asset generation, or rendering. Those require later product decisions and milestones.
