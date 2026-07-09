import assert from "node:assert/strict";
import { mergeV1Assets, v1AssetDeletePath, v1AssetUploadPayload } from "./v1-assets.js";

const merged = mergeV1Assets(
  {
    counts: { attachments: 1 },
    attachments: [{ imageKey: "legacy", thumbUrl: "/uploads/legacy.jpg", resizedUrl: "/uploads/legacy.jpg" }],
  },
  [
    {
      id: "a1",
      memoryId: "pub_1",
      url: "/uploads/admin/new-photo.jpg",
      type: "image/jpeg",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    { id: "duplicate", url: "/uploads/legacy.jpg", type: "image/jpeg" },
  ],
);

assert.equal(merged.attachments.length, 2);
assert.equal(merged.counts.attachments, 2);
assert.equal(merged.attachments[1].imageKey, "admin/new-photo.jpg");
assert.equal(merged.attachments[1].storageType, "v1");
assert.equal(merged.attachments[1].memoryId, "pub_1");
assert.equal(v1AssetDeletePath(merged.attachments[1]), "/api/v1/assets/admin%2Fnew-photo.jpg");

const upload = v1AssetUploadPayload(
  { name: "../new photo.JPG", type: "image/jpeg" },
  "ZmFrZQ==",
  "pub_1",
  123,
);
assert.deepEqual(upload, {
  key: "admin/123-new-photo.JPG",
  memoryId: "pub_1",
  contentBase64: "ZmFrZQ==",
  contentType: "image/jpeg",
});
console.log("admin v1 assets merge ok");
