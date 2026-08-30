import { assetKinds, mediaSources } from '@clipgenius/editing-language';
import { z } from 'zod';

export const storedRenderAssetSchema = z
  .object({
    assetId: z.uuid(),
    contentType: z.string().trim().min(1).max(100),
    durationMs: z.number().int().positive().optional(),
    kind: z.enum(assetKinds),
    sizeBytes: z.number().int().positive(),
    source: z.enum(mediaSources).exclude(['SOURCE_MEDIA']),
    storageBucket: z.string().trim().min(1).max(100),
    storageKey: z.string().trim().min(1).max(1_024),
  })
  .strict();

export const renderAssetManifestSchema = z
  .array(storedRenderAssetSchema)
  .max(100);

export type StoredRenderAsset = z.infer<typeof storedRenderAssetSchema>;
export type RenderAssetManifest = z.infer<typeof renderAssetManifestSchema>;
