import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createVideoUploads, videoChunkBytes } from "../src/server/video-uploads.js";
import { uploadVideoFile } from "../packages/content/src/video-upload.js";
const root = await mkdtemp(join(tmpdir(), "songqi-video-parts-"));
const part = Buffer.alloc(videoChunkBytes, 17);
let processed = 0,
  currentTime = Date.now(),
  releaseProcessing;
const processingGate = new Promise((resolve) => {
  releaseProcessing = resolve;
});
const expectedHash = createHash("sha256").update(part).update("last").digest("hex");
const manager = createVideoUploads(
  root,
  async (result) => ({ ...result, attachment: { url: "/video.mp4" } }),
  {
    now: () => currentTime,
    processVideo: async (file, _root, reportProgress) => {
      reportProgress({ phase: "processing", stage: "transcoding", percent: 42 });
      processed++;
      assert.equal(
        createHash("sha256")
          .update(await readFile(file.path))
          .digest("hex"),
        expectedHash,
      );
      await processingGate;
      return { fileId: "revival-test", duration: 600 };
    },
  },
);
const originalFetch = globalThis.fetch;
try {
  await assert.rejects(manager.start(500 * 1024 * 1024 + 1), (e) => e.statusCode === 413);
  const boundary = await manager.start(500 * 1024 * 1024);
  await manager.cancel(boundary.id);
  const session = await manager.start(videoChunkBytes + 4);
  const other = await manager.start(1);
  await assert.rejects(manager.start(1), (e) => e.statusCode === 429);
  await assert.rejects(manager.append(session.id, 1, part), (e) => e.statusCode === 409);
  await assert.rejects(
    manager.append(session.id, 0, Buffer.from("short")),
    (e) => e.statusCode === 400,
  );
  assert.throws(
    () => manager.complete(session.id),
    (e) => e.statusCode === 409,
  );
  await manager.append(session.id, 0, part);
  await assert.rejects(manager.append(session.id, 0, part), (e) => e.statusCode === 409);
  await manager.append(session.id, 1, Buffer.from("last"));
  assert.equal(manager.complete(session.id).state, "processing");
  assert.equal(manager.complete(session.id).state, "processing");
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(manager.status(session.id).progress.percent, 42);
  releaseProcessing();
  for (
    let attempt = 0;
    attempt < 100 && manager.status(session.id).state === "processing";
    attempt++
  )
    await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(manager.status(session.id).result.duration, 600);
  assert.equal(processed, 1, "Repeated completion does not duplicate processing");
  await manager.cancel(session.id);
  currentTime += 31 * 60 * 1000;
  const fresh = await manager.start(1);
  assert.throws(
    () => manager.status(other.id),
    (e) => e.statusCode === 404,
  );
  await manager.cancel(fresh.id);
  assert.deepEqual(await readdir(`${root}.video-uploads`), []);

  // Exercise the shared browser uploader with an edge that rejects large bodies.
  let uploaded = 0,
    chunks = 0,
    deleted = 0;
  globalThis.fetch = async (url, options = {}) => {
    let data;
    if (options.method === "DELETE") {
      deleted++;
      return new Response("{}");
    }
    if (url === "/api/video-uploads") data = { id: "client-test", chunkBytes: videoChunkBytes };
    else if (options.method === "PUT") {
      assert.ok(options.body.size <= videoChunkBytes);
      uploaded += options.body.size;
      chunks++;
      data = {};
    } else data = { state: "complete", result: { attachment: { url: "/video.mp4" } } };
    return Response.json({ success: true, data });
  };
  const events = [];
  const result = await uploadVideoFile(new Blob([Buffer.alloc(101 * 1024 * 1024)]), { onProgress: (event) => events.push(event) });
  assert.equal(events[0].percent, 0);
  assert.equal(events.at(-1).phase, "complete");
  assert.equal(events.filter((event) => event.phase === "uploading").at(-1).loaded, 101 * 1024 * 1024);
  assert.equal(result.attachment.url, "/video.mp4");
  assert.equal(uploaded, 101 * 1024 * 1024);
  assert.equal(chunks, 13);
  assert.equal(deleted, 1);
  globalThis.fetch = async (url, options = {}) => {
    if (options.method === "DELETE") {
      deleted++;
      return new Response("{}");
    }
    if (url === "/api/video-uploads")
      return Response.json({ success: true, data: { id: "failure", chunkBytes: videoChunkBytes } });
    throw new Error("Connection lost");
  };
  await assert.rejects(uploadVideoFile(new Blob(["test"])), /Connection lost/);
  assert.equal(deleted, 2, "Failed uploads release their temporary session");
  console.log(
    "Video parts passed: 500 MB boundary, size/order validation, capacity, single async processing, expiry, 101 MB client transfer and failure cleanup",
  );
} finally {
  globalThis.fetch = originalFetch;
  releaseProcessing();
  await manager.close();
  await rm(root, { recursive: true, force: true });
  await rm(`${root}.video-uploads`, { recursive: true, force: true });
}
