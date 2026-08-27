import {
  parseAuthEnvironment,
  parseStorageEnvironment,
} from '@clipgenius/config';
import { Module } from '@nestjs/common';

import { SupabaseDirectUploadStorage } from './supabase-direct-upload.storage.js';

export const DIRECT_UPLOAD_STORAGE = Symbol('DIRECT_UPLOAD_STORAGE');

@Module({
  exports: [DIRECT_UPLOAD_STORAGE],
  providers: [
    {
      provide: DIRECT_UPLOAD_STORAGE,
      useFactory: (): SupabaseDirectUploadStorage => {
        const auth = parseAuthEnvironment(process.env);
        const storage = parseStorageEnvironment(process.env);
        return new SupabaseDirectUploadStorage(
          auth.SUPABASE_URL,
          auth.SUPABASE_PUBLISHABLE_KEY,
          storage.SOURCE_VIDEO_BUCKET,
        );
      },
    },
  ],
})
export class StorageModule {}
