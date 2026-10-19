import assert from "node:assert/strict";
import { appendV1Attachment, archiveV1Memory, syncV1Memory, v1MemoryPayload } from "./v1-memory.js";
import { collectPages } from "./pagination.js";
const id = "m11111111111111111111";
const attachments = [
  { id: "asset-png", url: "/a.png", type: "image/png", metadata: { caption: "First" } },
  { id: "asset-pdf", url: "/b.pdf", type: "application/pdf" },
];
for (const visibility of ["PRIVATE", "UNLISTED", "PUBLIC"]) {
  const payload = v1MemoryPayload({
    publicId: id,
    title: "Edited",
    bodyMarkdown: "New content",
    visibility,
    attachments,
  });
  assert.equal(payload.visibility, visibility);
  assert.equal(payload.attachments, undefined, "A text edit must omit attachment replacement");
}
assert.deepEqual(
  v1MemoryPayload({ publicId: id, attachments, attachmentsDirty: true }).attachments,
  attachments.map((a) => ({ ...a, metadata: a.metadata })),
);
assert.equal(v1MemoryPayload({ publicId: id }).visibility, undefined);
assert.equal(v1MemoryPayload({}).visibility, "PUBLIC");
assert.equal(v1MemoryPayload({ bodyMarkdown: "", content: "stale" }).content, "");
assert.equal(v1MemoryPayload({ author: "Edited", authorName: "Stale" }).authorName, "Edited");
assert.equal(v1MemoryPayload({ status: "pending", dbStatus: "NORMAL" }).status, "PENDING");
assert.equal(v1MemoryPayload({ status: "archived" }).status, "ARCHIVED");
assert.deepEqual(v1MemoryPayload({ tags: "旅行, 家人" }).tags, ["旅行", "家人"]);
assert.equal(v1MemoryPayload({ locationName: "  Groningen  ", metadata: { keep: true } }).metadata.locationName, "Groningen");
assert.equal(v1MemoryPayload({ locationName: "", metadata: { locationName: "Old place" } }).metadata.locationName, "");
assert.equal(v1MemoryPayload({ metadata: { locationName: "Preserved" } }).metadata.locationName, "Preserved");
const calls = [];
await syncV1Memory(
  async (path, options = {}) => {
    calls.push({ path, ...options });
    return path.endsWith("settings") ? { defaultLanguage: "zh" } : { id };
  },
  { publicId: id, title: "Existing", bodyMarkdown: "New", visibility: "PRIVATE" },
);
assert.equal(calls.length, 2);
assert.equal(calls[1].method, "PATCH");
assert.equal(JSON.parse(calls[1].body).publicId, undefined);
assert.equal(JSON.parse(calls[1].body).metadata.language, "zh");
for (const [original, chosen, expectedMethod] of [[id, "first-snow", "PATCH"], ["", "rainbow", "POST"], ["", "", "POST"]]) {
  const linkCalls = [];
  await syncV1Memory(async (path, options = {}) => {
    linkCalls.push({ path, ...options });
    return path.endsWith("settings") ? { defaultLanguage: "en" } : { id: chosen };
  }, { publicId: original, linkId: chosen, title: "Short link", bodyMarkdown: "A moment" });
  assert.equal(linkCalls[1].method, expectedMethod);
  assert.equal(linkCalls[1].path, original ? `/api/v1/memories/${original}` : "/api/v1/memories");
  assert.equal(JSON.parse(linkCalls[1].body).publicId, chosen || undefined);
}
const failureCalls = [];
await assert.rejects(
  syncV1Memory(
    async (path, options = {}) => {
      failureCalls.push(options.method);
      if (path.endsWith("settings")) return {};
      throw new Error("404");
    },
    { publicId: id },
  ),
);
assert.deepEqual(
  failureCalls,
  [undefined, "PATCH"],
  "A failed update must never create a new record",
);
const archiveCalls = [];
await archiveV1Memory(async (path, options) => archiveCalls.push({ path, ...options }), {
  publicId: id,
});
assert.deepEqual(archiveCalls, [{ path: `/api/v1/memories/${id}`, method: "DELETE" }]);
const all = Array.from({ length: 405 }, (_, i) => ({ id: String(i) }));
let pages = 0;
const loaded = await collectPages(async (path) => {
  pages++;
  const cursor = Number(new URL(path, "http://local").searchParams.get("cursor") || 0);
  return {
    data: all.slice(cursor, cursor + 200),
    pagination: { nextCursor: cursor + 200 < all.length ? String(cursor + 200) : null },
  };
}, "/api/v1/memories?status=all");
assert.equal(pages, 3);
assert.deepEqual(loaded, all);
await assert.rejects(
  collectPages(async () => ({ data: [], pagination: { nextCursor: "same" } }), "/assets"),
  /did not advance/,
);
console.log("Admin visibility, attachments, save failure and complete pagination checks passed");

const originalGallery = [{ id: "photo", url: "/photo.jpg", type: "image/jpeg", metadata: { order: 4 } }];
const appended = appendV1Attachment(originalGallery, { url: "/audio.mp3", type: "audio/mpeg", metadata: { order: 0, duration: 30 } });
assert.equal(appended[0], originalGallery[0], "Adding audio retains existing attachment identity");
assert.equal(appended[1].metadata.order, 5, "New audio must follow existing gallery items");
assert.equal(appended[1].metadata.duration, 30);
assert.equal(appendV1Attachment(attachments, { type: "audio/mpeg" })[2].metadata.order, 2);
