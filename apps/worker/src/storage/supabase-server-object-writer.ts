import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

import { createClient } from '@supabase/supabase-js';

import type {
  PutFileInput,
  ServerObjectWriter,
  StoredObject,
} from '@clipgenius/storage';

export class StorageWriteError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'StorageWriteError';
  }
}

export class SupabaseServerObjectWriter implements ServerObjectWriter {
  private readonly client: ReturnType<typeof createClient>;

  public constructor(supabaseUrl: string, secretKey: string) {
    this.client = createClient(supabaseUrl, secretKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    });
  }

  public async putFile(input: PutFileInput): Promise<StoredObject> {
    const details = await stat(input.path);
    if (!details.isFile() || details.size === 0) {
      throw new StorageWriteError('Rendered output is empty or missing.');
    }
    const stream = createReadStream(input.path);
    const { error } = await this.client.storage
      .from(input.bucket)
      .upload(input.key, stream, {
        contentType: input.contentType,
        duplex: 'half',
        // The key is unique to one immutable render intent. Upsert lets a retry
        // recover when upload succeeded but the database update did not.
        upsert: true,
      });
    if (error !== null) {
      throw new StorageWriteError(
        `Could not store rendered output: ${error.message}`,
      );
    }
    return {
      contentType: input.contentType,
      key: input.key,
      sizeBytes: details.size,
    };
  }
}
