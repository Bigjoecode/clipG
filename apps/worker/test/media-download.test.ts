import { readFile, stat } from 'node:fs/promises';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  MediaDownloadError,
  discardTemporaryMedia,
  downloadToTemporaryFile,
} from '../src/media/media-download.js';

function streamOf(chunks: readonly string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('downloadToTemporaryFile', () => {
  it('streams a stored object into a private temporary file', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('a tiny video'),
    );

    const media = await downloadToTemporaryFile(
      'https://storage.example/signed',
      'source.mp4',
      1_024,
    );

    try {
      expect(media.path).toMatch(/source\.mp4$/);
      await expect(readFile(media.path, 'utf8')).resolves.toBe('a tiny video');
    } finally {
      await discardTemporaryMedia(media);
    }
    await expect(stat(media.directory)).rejects.toThrow();
  });

  it('refuses a download whose declared length exceeds the limit', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('0123456789', {
        headers: { 'Content-Length': '10' },
      }),
    );

    await expect(
      downloadToTemporaryFile(
        'https://storage.example/signed',
        'source.mp4',
        4,
      ),
    ).rejects.toBeInstanceOf(MediaDownloadError);
  });

  it('stops a stream that outgrows the limit without a declared length', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(streamOf(['aaaa', 'bbbb', 'cccc'])),
    );

    await expect(
      downloadToTemporaryFile(
        'https://storage.example/signed',
        'source.mp4',
        6,
      ),
    ).rejects.toBeInstanceOf(MediaDownloadError);
  });

  it('reports a storage refusal as a download error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('forbidden', { status: 403 }),
    );

    await expect(
      downloadToTemporaryFile(
        'https://storage.example/signed',
        'source.mp4',
        1_024,
      ),
    ).rejects.toBeInstanceOf(MediaDownloadError);
  });

  it('reports an unreachable storage host as a download error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(
      new TypeError('fetch failed'),
    );

    await expect(
      downloadToTemporaryFile(
        'https://storage.example/signed',
        'source.mp4',
        1_024,
      ),
    ).rejects.toBeInstanceOf(MediaDownloadError);
  });
});
