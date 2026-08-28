# Media Processing Architecture

## Task 006 scope

Task 006 turns a verified source-video upload into known technical facts. Completing an upload records an idempotent media-probe job, BullMQ carries the job to a worker process, the worker streams the private object to a temporary file, ffprobe extracts container and stream metadata, and PostgreSQL records explicit queued, running, succeeded, and failed states.

It does not generate thumbnails, transcode, transcribe, analyze content, produce edit plans, or render video. Those belong to later milestones.

The worker also marks upload intents that remain `UPLOAD_PENDING` beyond
`UPLOAD_PENDING_MAX_AGE_HOURS` (24 hours by default) as failed. This keeps an
abandoned browser upload from appearing active forever; it does not delete a
completed source object.

## Flow

```text
API verifies an upload (Task 005)
-> MediaAsset UPLOADED
-> upsert MediaJob (MEDIA_PROBE) -> QUEUED
-> BullMQ carries { mediaJobId, mediaAssetId, organizationId, projectId }
-> worker re-reads the job and asset from PostgreSQL
-> MediaJob RUNNING, attempts incremented
-> Supabase secret key signs a download for the private object
-> bytes stream to a temporary file, never into memory
-> ffprobe reads container and stream headers
-> metadata written to MediaAsset + MediaJob SUCCEEDED  (one transaction)
-> failure -> QUEUED while retries remain, FAILED when the budget is spent
```

## Why PostgreSQL owns the job state

Redis carries the message; PostgreSQL owns the truth. The queue payload holds identifiers only, so a replayed, delayed, or tampered message cannot resurrect deleted media or reach another organization's project — the worker re-reads the authoritative row and rejects a payload that disagrees with it.

The `(mediaAssetId, type)` unique index is the idempotency key. A repeated upload completion reuses the existing job rather than queueing a second one, and a job that already succeeded returns immediately when its message is replayed.

Because the row is written before the message is published, a queue outage cannot lose the record. Queueing failure never fails the upload the user just completed: the job is marked failed with a readable reason and the project page offers to analyze the video again.

## Retry semantics

`MEDIA_PROBE_ATTEMPTS` (default 3) is the budget, enforced by the worker against its own `attempts` counter rather than BullMQ internals. While attempts remain, a failed run returns the job to `QUEUED` — which is literally true during exponential backoff — and only a terminal outcome is recorded as `FAILED`. This keeps the "Retry analysis" action unambiguous: it acts only on a job that has genuinely stopped.

Input that can never become valid — a payload that does not match the stored row, media that was never verified as uploaded, a file larger than the processing limit — fails permanently through BullMQ's `UnrecoverableError` instead of consuming the retry budget.

## Security boundaries

- The worker holds `SUPABASE_SECRET_KEY`, which bypasses Storage row-level security. It exists only in the worker process, is never wired into an HTTP-facing module, and the configuration schema rejects a publishable key pasted in its place.
- The API reads only the non-secret probe settings. It is a queue producer and never registers a processor, so no analysis ever runs inside an HTTP request.
- Signed downloads are short-lived and minted per job from the stored object key. The browser never receives one.
- Downloads stream to a private temporary directory with a hard byte ceiling enforced during transfer, not only from the advertised `content-length`. The directory is removed in a `finally` block so a failed probe cannot leak media onto the worker's disk.
- ffprobe reads headers only. Media bytes never enter PostgreSQL, and the video is never loaded into memory.

## Provider and tooling boundaries

`@clipgenius/storage` defines `ServerObjectReader` as the server-side read boundary, separate from the browser's `DirectUploadStorage`. The worker's Supabase adapter implements it; a future R2 adapter can replace it without touching domain rules.

`@clipgenius/video` defines `VideoProbe` and ships `FfprobeVideoProbe`, backed by the platform ffprobe binary from `@ffprobe-installer/ffprobe`. No system FFmpeg installation is required, and `parseFfprobeOutput` is exported separately so container quirks — WebM omitting a format-level duration, an unknown `0/0` frame rate — are covered by tests without spawning a process.

## Deployment requirements

The worker is a separate process (`apps/worker`) and needs:

- `DATABASE_URL` for the same PostgreSQL database as the API;
- `REDIS_URL` as a plain Redis TCP endpoint — an HTTP REST proxy will not work, because BullMQ speaks the Redis protocol;
- `SUPABASE_URL` and `SUPABASE_SECRET_KEY`; and
- enough temporary disk for `MEDIA_PROBE_CONCURRENCY` × `MEDIA_PROBE_MAX_BYTES`.

Neither the Redis endpoint nor the secret key is ever exposed to the browser.
