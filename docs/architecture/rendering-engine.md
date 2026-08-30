# Deterministic Rendering Engine

## Decision

Task 011 uses **FFmpeg as the first rendering backend**, behind a renderer
interface and a renderer-neutral timeline IR. Remotion is not installed. A
future hybrid backend remains possible without changing `EditPlan` or callers.

The boundary is:

```text
untrusted/stored EditPlan
  -> validatePlanForRendering (canonical validation + render-ready check)
  -> ValidatedEditPlan (opaque proof)
  -> compileRenderTimeline
  -> RenderTimeline
  -> Renderer
  -> FFmpeg argument array
  -> new MP4 artifact
```

No AI provider participates in rendering. FFmpeg receives safe process argument
arrays through `execFile`; user data is never interpolated into a shell command.

## Alternatives considered

### FFmpeg

FFmpeg directly supports the first slice: trimming/concatenation, crop/scale,
image and video overlays, deterministic zoom filters, text, audio gain, H.264,
AAC, and MP4. It streams media, has predictable server resource usage, already
exists in the repository as a pinned static binary, and fits the background
worker deployment model. Its filter graphs are difficult to author and debug,
which is why they are isolated behind the timeline IR and backend adapter.

The bundled Windows build is GPLv3-enabled. Distribution/deployment must retain
the applicable FFmpeg build notices and be reviewed before shipping a packaged
binary to customers. Server-side use does not change the application's license,
but the exact deployed build remains a release/legal choice.

### Remotion

Remotion has superior React-based ergonomics for branded layouts, kinetic text,
and sophisticated compositing. It also adds a browser/Chromium rendering stack,
larger deployments, different concurrency controls, and more CPU/memory overhead.
Those costs do not help prove REMOVE, REFRAME, ZOOM, simple overlays, text, and
audio gain, so Task 011 does not add it. Its current license and cloud terms must
be reviewed against the eventual production deployment before adoption.

### Hybrid FFmpeg + Remotion

Hybrid is the likely extension when ClipGenius needs rich motion graphics:
FFmpeg can prepare/encode media while Remotion composes branded visuals. Choosing
it now would create two render runtimes before one is necessary. The stable
`Renderer` and `RenderTimeline` boundaries let a hybrid adapter be introduced
later without putting implementation vocabulary into the Editing Language.

## Renderer contract

`Renderer.render()` accepts an opaque `ValidatedEditPlan`, a trusted local source
reference, resolved local assets, and a separate output path. It returns backend
identity/version, output duration/dimensions/codecs/size, render duration, and
warnings. It never receives raw instructions, URLs inside an EditPlan, or binary
media embedded in a plan.

The branded `ValidatedEditPlan` can only be produced by
`validatePlanForRendering()`. That function invokes canonical Task 009 validation
against authoritative source/asset context and rejects unresolved semantic
targets. The worker repeats this validation against the stored snapshot before
every execution.

## Timeline IR

`RenderTimeline` contains:

- retained source/output segments after REMOVE;
- output dimensions;
- resolved overlays with stable asset ID, local path, kind, and provenance;
- timed zoom interpolation;
- timed text and style;
- timed audio levels and fades.

Operations are first mapped from immutable source time to output time. An effect
that crosses removed footage fails in renderer v1 because splitting that effect
would change its interpolation semantics. The backend compiles this IR to a
filter graph; no service constructs one giant command directly from an EditPlan.

## Supported operations (renderer 1.0.0)

- `REMOVE`
- `INSERT_ASSET` for resolved IMAGE and VIDEO assets
- one global `REFRAME` with CENTER or explicit FIXED_POINT focus and 16:9,
  9:16, or 1:1 output
- `ZOOM` with start/end scale and all canonical easing values
- `TEXT` with segment timing and basic canonical style
- `AUDIO_LEVEL` with mute/gain and simple fades

`TEXT` was selected instead of `CAPTION` for the first slice. Transcript segments
have sentence/segment timestamps, but the current render job snapshot does not
yet carry a transcript manifest. Task 011 therefore does not redesign transcripts
or invent word timing. Segment-based `CAPTION` is the next natural extension.

Every other operation fails with `UNSUPPORTED_OPERATION`. The renderer never
silently ignores an operation. `PRIMARY_SPEAKER` reframe also fails until a
tracking stage supplies deterministic coordinates. `4:5` exists in the language
but is intentionally unsupported by renderer v1; required outputs are 16:9,
9:16, and 1:1. Inserted videos are muted visual overlays in v1; requesting their
audio fails explicitly. A target duration that differs from the compiled
timeline also fails rather than silently changing speed or padding content.

## Assets, source, and storage

The application resolves stable asset IDs into a snapshotted manifest containing
storage bucket/key, size, kind, and provenance. EditPlans never contain storage
keys or arbitrary URLs. The worker signs trusted downloads, streams inputs to
private temporary files, and deletes them in `finally` blocks.
AI-generated assets additionally require an explicit permission bit snapshotted
on the render; manifest presence never grants permission by itself.

Source media is read-only. The renderer refuses an output path equal to the
source path. Outputs use a separate key:

```text
organizations/{organizationId}/projects/{projectId}/renders/{renderId}/output.mp4
```

The existing Supabase storage provider and private bucket are reused; there is
no second storage system. Upload uses the server-only secret and streams from
disk. A retry may replace only its own immutable render key, allowing recovery
when upload succeeds before a database failure; it cannot overwrite source media
or another render. Output is initially MP4/H.264/AAC with yuv420p and fast-start metadata for
broad playback compatibility.

## Jobs, idempotency, and observability

The API exposes an internal `RenderJobService`, not a public endpoint. It validates
the plan, canonicalizes the manifest, hashes source + plan + manifest, and upserts
on `(organizationId, idempotencyKey)`. BullMQ also uses the persisted render UUID
as its job ID. Repeated requests therefore converge on one render record/job.

The existing Redis/BullMQ worker records queued/running/succeeded/failed state,
attempt count, organization/project/source IDs, timestamps, backend/version,
render duration, output duration/dimensions/codecs/size, and a classified error.
Render compute is not written to `AiRun` because it is not AI provider usage.

Errors distinguish invalid plan, missing source, missing asset, unsupported
operation, unsupported codec, renderer failure, storage failure, and timeout.
Input/unsupported errors are terminal; transient renderer/storage failures use
the bounded existing queue retry pattern.

## Golden baseline

The automated golden test creates a 10-second synthetic 640x360 source and a tiny
image, then executes REMOVE 0-2s, REFRAME 9:16, ZOOM 1.0-1.1, INSERT_ASSET, TEXT,
and AUDIO_LEVEL through the real bundled FFmpeg binary. It verifies an 8-second
720x1280 H.264/AAC MP4, non-empty output, and an unchanged SHA-256 source hash.

The first measured local Windows run rendered 8.0 seconds in 5.967 seconds, a
0.746 render/output-duration ratio. This is a correctness baseline, not a
production capacity claim; hardware, source codec/resolution, and operation mix
will change it.

## Future extension path

Next renderer work can add segment-based CAPTION, KEEP/SPEED, richer asset audio,
multiple audio tracks, transitions, PAN/CROP, tracking-backed speaker reframe,
hardware encoding, and resource-aware worker concurrency. A Remotion or hybrid
backend should be introduced only when a concrete visual operation benefits from
it, implementing the same `Renderer` contract and consuming the same IR.
