import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

function safeKey(key) {
  const parts = String(key || "")
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean);
  if (!parts.length || parts.some((part) => part === "." || part === "..")) {
    throw new Error("Invalid storage key");
  }
  return parts.join("/");
}

export function createLocalStorage({ rootDir, publicBaseUrl = "/uploads" }) {
  if (!rootDir) throw new Error("rootDir is required");

  return {
    async upload(key, data) {
      const name = safeKey(key);
      const path = join(rootDir, name);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, data);
      return this.getUrl(name);
    },
    async delete(key) {
      await rm(join(rootDir, safeKey(key)), { force: true });
    },
    getUrl(key) {
      return `${publicBaseUrl.replace(/\/+$/g, "")}/${safeKey(key).replace(/\\/g, "/")}`;
    },
  };
}

export function createS3Storage({ client, bucket, publicBaseUrl = "" }) {
  if (!client) throw new Error("client is required");
  if (!bucket) throw new Error("bucket is required");

  return {
    async upload(key, data, options = {}) {
      const name = safeKey(key);
      await client.putObject({
        Bucket: bucket,
        Key: name,
        Body: data,
        ContentType: options.contentType,
      });
      return this.getUrl(name);
    },
    async delete(key) {
      await client.deleteObject({
        Bucket: bucket,
        Key: safeKey(key),
      });
    },
    getUrl(key) {
      const name = safeKey(key).replace(/\\/g, "/");
      return publicBaseUrl
        ? `${publicBaseUrl.replace(/\/+$/g, "")}/${name}`
        : `s3://${bucket}/${name}`;
    },
  };
}
