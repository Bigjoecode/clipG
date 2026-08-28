export interface StoredObject {
  readonly contentType: string;
  readonly key: string;
  readonly sizeBytes: number;
}

export interface PutObjectInput {
  readonly body: AsyncIterable<Uint8Array>;
  readonly contentType: string;
  readonly key: string;
}

export interface ObjectStorage {
  deleteObject(key: string): Promise<void>;
  getObject(key: string): Promise<AsyncIterable<Uint8Array>>;
  putObject(input: PutObjectInput): Promise<StoredObject>;
}

export interface CreateDirectUploadInput {
  readonly accessToken: string;
  readonly contentType: string;
  readonly key: string;
}

export interface DirectUploadTarget {
  readonly bucket: string;
  readonly chunkSizeBytes: number;
  readonly endpoint: string;
  readonly expiresAt: Date;
  readonly key: string;
  readonly token: string;
}

export interface DirectUploadObjectInfo {
  readonly contentType: string | null;
  readonly sizeBytes: number;
}

export interface DirectUploadStorage {
  createUploadTarget(
    input: CreateDirectUploadInput,
  ): Promise<DirectUploadTarget>;
  getObjectInfo(
    accessToken: string,
    key: string,
  ): Promise<DirectUploadObjectInfo | null>;
}

export interface SignedDownload {
  readonly url: string;
  readonly expiresAt: Date;
}

/**
 * Server-side read boundary for private objects. Only trusted background
 * services hold a credential able to satisfy this contract; the browser upload
 * path uses `DirectUploadStorage` instead.
 */
export interface ServerObjectReader {
  createSignedDownloadUrl(
    key: string,
    lifetimeSeconds: number,
  ): Promise<SignedDownload>;
}
