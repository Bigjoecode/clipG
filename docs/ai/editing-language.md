# ClipGenius Editing Language

## Purpose

The Editing Language describes **creative intent, not rendering implementation**.

An `EditPlan` says _what_ should happen to a piece of media. A future video engine decides _how_ to execute it. That separation is the whole point: it is what stops ClipGenius from being locked to FFmpeg, Remotion, or any other renderer, and it is what makes a stored plan meaningful years after the engine that first rendered it was replaced.

```text
user or AI instruction
  -> ClipGenius Editing Language
  -> validated EditPlan
  -> future video engine
  -> FFmpeg / Remotion / other
  -> rendered output
```

Task 009 defines the language and its validator only. Nothing here generates a plan from natural language, resolves a semantic trigger, or renders a frame.

## Architecture

The language lives in `packages/editing-language` as a standalone workspace package.

It is not in `packages/types` deliberately. That package has zero dependencies and is a pure contract surface consumed by the browser bundle; the Editing Language needs Zod plus real validation and conflict-detection logic, and pushing that into `types` would both add a runtime dependency to a types-only package and ship validation code to every web client that imports a domain type.

The package depends on Zod and nothing else. It has no dependency on OpenAI, Anthropic, Gemini, Deepgram, FFmpeg, Remotion, Prisma, or any browser API, and a test asserts that no renderer vocabulary appears in a serialized plan.

```text
packages/editing-language/
  src/
    time.ts        canonical time unit, ranges, overlap helpers
    assets.ts      media provenance, asset references, asset context
    targets.ts     time targets and semantic triggers
    effects.ts     renderer-neutral effect parameters
    operations.ts  the discriminated operation union
    edit-plan.ts   the versioned EditPlan
    validate.ts    validation, provenance checks, conflict detection
    examples.ts    seven worked examples, used as test fixtures
    index.ts
  test/
    edit-plan.test.ts
```

## Time

Time is **whole milliseconds**, always. Never seconds, never a timecode string.

Seconds would be the more consistent choice — transcripts and content opportunities both speak seconds — but edit ranges get compared for overlap, summed, and subtracted, and binary floating point makes those operations inexact. Integer milliseconds make range arithmetic and conflict detection exact, which is what "deterministic" has to mean for a contract two different renderers must interpret identically.

Conversion happens once, deliberately, at the boundary: `secondsToMilliseconds()` is where rounding occurs. `formatTimecode()` exists for logs and fixtures and is never a stored value.

Ranges are half-open, `[startMs, endMs)`. `endMs` must be strictly greater than `startMs`: a zero-length range is always a no-op and is far more often a generation error than an intent.

## Operation targets

Every operation targets either a resolved time range or an unresolved semantic trigger:

- `{ kind: 'TIME', range }` — renderable now.
- `{ kind: 'SEMANTIC', trigger, occurrence, leadMs, trailMs, durationMs }` — intent that still needs a transcript.

Semantic triggers are a discriminated union over `kind`: `PHRASE`, `TOPIC`, `SPEAKER`, `EVENT`. New kinds can be added without touching existing ones.

This is how "when I mention the apostles, show these images" is representable today with no timestamps and no AI. A plan containing semantic targets is structurally valid and safe to store, but `validateEditPlan` reports `renderReady: false` and lists the unresolved operation ids. **Render-ready and valid are different states**, and the distinction is what keeps an unresolved plan from reaching an engine that cannot execute it.

## Asset provenance

Every asset reference carries its origin explicitly:

| Source               | Meaning                                               |
| -------------------- | ----------------------------------------------------- |
| `SOURCE_MEDIA`       | The user's original upload — the base of the timeline |
| `USER_ASSET`         | Media the user supplied (image, video, audio, logo)   |
| `AI_GENERATED_ASSET` | Media a model produced                                |
| `LICENSED_ASSET`     | Externally licensed media                             |

Provenance is never inferred from an id. The validator enforces three rules that follow directly from the engineering instructions:

- **The plan source is explicitly `SOURCE_MEDIA`.** Its stable ID and duration must match the authoritative asset context; model output cannot substitute a different upload or enlarge the timeline.
- **Source media is not insertable.** It is the base of the timeline, not an overlay. An operation claiming to insert it is rejected.
- **AI-generated media requires permission.** Unless the asset context passes `allowAiGeneratedAssets: true`, any AI asset is rejected. It defaults to `false` everywhere.
- **A claim must match reality.** If the context says an asset is AI-generated and the operation calls it a user asset, the plan is rejected rather than quietly accepted.

Operations reference assets by stable id only. A plan never contains bytes, a URL, a storage key, or a signed link.

## Operations

Fourteen operations, as a Zod discriminated union on `type`. There is no `parameters: unknown` escape hatch — an invalid combination fails validation instead of reaching a renderer.

| Category | Operations                                     |
| -------- | ---------------------------------------------- |
| Temporal | `REMOVE`, `KEEP`, `SPEED`                      |
| Media    | `INSERT_ASSET`, `REPLACE_ASSET`                |
| Visual   | `ZOOM`, `PAN`, `CROP`, `REFRAME`, `TRANSITION` |
| Text     | `CAPTION`, `TEXT`                              |
| Audio    | `MUSIC`, `AUDIO_LEVEL`                         |

