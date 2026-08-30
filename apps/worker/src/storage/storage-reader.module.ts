import {
  parseAuthEnvironment,
  parseMediaProcessingEnvironment,
  parseStorageEnvironment,
} from '@clipgenius/config';
import { Global, Module } from '@nestjs/common';

import { SupabaseServerObjectReader } from './supabase-server-object-reader.js';
import { SupabaseServerObjectWriter } from './supabase-server-object-writer.js';

export const SERVER_OBJECT_READER = Symbol('SERVER_OBJECT_READER');
export const SERVER_OBJECT_WRITER = Symbol('SERVER_OBJECT_WRITER');

@Global()
@Module({
  exports: [SERVER_OBJECT_READER, SERVER_OBJECT_WRITER],
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
    {
      provide: SERVER_OBJECT_WRITER,
      useFactory: (): SupabaseServerObjectWriter => {
        const auth = parseAuthEnvironment(process.env);
        const processing = parseMediaProcessingEnvironment(process.env);
        return new SupabaseServerObjectWriter(
          auth.SUPABASE_URL,
          processing.SUPABASE_SECRET_KEY,
        );
      },
    },
  ],
})
export class StorageReaderModule {}
