export type StorageUploadOptions = {
  contentType?: string;
};

export type StorageAdapter = {
  upload(
    key: string,
    data: Buffer | Uint8Array | string,
    options?: StorageUploadOptions,
  ): Promise<string>;
  delete(key: string): Promise<void>;
  getUrl(key: string): string;
};

export function createLocalStorage(options: {
  rootDir: string;
  publicBaseUrl?: string;
}): StorageAdapter;

export function createS3Storage(options: {
  client: {
    putObject(input: {
      Bucket: string;
      Key: string;
      Body: Buffer | Uint8Array | string;
      ContentType?: string;
    }): Promise<unknown>;
    deleteObject(input: { Bucket: string; Key: string }): Promise<unknown>;
  };
  bucket: string;
  publicBaseUrl?: string;
}): StorageAdapter;
