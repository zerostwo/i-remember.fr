import assert from "node:assert/strict";
import { memoryFadePercent, normalizeGalaxyMemories, normalizeGalaxyPosts } from "./normalize.js";

const memories = normalizeGalaxyMemories([
  {
    public_id: "pub-1",
    name: "Ada",
    text: "I remember a precise coordinate.",
    latitude: "48.8566",
    longitude: "2.3522",
  },
  {
    publicId: "pub-1",
    title: "Duplicate should be ignored",
    latitude: "0",
    longitude: "0",
  },
  {
    id: "pub-2",
    title: "Second",
    content: "Another memory",
    attachments: [{ url: "/uploads/second.jpg", type: "image/jpeg" }],
  },
  { id: "empty", title: "Untitled memory", content: "" },
  { id: "placeholder", title: "Untitled memory", content: "# Untitled memory\n\nWrite this memory in Markdown." },
  { id: "draft", content: "Not public", status: "PENDING" },
]);

assert.equal(memories.length, 2);
assert.equal(memories[0].publicId, "pub-1");
assert.equal(memories[0].authorName, "Ada");
assert.equal(memories[0].latitude, 48.8566);
assert.equal(memories[1].title, "Second");
assert.equal(memories[1].imageUrl, "/uploads/second.jpg");

const posts = normalizeGalaxyPosts(memories);
assert.equal(posts.length, 2);
assert.equal(posts[0].id, "900000");
assert.equal(posts[0].public_id, "pub-1");
assert.equal(posts[0].name, "Ada");
assert.equal(posts[0].latitude, 48.8566);
assert.equal(posts[1].img, "revival-upload");
assert.equal(memoryFadePercent([], Date.parse("2026-07-10T00:00:00Z")), 100);
assert.ok(memoryFadePercent([
  { id: "recent", content: "A recent memory", createdAt: "2026-01-14T00:00:00Z" },
], Date.parse("2026-01-15T00:00:00Z")) < 75);

console.log("memory engine ok");
