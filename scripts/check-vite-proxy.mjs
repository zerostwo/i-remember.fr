import assert from "node:assert/strict";
import { createServer as httpServer } from "node:http";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, preview } from "vite";
import { isApiProxyPath } from "../src/server/api-proxy-paths.js";

const fixtureDir = await mkdtemp(join(tmpdir(), "songqi-vite-proxy-"));
await writeFile(join(fixtureDir, "index.html"), "<!doctype html><title>Proxy fixture</title>");
const upstream = httpServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ path: req.url, ok: true, service: "api", database: "ready" }));
});
await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
process.env.API_BASE_URL = `http://127.0.0.1:${upstream.address().port}`;
const running = [];
try {
  for (const storageBase of ["/uploads", "/custom.media"]) {
    process.env.STORAGE_PUBLIC_BASE_URL = storageBase;
    const { default: config } = await import(`../vite.config.mjs?storage=${storageBase}`);
    const options = {
      ...config,
      configFile: false,
      logLevel: "error",
      build: { ...config.build, outDir: fixtureDir },
    };
    const dev = await createServer({
      ...options,
      server: { ...config.server, host: "127.0.0.1", port: 0 },
    });
    await dev.listen();
    running.push(() => dev.close());
    const devBase = `http://127.0.0.1:${dev.httpServer.address().port}`;
    for (const path of ["/admin/", "/admin/settings", "/admin/memory/editor"]) {
      const response = await fetch(devBase + path);
      const html = await response.text();
      assert.equal(response.status, 200);
      assert.match(html, /@vite\/client/, "Admin routes need Vite's HTML transform");
      assert.match(html, /@react-refresh/, "React refresh preamble must precede admin modules");
    }
    // Follow real transformed entry imports, rather than accepting a 200 HTML shell.
    const entry = await (await fetch(`${devBase}/apps/admin/src/main.jsx`)).text();
    const imports = [...entry.matchAll(/from\s+"([^"]+)"|import\s+"([^"]+)"/g)]
      .map((match) => match[1] || match[2])
      .filter((path) => path.startsWith("/"));
    assert.ok(imports.some((path) => path.includes("react")));
    assert.ok(imports.some((path) => path.includes("src/index.css")));
    for (const path of imports) {
      const response = await fetch(devBase + path);
      assert.equal(response.status, 200, `Blocked admin import: ${path}`);
      assert.match(response.headers.get("content-type"), /javascript|css/);
    }
    const productionPreview = await preview({
      ...options,
      preview: { ...config.preview, host: "127.0.0.1", port: 0 },
    });
    running.push(() => new Promise((resolve) => productionPreview.httpServer.close(resolve)));
    for (const server of [dev.httpServer, productionPreview.httpServer]) {
      const base = `http://127.0.0.1:${server.address().port}`;
      for (const path of ["/api/v1/auth/status", `${storageBase}/admin/photo.png?size=small`]) {
        const response = await fetch(base + path);
        assert.equal(response.status, 200);
        assert.equal(
          (await response.json()).path,
          path,
          "Vite must forward the original API/asset path",
        );
      }
      const ready = await fetch(`${base}/readyz`);
      assert.equal(ready.status, 200);
      assert.equal((await ready.json()).database, "ready");
      for (const path of ["/.env", "/data/private.json", "/db/private.json", "/AGENTS.md"]) {
        assert.equal((await fetch(base + path)).status, 404, `${path} must remain private`);
      }
      if (server === productionPreview.httpServer) {
        for (const path of ["/src/index.css", "/node_modules/.vite/deps/react.js"]) {
          assert.equal(
            (await fetch(base + path)).status,
            404,
            "Development exception leaked into preview",
          );
        }
      }
    }
  }
  assert.equal(isApiProxyPath("/uploads/posts/old/thumb.jpg", "/uploads"), false);
  assert.equal(isApiProxyPath("/uploads/tmp/new/resized.jpg", "/uploads"), false);
  assert.equal(isApiProxyPath("/api/v10", "/uploads"), false);
  assert.equal(isApiProxyPath("/customXmedia/admin/file", "/custom.media"), false);
  console.log(
    "Vite dev/preview HTTP checks passed: API, readiness, default/custom storage paths, and legacy upload exclusions",
  );
} finally {
  await Promise.all(running.map((close) => close()));
  await new Promise((resolve) => upstream.close(resolve));
  await rm(fixtureDir, { recursive: true, force: true });
}
