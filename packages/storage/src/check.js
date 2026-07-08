import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalStorage, createS3Storage } from "./index.js";

const rootDir = await mkdtemp(join(tmpdir(), "i-remember-storage-"));

try {
  const local = createLocalStorage({ rootDir, publicBaseUrl: "/files" });
  assert.equal(await local.upload("nested/a.txt", Buffer.from("ok")), "/files/nested/a.txt");
  assert.equal(await readFile(join(rootDir, "nested/a.txt"), "utf8"), "ok");
  assert.throws(() => local.getUrl("../../secret.txt"), /Invalid storage key/);
  await local.delete("nested/a.txt");

  const calls = [];
  const s3 = createS3Storage({
    bucket: "archive",
    publicBaseUrl: "https://cdn.example.test",
    client: {
      async putObject(input) {
        calls.push(["put", input]);
      },
      async deleteObject(input) {
        calls.push(["delete", input]);
      },
    },
  });
  assert.equal(
    await s3.upload("image.jpg", Buffer.from("img"), { contentType: "image/jpeg" }),
    "https://cdn.example.test/image.jpg",
  );
  await s3.delete("image.jpg");
  assert.equal(calls[0][1].ContentType, "image/jpeg");
  assert.deepEqual(
    calls.map(([type]) => type),
    ["put", "delete"],
  );
  console.log("storage ok");
} finally {
  await rm(rootDir, { recursive: true, force: true });
}
