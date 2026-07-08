import assert from "node:assert/strict";
import { mergeV1Assets } from "./v1-assets.js";

const merged = mergeV1Assets(
  {
    counts: { attachments: 1 },
    attachments: [{ imageKey: "legacy", thumbUrl: "/uploads/legacy.jpg", resizedUrl: "/uploads/legacy.jpg" }],
  },
  [
    {
      id: "a1",
      memoryId: "pub_1",
      url: "/uploads/new-photo.jpg",
      type: "image/jpeg",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    { id: "duplicate", url: "/uploads/legacy.jpg", type: "image/jpeg" },
  ],
);

assert.equal(merged.attachments.length, 2);
assert.equal(merged.counts.attachments, 2);
assert.equal(merged.attachments[1].imageKey, "new-photo.jpg");
assert.equal(merged.attachments[1].storageType, "v1");
assert.equal(merged.attachments[1].memoryId, "pub_1");
console.log("admin v1 assets merge ok");
