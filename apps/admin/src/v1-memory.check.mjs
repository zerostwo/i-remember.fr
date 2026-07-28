import assert from "node:assert/strict";
import { archiveV1Memory, syncV1Memory, v1MemoryPayload } from "./v1-memory.js";

const payload = v1MemoryPayload({
  id: 12,
  publicId: "m00000000000000000012",
  title: "Saved memory",
  author: "Ada",
  status: "published",
  bodyMarkdown: "# Saved\n\nBody",
  metadataJson: '{"mood":"quiet"}',
  imageKey: "photo-1",
  tags: "Paris, Archive",
});

assert.equal(payload.publicId, "m00000000000000000012");
assert.equal(payload.legacyId, undefined);
assert.equal(payload.status, "NORMAL");
assert.equal(payload.metadata.mood, "quiet");
assert.equal(payload.metadata.imageKey, "photo-1");
assert.equal(payload.metadata.isLongForm, false);
assert.deepEqual(payload.tags, ["Paris", "Archive"]);
assert.equal(payload.attachments[0].url, "/uploads/posts/photo-1/resized.jpg");
assert.equal(v1MemoryPayload({}).title, "");
assert.equal(v1MemoryPayload({}).content, "");
assert.equal(
  v1MemoryPayload({ title: "Long", bodyMarkdown: "x".repeat(221) }).metadata.isLongForm,
  true,
);
assert.equal(v1MemoryPayload({ status: "pending" }).status, "PENDING");
assert.equal(v1MemoryPayload({ status: "draft" }).status, "PENDING");
assert.equal(v1MemoryPayload({ status: "pending", dbStatus: "NORMAL" }).status, "PENDING");
assert.equal(v1MemoryPayload({ status: "published", dbStatus: "PENDING" }).status, "NORMAL");
assert.equal(v1MemoryPayload({ defaultLanguage: "zh" }).metadata.language, "zh");

const patchedCalls = [];
const patched = await syncV1Memory(async (path, options = {}) => {
  patchedCalls.push({ path, options });
  if (path === "/api/v1/memories/m00000000000000000012" && !options.method) {
    return { id: "m00000000000000000012" };
  }
  return { id: "pub_existing" };
}, payload);

assert.equal(patched.id, "pub_existing");
assert.equal(patchedCalls[0].path, "/api/v1/memories/m00000000000000000012");
assert.equal(patchedCalls[1].options.method, "PATCH");
assert.equal(JSON.parse(patchedCalls[1].options.body).publicId, undefined);
assert.equal(JSON.parse(patchedCalls[1].options.body).legacyId, undefined);

const createdCalls = [];
await syncV1Memory(
  async (path, options = {}) => {
    createdCalls.push({ path, options });
    if (path === "/api/v1/memories/m00000000000000000013") throw new Error("not found");
    if (options.method === "POST") return { id: "pub_created" };
    return { id: "pub_created", status: "NORMAL" };
  },
  { ...payload, publicId: "m00000000000000000013" },
);

assert.equal(createdCalls[1].options.method, "POST");
assert.equal(JSON.parse(createdCalls[1].options.body).publicId, "m00000000000000000013");
assert.equal(JSON.parse(createdCalls[1].options.body).legacyId, undefined);
assert.equal(createdCalls[2].options.method, "PATCH");
assert.equal(JSON.parse(createdCalls[2].options.body).publicId, undefined);
assert.equal(JSON.parse(createdCalls[2].options.body).legacyId, undefined);

const defaultLanguageCalls = [];
const pending = await syncV1Memory(
  async (path, options = {}) => {
    defaultLanguageCalls.push({ path, options });
    if (path === "/api/v1/settings") return { defaultLanguage: "zh" };
    return { id: "pub_pending", status: "PENDING" };
  },
  {
    title: "Pending",
    content: "Not published yet",
    status: "pending",
    language: "en",
    metadata: {},
  },
);

assert.equal(pending.status, "PENDING");
assert.equal(defaultLanguageCalls[0].path, "/api/v1/settings");
assert.equal(defaultLanguageCalls[1].path, "/api/v1/memories");
assert.equal(JSON.parse(defaultLanguageCalls[1].options.body).status, "PENDING");
assert.equal(JSON.parse(defaultLanguageCalls[1].options.body).metadata.language, "zh");
assert.equal(defaultLanguageCalls.length, 2);

const archivedCalls = [];
await archiveV1Memory(
  async (path, options = {}) => {
    archivedCalls.push({ path, options });
    if (path === "/api/v1/memories/m00000000000000000014") return { id: "pub_archived" };
    return { id: "pub_archived", status: "ARCHIVED" };
  },
  { publicId: "m00000000000000000014" },
);

assert.equal(archivedCalls[1].path, "/api/v1/memories/pub_archived");
assert.equal(archivedCalls[1].options.method, "DELETE");
console.log("admin v1 memory sync ok");
