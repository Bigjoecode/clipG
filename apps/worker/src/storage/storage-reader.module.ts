import {
  parseAuthEnvironment,
  parseMediaProcessingEnvironment,
  parseStorageEnvironment,
} from '@clipgenius/config';
import { Global, Module } from '@nestjs/common';

import { SupabaseServerObjectReader } from './supabase-server-object-reader.js';

export const SERVER_OBJECT_READER = Symbol('SERVER_OBJECT_READER');

@Global()
@Module({
  exports: [SERVER_OBJECT_READER],
  providers: [
    {
      provide: SERVER_OBJECT_READER,
      useFactory: (): SupabaseServerObjectReader => {
        const auth = parseAuthEnvironment(process.env);
        const storage = parseStorageEnvironment(process.env);
        const processing = parseMediaProcessingEnvironment(process.env);
        return new SupabaseServerObjectReader(
          auth.SUPABASE_URL,
          processing.SUPABASE_SECRET_KEY,
          storage.SOURCE_VIDEO_BUCKET,
        );
      },
    },
  ],
})
export class StorageReaderModule {}
