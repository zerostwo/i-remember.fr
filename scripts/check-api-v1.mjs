import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = await mkdtemp(join(tmpdir(), "i-remember-api-v1-"));
process.env.I_REMEMBER_DATA_DIR = dataDir;
process.env.I_REMEMBER_SEED_ARCHIVE_DATA = "true";
process.env.I_REMEMBER_SEED_STARTER_CONTENT = "false";

let server;

try {
  const { createRevivalMiddleware } = await import("../src/server/revival.js");
  const middleware = createRevivalMiddleware();

  server = createServer((req, res) => {
    middleware(req, res, () => {
      res.statusCode = 404;
      res.end("not found");
    });
  });

  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  async function getJson(path) {
    const response = await fetch(`${baseUrl}${path}`);
    assert.equal(response.status, 200, `${path} status`);
    const body = await response.json();
    assert.equal(body.success, true, `${path} success`);
    return body;
  }

  const memories = await getJson("/api/v1/memories");
  assert.ok(Array.isArray(memories.data), "memories data is an array");
  assert.ok(memories.data.length > 0, "seeded memories are listed");
  assert.equal(typeof memories.data[0].id, "string", "memory id is public string");

  const search = await getJson("/api/v1/search?q=memory");
  assert.ok(Array.isArray(search.data), "search data is an array");

  const one = await getJson(`/api/v1/memories/${encodeURIComponent(memories.data[0].id)}`);
  assert.equal(one.data.id, memories.data[0].id, "single memory can be read");

  console.log("api-v1 ok");
} finally {
  if (server?.listening) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
  await rm(dataDir, { recursive: true, force: true });
}
