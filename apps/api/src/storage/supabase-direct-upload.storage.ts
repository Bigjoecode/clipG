import { createClient } from '@supabase/supabase-js';

import type {
  CreateDirectUploadInput,
  DirectUploadObjectInfo,
  DirectUploadStorage,
  DirectUploadTarget,
} from '@clipgenius/storage';

const signedUploadLifetimeMilliseconds = 2 * 60 * 60 * 1_000;
const tusChunkSizeBytes = 6 * 1024 * 1024;

export class StorageProviderError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'StorageProviderError';
  }
}

function statusCode(error: object): number | null {
  if (!('statusCode' in error)) {
    return null;
  }
  const value = error.statusCode;
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

export class SupabaseDirectUploadStorage implements DirectUploadStorage {
  private readonly resumableEndpoint: string;

  public constructor(
    private readonly supabaseUrl: string,
    private readonly publishableKey: string,
    private readonly bucket: string,
  ) {
    const url = new URL(supabaseUrl);
    const projectReference = url.hostname.endsWith('.supabase.co')
      ? url.hostname.slice(0, -'.supabase.co'.length)
      : null;
    this.resumableEndpoint =
      projectReference === null
        ? `${url.origin}/storage/v1/upload/resumable`
        : `https://${projectReference}.storage.supabase.co/storage/v1/upload/resumable`;
  }

  public async createUploadTarget(
    input: CreateDirectUploadInput,
  ): Promise<DirectUploadTarget> {
    const client = this.userClient(input.accessToken);
    const { data, error } = await client.storage
      .from(this.bucket)
      .createSignedUploadUrl(input.key, { upsert: false });
    if (error !== null) {
      throw new StorageProviderError(
        `Could not create the storage upload target: ${error.message}`,
      );
    }

    return {
      bucket: this.bucket,
      chunkSizeBytes: tusChunkSizeBytes,
      endpoint: this.resumableEndpoint,
      expiresAt: new Date(Date.now() + signedUploadLifetimeMilliseconds),
      key: input.key,
      token: data.token,
    };
  }

  public async getObjectInfo(
    accessToken: string,
    key: string,
  ): Promise<DirectUploadObjectInfo | null> {
    const client = this.userClient(accessToken);
    const { data, error } = await client.storage.from(this.bucket).info(key);
    if (error !== null) {
      if (statusCode(error) === 404) {
        return null;
      }
      throw new StorageProviderError(
        `Could not verify the stored object: ${error.message}`,
      );
    }
    return {
      contentType: data.contentType ?? null,
      sizeBytes: data.size ?? 0,
    };
  }

  private userClient(accessToken: string) {
    return createClient(this.supabaseUrl, this.publishableKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
  }
}
