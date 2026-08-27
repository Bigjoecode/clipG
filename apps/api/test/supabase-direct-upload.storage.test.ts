import { beforeEach, describe, expect, it, vi } from 'vitest';

const storageMocks = vi.hoisted(() => ({
  createSignedUploadUrl: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        createSignedUploadUrl: storageMocks.createSignedUploadUrl,
      })),
    },
  })),
}));

import { SupabaseDirectUploadStorage } from '../src/storage/supabase-direct-upload.storage.js';

describe('SupabaseDirectUploadStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('targets the signed TUS endpoint with the generated upload token', async () => {
    storageMocks.createSignedUploadUrl.mockResolvedValueOnce({
      data: {
        path: 'source/video.mp4',
        signedUrl:
          'https://project.supabase.co/storage/v1/object/upload/sign/source/video.mp4?token=header.payload.signature',
        token: 'header.payload.signature',
      },
      error: null,
    });
    const storage = new SupabaseDirectUploadStorage(
      'https://project.supabase.co',
      'sb_publishable_test_key_long_enough',
      'clipgenius-source-media',
    );

    const target = await storage.createUploadTarget({
      accessToken: 'user-access-token',
      contentType: 'video/mp4',
      key: 'source/video.mp4',
    });

    expect(target).toMatchObject({
      endpoint:
        'https://project.storage.supabase.co/storage/v1/upload/resumable/sign',
      token: 'header.payload.signature',
    });
    expect(storageMocks.createSignedUploadUrl).toHaveBeenCalledWith(
      'source/video.mp4',
      { upsert: false },
    );
  });
});
