import assert from "node:assert/strict";
import { mergeV1Assets, v1AssetUploadPayload, v1AssetPreviewUrls } from "./v1-assets.js";

const merged = mergeV1Assets(
  {
    counts: { attachments: 1 },
    attachments: [
      { imageKey: "legacy", thumbUrl: "/uploads/legacy.jpg", resizedUrl: "/uploads/legacy.jpg" },
    ],
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
  metadata: { filename: "../new photo.JPG" },
});
console.log("admin v1 assets merge ok");

const shared = mergeV1Assets({ attachments: [], counts: {} }, [
  {
    id: "a",
    url: "/uploads/clip.mp4",
    type: "video/mp4",
    memoryId: "one",
    metadata: { duration: 3, posterUrl: "/uploads/poster.jpg" },
  },
  { id: "b", url: "/uploads/clip.mp4", type: "video/mp4", memoryId: "two" },
]);
assert.equal(shared.attachments.length, 1);
assert.deepEqual(shared.attachments[0].memoryIds, ["one", "two"]);
assert.equal(shared.attachments[0].metadata.duration, 3);
assert.equal(shared.attachments[0].type, "video/mp4");

const photo = { url: "/uploads/posts/revival-abc-123/crop-123.gif", type: "image/gif" };
assert.equal(v1AssetPreviewUrls(photo).preview, "/uploads/posts/revival-abc-123/full.jpg");
assert.equal(v1AssetPreviewUrls(photo).download, "/uploads/posts/revival-abc-123/full.jpg");
assert.deepEqual(v1AssetPreviewUrls({ ...photo, metadata: { livePhoto: true } }), {
  preview: "/uploads/posts/revival-abc-123/full.jpg",
  video: "/uploads/posts/revival-abc-123/video.mp4",
  download: "/uploads/posts/revival-abc-123/live-photo.zip",
});
assert.equal(v1AssetPreviewUrls({ url: "/uploads/admin/photo.png", type: "image/png" }).preview, "/uploads/admin/photo.png");
assert.equal(v1AssetPreviewUrls({ url: "/uploads/posts/revival-abc/video.mp4", type: "video/mp4" }).preview, "/uploads/posts/revival-abc/video.mp4");

assert.equal(mergeV1Assets({ counts: { attachments: 300 }, attachments: [{ url: "/uploads/admin/cached.jpg", resizedUrl: "/uploads/admin/cached.jpg" }] }, [{ id: "fresh", url: "/uploads/admin/fresh.jpg", type: "image/jpeg" }]).counts.attachments, 301, "A bounded cache must not replace the full library count");
