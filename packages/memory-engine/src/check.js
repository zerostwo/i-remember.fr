import assert from "node:assert/strict";
import { normalizeGalaxyMemories } from "./normalize.js";

const memories = normalizeGalaxyMemories([
  {
    public_id: "pub-1",
    legacy_id: 42,
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
]);

assert.equal(memories.length, 2);
assert.equal(memories[0].publicId, "pub-1");
assert.equal(memories[0].authorName, "Ada");
assert.equal(memories[0].latitude, 48.8566);
assert.equal(memories[1].title, "Second");
assert.equal(memories[1].imageUrl, "/uploads/second.jpg");

console.log("memory engine ok");