### What is deliberately not an operation

The brief listed 27 candidate names. Implementing all of them would have meant inventing distinctions the renderer does not have, so several are represented instead of duplicated:

- **`CUT` / `SPLIT`** — on a plan that describes intent, splitting with no follow-up changes nothing about the output. Removing a span is `REMOVE`; what survives is governed by the plan's retention mode.
- **`TRIM`** — the same thing as removing the head or tail, expressed by `REMOVE` or by `KEEP_ONLY_SELECTED`.
- **`MOVE_ASSET` / `RESIZE_ASSET`** — an inserted asset already carries its own placement and timing, so moving or resizing it means editing that operation, not adding a second operation that mutates the first.
- **`IMAGE` / `VIDEO_OVERLAY` / `BROLL`** — all are `INSERT_ASSET` with an asset of the appropriate kind.
- **`EMPHASIZE` / `HIGHLIGHT`** — caption emphasis, expressed on `CAPTION` via `emphasis.mode`.
- **`HOOK` / `CTA`** — editorial purpose, not mechanism. See intent below.

### Intent

`intent` records editorial purpose — `HOOK`, `CTA`, `BROLL`, `EMPHASIS`, `BRANDING` — separately from the mechanical `type`. A hook is a piece of text or an asset placed at the start; modelling it as its own operation type would produce near-identical operations differing only in why they exist.

### Retention

A bare list of `KEEP` and `REMOVE` operations is ambiguous about the spans nobody mentioned, so the plan states its mode:

- `KEEP_ALL_EXCEPT_REMOVED` — "remove the boring intro, leave the rest."
- `KEEP_ONLY_SELECTED` — "pull these three moments out." This is what clip generation needs, and it requires at least one `KEEP`.

## Effects

Effect parameters are renderer-neutral: normalized coordinates (`0,0` top-left to `1,1` bottom-right), scale multipliers, decibels, and named easing curves. Font sizing is a `fontScale` multiplier because a pixel size is meaningless until an output resolution is chosen, and that is the renderer's decision.

There is no filter string, shell fragment, or library-specific option anywhere in the language. This is enforced by test.

```jsonc
// Correct
{ "type": "ZOOM", "startScale": 1, "endScale": 1.12, "easing": "EASE_IN_OUT" }

// Never
{ "type": "ZOOM", "ffmpegFilter": "zoompan=z='min(zoom+0.0015,1.12)'" }
```

## Validation

`validateEditPlan(input, context)` returns a discriminated result — never a thrown error, never a partially trusted plan.

A plan is only meaningful **relative to a context**. The same operations are correct for one project and reference non-existent media in another, so the validator always takes an `AssetContext` describing the source, its duration, the available assets, and whether AI-generated media is permitted.

It checks: schema version, operation structure, unknown fields (rejected, not dropped), source provenance and identity, source duration against the authoritative context, duplicate operation ids, temporal ranges against the real source duration, transition duration against its own range, asset existence, asset provenance, asset kind against the operation, retention consistency, and conflicts.

### Conflict detection

Only conflicts with no sensible interpretation are reported:

- Two operations both claiming exclusive control of the picture over the same span (`REMOVE` / `REPLACE_ASSET`).
- The same span both removed and kept.
- Two `SPEED` operations over the same span.

Overlapping zooms, captions, and music are legitimate layering and are left alone. Resolving genuinely ambiguous intent is not something a validator should guess at, and edit optimization is explicitly out of scope.

## Versioning

`schemaVersion` is a Zod literal union of the versions this build understands — currently `"1.0"` — never a free-form string.

To introduce a version: add the literal to `supportedEditPlanSchemaVersions`, add a branch that reads the older shape, and keep the old branch. A stored plan must either be understood exactly or rejected loudly. Silently reinterpreting an old plan under new rules would change what a user's saved edit means, which is the one failure mode versioning exists to prevent.

Migration tooling is deliberately not built yet.

## Non-destructive editing

An `EditPlan` describes transformations; the source is never modified. `metadata.parentPlanId` records the plan a revision descends from, so future version history is possible without mutating anything. The revision system itself is a later milestone — Task 009 records the link only.

## Renderer boundary

The language must never gain a dependency on a rendering technology. The rendering layer translates operations into engine calls; that translation lives with the engine, not here. If a future operation cannot be expressed without naming a renderer feature, that is a signal the operation is wrong, not that the boundary should be relaxed.

## Worked examples

`src/examples.ts` carries seven plans that are also the test fixtures, so a language change that breaks a real-world instruction fails the build:

1. "Remove the first 8 seconds."
2. "At 20 seconds, insert my uploaded video for 5 seconds."
3. "When I mention the apostles, show these three uploaded images." — the semantic example; validates but is not render-ready.
4. "Give the images a slow cinematic zoom."
5. "Make the captions smaller."
6. "Reframe this 16:9 source into 9:16 while keeping the speaker as the primary subject."
7. "Remove the boring introduction but preserve everything else."

## Persistence

No database tables were added. The language is a shared typed package; persisting `EditPlan` rows belongs to the milestone that needs them, and a plan serializes losslessly to JSON in the meantime.
