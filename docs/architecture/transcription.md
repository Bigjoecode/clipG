# Transcription Architecture

## Scope

Task 007 turns an analyzed source video into durable full text and timestamped
speaker segments. It does not perform content intelligence, opportunity scoring,
editing, rendering, or publishing.

## Flow

```text
User -> Next.js server action -> NestJS API
  -> PostgreSQL TRANSCRIPTION job -> Redis / BullMQ
  -> worker -> private Supabase source stream
  -> temporary source file -> FFmpeg mono speech MP3
  -> TranscriptionProvider -> validated diarized result
  -> PostgreSQL transcript + segments + SUCCEEDED job
```

The API checks live organization membership, project ownership, verified upload
status, successful probing, and `hasAudio` before creating intent. It never
downloads media or calls an AI provider. Redis is transport; PostgreSQL remains
the durable job and result record.

## Media handling

The worker obtains a short-lived server-side download URL and streams the source
to a per-job temporary directory. FFmpeg extracts one 16 kHz mono MP3 at 64 kbps
with video disabled. The source is never buffered wholesale in memory, only the
smaller provider upload is sent, and both temporary files are removed in a
`finally` block. Configured source, extracted-audio, and execution limits bound
disk, provider, and denial-of-service exposure.

## Provider boundary

`@clipgenius/ai` owns `TranscriptionProvider`; the worker depends on that
contract rather than the OpenAI SDK. The initial adapter uses
`gpt-4o-transcribe-diarize` with `diarized_json` and automatic chunking. Provider
data is untrusted and must pass a Zod schema before it can enter the domain.
OpenAI retries are disabled in the SDK because BullMQ owns the visible retry
budget and job state.

`OPENAI_API_KEY` exists only in the worker environment. It must never be exposed
through a `NEXT_PUBLIC_` variable, browser bundle, API response, log, or committed
file.

## Idempotency and failure behavior

`(mediaAssetId, TRANSCRIPTION)` is the durable idempotency key and also supplies
the stable BullMQ job id. Repeated requests return an existing queued, running,
or successful job. A failed job may be reset and queued again. On successful
delivery, one database transaction upserts the transcript, replaces its ordered
segments, and marks the job successful.

Transient storage and provider failures are retried with exponential backoff.
Invalid queue data, missing audio, oversize extracted audio, extraction errors,
and authentication errors are terminal. Transport errors and schema-invalid
provider output retry within the bounded queue budget. A terminal or exhausted
job records a safe failure reason for the UI while detailed context is logged by
the worker.

## Read path

The transcript endpoint re-authorizes membership and media ownership, then
returns canonical text and segments ordered by index. Project UI exposes clear
waiting, transcribing, completed, and retry states and links to a dedicated
timestamped transcript page. Direct browser access to transcript tables is not
part of this architecture.
