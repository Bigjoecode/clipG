import { createClient } from '@supabase/supabase-js';

import type { ServerObjectReader, SignedDownload } from '@clipgenius/storage';

export class StorageReadError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'StorageReadError';
  }
}

/**
 * Reads private source media with the Supabase secret key. The key bypasses
 * Storage row-level security, so this adapter exists only inside the worker and
 * is never wired into an HTTP-facing module.
 */
export class SupabaseServerObjectReader implements ServerObjectReader {
  // Inferred rather than annotated: the client's generic parameters come from
  // the call itself, and restating them drifts with the SDK.
  private readonly client: ReturnType<typeof createClient>;

  public constructor(
    supabaseUrl: string,
    secretKey: string,
    private readonly bucket: string,
  ) {
    this.client = createClient(supabaseUrl, secretKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    });
  }

  public async createSignedDownloadUrl(
    key: string,
    lifetimeSeconds: number,
  ): Promise<SignedDownload> {
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .createSignedUrl(key, lifetimeSeconds);
    if (error !== null) {
      throw new StorageReadError(
        `Could not sign a download for the stored object: ${error.message}`,
      );
    }
    return {
      expiresAt: new Date(Date.now() + lifetimeSeconds * 1_000),
      url: data.signedUrl,
    };
  }
}
