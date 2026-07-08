import assert from "node:assert/strict";
import { mergeV1Dashboard } from "./v1-dashboard.js";

const merged = mergeV1Dashboard(
  { counts: { pendingMemory: 1, menuItems: 2 } },
  {
    pendingMemories: 3,
    publishedMemories: 4,
    archivedMemories: 5,
    rejectedMemories: 6,
    totalUsers: 7,
  },
);

assert.equal(merged.counts.pendingMemory, 3);
assert.equal(merged.counts.publishedMemory, 4);
assert.equal(merged.counts.menuItems, 2);
assert.equal(merged.counts.users, 7);
console.log("admin v1 dashboard merge ok");
