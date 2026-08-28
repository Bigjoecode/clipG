import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export class MediaDownloadError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'MediaDownloadError';
  }
}

/**
 * Refuses to write more than `maxBytes` even if the server lies about, or omits,
 * `content-length`. Without this a hostile or corrupted object could fill the
 * worker's disk.
 */
function sizeGuard(maxBytes: number): Transform {
  let received = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.byteLength;
      if (received > maxBytes) {
        callback(
          new MediaDownloadError(
            `The stored object exceeds the ${maxBytes} byte processing limit.`,
          ),
        );
        return;
      }
      callback(null, chunk);
    },
  });
}

/**
 * Bridges the web stream returned by `fetch` to a Node readable without casting
 * between the two `ReadableStream` type families.
 */
async function* readChunks(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<Uint8Array> {
  const reader = body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        return;
      }
      if (value !== undefined) {
        yield value;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export interface DownloadedMedia {
  readonly directory: string;
  readonly path: string;
}

/**
 * Streams a signed object to a private temporary file. The bytes are never held
 * in memory, and the caller owns the returned directory: call `discard` in a
 * `finally` block so a failed probe cannot leak media onto the worker's disk.
 */
export async function downloadToTemporaryFile(
  url: string,
  fileName: string,
  maxBytes: number,
): Promise<DownloadedMedia> {
  const directory = await mkdtemp(join(tmpdir(), 'clipgenius-media-'));
  const path = join(directory, fileName);

  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    await discardTemporaryMedia({ directory, path });
    throw new MediaDownloadError(
      `Could not reach object storage: ${
        error instanceof Error ? error.message : 'unknown error'
      }`,
    );
  }

  if (!response.ok || response.body === null) {
    await discardTemporaryMedia({ directory, path });
    throw new MediaDownloadError(
      `Object storage refused the download with status ${response.status}.`,
    );
  }

  const declaredLength = Number.parseInt(
    response.headers.get('content-length') ?? '',
    10,
  );
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await discardTemporaryMedia({ directory, path });
    throw new MediaDownloadError(
      `The stored object exceeds the ${maxBytes} byte processing limit.`,
    );
  }

  try {
    await pipeline(
      Readable.from(readChunks(response.body)),
      sizeGuard(maxBytes),
      createWriteStream(path),
    );
  } catch (error) {
    await discardTemporaryMedia({ directory, path });
    throw error instanceof MediaDownloadError
      ? error
      : new MediaDownloadError(
          `The download did not complete: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
  }

  return { directory, path };
}

export async function discardTemporaryMedia(
  media: DownloadedMedia,
): Promise<void> {
  await rm(media.directory, { force: true, recursive: true });
}
