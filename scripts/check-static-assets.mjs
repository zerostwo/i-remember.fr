import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { mkdtemp, readFile, rm, stat, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync, brotliDecompressSync } from "node:zlib";
import { serveAsset } from "../src/server/static-assets.js";
import { compressAssets } from "../src/server/asset-compression.js";

const directory = await mkdtemp(join(tmpdir(), "songqi-static-"));
const script = Buffer.from("const originalGalaxy = 'unchanged';\n".repeat(200));
const audio = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
await mkdir(join(directory, "assets"));
await writeFile(join(directory, "main.js"), script);
await writeFile(join(directory, "audio.mp3"), audio);
await writeFile(join(directory, "admin.html"), "<!doctype html><title>Current admin</title>");
await writeFile(join(directory, "assets/public-markdown.js"), script);
await writeFile(join(directory, "assets/main-Ab123456.js"), script);
await compressAssets(directory);
const server = createServer(async (req, res) => {
  const file = join(directory, new URL(req.url, "http://local").pathname);
  serveAsset(
    req,
    res,
    file,
    await stat(file),
    file.endsWith(".mp3") ? "audio/mpeg" : "text/javascript",
  );
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const get = (path, headers = {}, method = "GET") =>
  new Promise((resolve, reject) => {
    const req = request(base + path, { headers, method }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () =>
        resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }),
      );
      res.on("error", reject);
    });
    req.on("error", reject);
    req.end();
  });

try {
  const full = await get("/audio.mp3");
  assert.deepEqual(full.body, audio);
  for (const [range, expected] of [
    ["bytes=0-1", audio.subarray(0, 2)],
    ["bytes=-16", audio.subarray(-16)],
    ["bytes=250-99999", audio.subarray(250)],
    ["bytes=250-", audio.subarray(250)],
    ["bytes=-99999999999999999999999999", audio],
  ]) {
    const result = await get("/audio.mp3", { Range: range });
    assert.equal(result.status, 206, range);
    assert.deepEqual(result.body, expected, range);
    assert.equal(Number(result.headers["content-length"]), expected.length);
  }
  for (const range of ["bytes=256-", "bytes=-0", "bytes=9-1", "bytes=999999999999999999999999-"]) {
    const result = await get("/audio.mp3", { Range: range });
    assert.equal(result.status, 416);
    assert.equal(result.headers["content-range"], "bytes */256");
  }
  assert.equal((await get("/audio.mp3", { Range: "bytes=0-1,4-5" })).status, 200);
  const head = await get("/audio.mp3", { Range: "bytes=0-1" }, "HEAD");
  assert.equal(head.status, 200);
  assert.equal(Number(head.headers["content-length"]), audio.length);
  assert.equal(head.body.length, 0);
  assert.equal(
    (await get("/audio.mp3", { Range: "bytes=0-1", "If-Range": '"outdated"' })).status,
    200,
  );
  assert.equal(
    (await get("/audio.mp3", { Range: "bytes=0-1", "If-Range": full.headers["last-modified"] }))
      .status,
    206,
  );
  assert.equal((await get("/audio.mp3", { "If-None-Match": full.headers.etag })).status, 304);
  assert.equal(
    (await get("/audio.mp3", { "If-Modified-Since": full.headers["last-modified"] })).status,
    304,
  );
  assert.equal(
    (
      await get("/audio.mp3", {
        "If-None-Match": '"old"',
        "If-Modified-Since": full.headers["last-modified"],
      })
    ).status,
    200,
  );

  const identity = await get("/main.js");
  const br = await get("/main.js", { "Accept-Encoding": "gzip, br" });
  const gzip = await get("/main.js", { "Accept-Encoding": "gzip;q=1, br;q=0.5" });
  assert.equal(br.headers["content-encoding"], "br");
  assert.equal(gzip.headers["content-encoding"], "gzip");
  assert.deepEqual(brotliDecompressSync(br.body), script);
  assert.deepEqual(gunzipSync(gzip.body), script);
  assert.notEqual(br.headers.etag, identity.headers.etag);
  assert.equal(br.headers.vary, "Accept-Encoding");
  assert.equal((await get("/main.js", { "Accept-Encoding": "identity;q=0,*;q=0" })).status, 406);
  const onlyCompressed = await get("/main.js", {
    "Accept-Encoding": "br,identity;q=0",
    Range: "bytes=0-15",
  });
  assert.equal(onlyCompressed.status, 200);
  assert.deepEqual(brotliDecompressSync(onlyCompressed.body), script);
  assert.equal(
    (await get("/main.js", { "Accept-Encoding": "gzip;q=0.5,identity;q=1" })).headers[
      "content-encoding"
    ],
    undefined,
  );
  assert.equal(
    (await get("/main.js", { "Accept-Encoding": "br;q=0,gzip;q=0" })).headers["content-encoding"],
    undefined,
  );
  assert.equal(
    (await get("/main.js", { "Accept-Encoding": "br", "If-None-Match": br.headers.etag })).status,
    304,
  );
  const compressedRange = await get("/main.js", { "Accept-Encoding": "br", Range: "bytes=0-15" });
  assert.equal(compressedRange.headers["content-encoding"], undefined);
  assert.deepEqual(compressedRange.body, script.subarray(0, 16));
  for (const path of ["/admin.html", "/main.js", "/assets/public-markdown.js"]) {
    assert.match((await get(path)).headers["cache-control"], /must-revalidate/);
  }
  assert.match((await get("/assets/main-Ab123456.js")).headers["cache-control"], /immutable/);
  assert.equal((await readFile(join(directory, "main.js"))).equals(script), true);
  console.log(
    "Static delivery passed: suffix/clamped ranges, HEAD, conditional requests, byte-identical Brotli/gzip, and deployment cache policy",
  );
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
