-- Supabase-specific provisioning for Task 005. Run after the portable Prisma
-- source-video migration. This file is idempotent and deliberately lives outside
-- Prisma because a normal PostgreSQL installation has no storage/auth schemas.

INSERT INTO storage.buckets (id, name, public, allowed_mime_types)
VALUES (
    'clipgenius-source-media',
    'clipgenius-source-media',
    false,
    ARRAY['video/mp4', 'video/quicktime', 'video/webm']::text[]
)
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.can_access_clipgenius_source_media(object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT (SELECT auth.uid()) IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.media_assets AS media
        INNER JOIN public.organization_memberships AS membership
          ON membership.organization_id = media.organization_id
        WHERE media.storage_provider = 'supabase'
          AND media.storage_bucket = 'clipgenius-source-media'
          AND media.storage_key = object_name
          AND membership.user_id = (SELECT auth.uid())
      );
$$;

REVOKE ALL ON FUNCTION private.can_access_clipgenius_source_media(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_access_clipgenius_source_media(text) TO authenticated;

DROP POLICY IF EXISTS "ClipGenius members can initiate source uploads" ON storage.objects;
CREATE POLICY "ClipGenius members can initiate source uploads"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'clipgenius-source-media'
    AND private.can_access_clipgenius_source_media(name)
);

DROP POLICY IF EXISTS "ClipGenius members can inspect source uploads" ON storage.objects;
CREATE POLICY "ClipGenius members can inspect source uploads"
ON storage.objects
FOR SELECT
TO authenticated
USING (
    bucket_id = 'clipgenius-source-media'
    AND private.can_access_clipgenius_source_media(name)
);
