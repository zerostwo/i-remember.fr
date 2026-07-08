import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RevivalSQLiteStore } from "./sqlite-store.js";

const dataDir = await mkdtemp(join(tmpdir(), "i-remember-store-"));
const store = new RevivalSQLiteStore({ dataDir });

try {
  const saved = store.upsertMemory({
    uid: "mem_test_1",
    legacy_id: 1,
    public_id: "pub_test_1",
    language_code: "en",
    name: "Ada",
    text: "Body",
    title: "Metadata memory",
    metadata_json: "{\"mood\":\"quiet\"}",
  });
  const found = store.getMemoryByRowId(saved.id);
  assert.equal(found.metadata_json, "{\"mood\":\"quiet\"}");
  console.log("sqlite store ok");
} finally {
  store.close();
  await rm(dataDir, { recursive: true, force: true });
}
