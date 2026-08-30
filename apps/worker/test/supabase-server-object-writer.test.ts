import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storageMocks = vi.hoisted(() => {
  const upload =
    vi.fn<
      (
        key: string,
        body: NodeJS.ReadableStream,
        options: { contentType: string; duplex: string; upsert: boolean },
      ) => Promise<{ data: null; error: { message: string } | null }>
    >();
  return {
    from: vi.fn<(bucket: string) => { upload: typeof upload }>(),
    upload,
  };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    storage: { from: storageMocks.from },
  })),
}));

import {
  StorageWriteError,
  SupabaseServerObjectWriter,
} from '../src/storage/supabase-server-object-writer.js';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('SupabaseServerObjectWriter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageMocks.from.mockReturnValue({ upload: storageMocks.upload });
    storageMocks.upload.mockResolvedValue({ data: null, error: null });
  });

  it('streams a render to its stable object key with retry-safe replacement', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'clipgenius-writer-'));
    directories.push(directory);
    const path = join(directory, 'output.mp4');
    await writeFile(path, Buffer.from('rendered-video'));
    const writer = new SupabaseServerObjectWriter(
      'https://project.supabase.co',
      'sb_secret_test_key_long_enough',
    );

    const stored = await writer.putFile({
      bucket: 'clipgenius-source-media',
      contentType: 'video/mp4',
      key: 'organizations/o/projects/p/renders/r/output.mp4',
      path,
    });

    expect(storageMocks.from).toHaveBeenCalledWith('clipgenius-source-media');
    const uploadCall = storageMocks.upload.mock.calls[0];
    expect(uploadCall?.[0]).toBe(
      'organizations/o/projects/p/renders/r/output.mp4',
    );
    expect(uploadCall?.[1]).toHaveProperty('pipe');
    expect(uploadCall?.[2]).toEqual({
      contentType: 'video/mp4',
      duplex: 'half',
      upsert: true,
    });
    expect(stored).toEqual({
      contentType: 'video/mp4',
      key: 'organizations/o/projects/p/renders/r/output.mp4',
      sizeBytes: 14,
    });
  });

  it('classifies a provider upload rejection', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'clipgenius-writer-'));
    directories.push(directory);
    const path = join(directory, 'output.mp4');
    await writeFile(path, Buffer.from('video'));
    storageMocks.upload.mockResolvedValueOnce({
      data: null,
      error: { message: 'bucket unavailable' },
    });
    const writer = new SupabaseServerObjectWriter(
      'https://project.supabase.co',
      'sb_secret_test_key_long_enough',
    );

    await expect(
      writer.putFile({
        bucket: 'clipgenius-source-media',
        contentType: 'video/mp4',
        key: 'renders/output.mp4',
        path,
      }),
    ).rejects.toEqual(
      new StorageWriteError(
        'Could not store rendered output: bucket unavailable',
      ),
    );
  });
});
