import assert from "node:assert/strict";
import { syncV1Memory, v1MemoryPayload } from "./v1-memory.js";

const payload = v1MemoryPayload({
  id: 12,
  title: "Saved memory",
  author: "Ada",
  status: "published",
  bodyMarkdown: "# Saved\n\nBody",
  imageKey: "photo-1",
  tags: "Paris, Archive",
});

assert.equal(payload.legacyId, 12);
assert.equal(payload.status, "NORMAL");
assert.deepEqual(payload.tags, ["Paris", "Archive"]);
assert.equal(payload.attachments[0].url, "/uploads/posts/photo-1/resized.jpg");

const patchedCalls = [];
const patched = await syncV1Memory(async (path, options = {}) => {
  patchedCalls.push({ path, options });
  if (path.startsWith("/api/v1/memories?")) return [{ id: "pub_existing" }];
  return { id: "pub_existing" };
}, { ...payload, legacyId: 12 });

assert.equal(patched.id, "pub_existing");
assert.equal(patchedCalls[1].options.method, "PATCH");

const createdCalls = [];
await syncV1Memory(async (path, options = {}) => {
  createdCalls.push({ path, options });
  if (path.startsWith("/api/v1/memories?")) return [];
  if (options.method === "POST") return { id: "pub_created" };
  return { id: "pub_created", status: "NORMAL" };
}, { ...payload, legacyId: 13 });

assert.equal(createdCalls[1].options.method, "POST");
assert.equal(createdCalls[2].options.method, "PATCH");
console.log("admin v1 memory sync ok");
