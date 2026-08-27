# Source Video Upload Architecture

## Task 005 scope

Task 005 implements a real, project-scoped source-video upload path. It validates MP4, MOV, and WebM metadata; uploads bytes directly to private object storage; shows progress and completion feedback; verifies the stored object; and records immutable provenance in PostgreSQL.

It does not probe codecs, inspect duration or resolution, generate thumbnails, enqueue processing, transcribe, analyze, edit, or render video. Those operations belong to later milestones.

## Flow

```text
Authenticated browser
-> Server Action sends file metadata only
-> NestJS validates membership, project state, type, and size
-> API creates UPLOAD_PENDING MediaAsset
-> Supabase adapter returns a short-lived signed TUS target
-> Browser creates the upload through /storage/v1/upload/resumable/sign
-> Browser uploads 6 MB chunks directly to Supabase Storage
-> Browser reports percentage and retries interrupted chunks within the signed session
-> API reads object metadata through the authenticated Storage API
-> exact size/type match -> MediaAsset UPLOADED
-> mismatch -> MediaAsset FAILED
```

Neither Next.js nor NestJS receives the video body. PostgreSQL stores metadata and object identity, never media bytes.

## Security boundaries

- API authorization resolves organization membership and project identity before creating storage intent.
- Object names are generated from organization, project, and random media UUIDs. The user-provided filename is stored as display metadata and never used as a path.
- The private `clipgenius-source-media` bucket accepts only MP4, QuickTime/MOV, and WebM MIME types.
- Supabase Storage RLS permits insert/select only when the JWT user currently belongs to the organization owning the matching `MediaAsset` record.
- Signed targets expire after two hours. TUS upload URLs may be resumed according to provider limits.
- Upload paths are never overwritten; each attempt receives a new media UUID and storage key.
- Completion is idempotent and does not trust the browser's claim that upload succeeded.
- Exhausted browser retries mark the media record failed; a fresh attempt receives a fresh object identity rather than accidentally resuming into a different media record.

## Limits and provider boundary

`SOURCE_VIDEO_MAX_BYTES` defaults to 50 MiB to match the Supabase Free per-file limit. The application accepts a higher configured limit only up to 50 GiB, but the Supabase project-level limit must be raised separately before larger uploads work.

Supabase is the first provider, not a permanent domain dependency. `@clipgenius/storage` defines `DirectUploadStorage`; the API's Supabase adapter implements signed-target creation and metadata inspection. A future R2 adapter can implement the same product boundary without changing media ownership or API domain rules.

## Provisioning

The portable Prisma migration creates only application tables and enums. Supabase bucket and Storage RLS provisioning lives in `infrastructure/supabase/source-media.sql` because ordinary PostgreSQL does not contain Supabase's `storage` and `auth` schemas.
