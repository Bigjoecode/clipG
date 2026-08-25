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
