import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = await mkdtemp(join(tmpdir(), "i-remember-proxy-"));
const v1PublicId = "m11111111111111111111";
const v1SubmittedId = "m22222222222222222222";
const v1MenuId = "menu-v1-about";
const v1CreateBodies = [];
const v1CreatedMemories = [];
let v1ViewCount = 0;
let v1Ready = true;
let v1Reachable = true;
async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

const upstream = createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
  }
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method === "GET" && req.url === "/readyz") {
    if (!v1Reachable) {
      req.socket.destroy();
      return;
    }
    res.statusCode = v1Ready ? 200 : 503;
    res.end(
      JSON.stringify({
        ok: v1Ready,
        service: "api",
        database: v1Ready ? "ready" : "unavailable",
      }),
    );
    return;
  }
  if (req.method === "GET" && req.url === "/api/v1/public/settings") {
    res.end(
      JSON.stringify({
        success: true,
        data: {
          defaultLanguage: "zh",
          anonymousSubmissions: true,
          tracking: {
            enabled: true,
            umamiSrc: "https://stats.example.test/script.js",
            umamiWebsiteId: "proxy-test-site",
          },
        },
      }),
    );
    return;
  }
  if (req.method === "GET" && req.url === "/api/v1/memories?limit=200") {
    res.end(
      JSON.stringify({
        success: true,
        data: [
          {
            id: v1PublicId,
            title: "Prisma public memory",
            content: "Rendered from the v1 public memory API.",
            excerpt: "Rendered from the v1 public memory API.",
            authorName: "Prisma",
            visibility: "PUBLIC",
            status: "NORMAL",
            metadata: { imageKey: "revival-upload" },
            tags: [{ name: "Prisma", slug: "prisma" }],
            attachments: [],
            createdAt: "2026-07-09T00:00:00.000Z",
            updatedAt: "2026-07-09T00:00:00.000Z",
          },
          ...v1CreatedMemories,
        ],
      }),
    );
    return;
  }
  if (
    (req.method === "GET" && req.url === `/api/v1/memories/${v1PublicId}`) ||
    (req.method === "POST" && req.url === `/api/v1/memories/${v1PublicId}/view`)
  ) {
    if (req.method === "POST") v1ViewCount += 1;
    res.end(
      JSON.stringify({
        success: true,
        data: {
          id: v1PublicId,
          title: "Prisma public memory",
          content: "Rendered from the v1 direct memory API.",
          excerpt: "Rendered from the v1 direct memory API.",
          authorName: "Prisma",
          visibility: "PUBLIC",
          status: "NORMAL",
          metadata: { imageKey: "revival-upload" },
          tags: [{ name: "Prisma", slug: "prisma" }],
          attachments: [],
          createdAt: "2026-07-09T00:00:00.000Z",
          updatedAt: "2026-07-09T00:00:00.000Z",
          viewCount: v1ViewCount,
        },
      }),
    );
    return;
  }
  if (req.method === "POST" && req.url === "/api/v1/memories") {
    const input = JSON.parse(body || "{}");
    v1CreateBodies.push(input);
    const createdMemory = {
      id: v1SubmittedId,
      title: input.title,
      content: input.content,
      excerpt: input.content,
      authorName: input.authorName,
      visibility: "PUBLIC",
      status: "NORMAL",
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      metadata: input.metadata || {},
      tags: [],
      attachments: input.attachments || [],
      createdAt: "2026-07-09T00:00:00.000Z",
      updatedAt: "2026-07-09T00:00:00.000Z",
    };
    v1CreatedMemories.push(createdMemory);
    res.statusCode = 201;
    res.end(
      JSON.stringify({
        success: true,
        data: createdMemory,
      }),
    );
    return;
  }
  if (req.method === "GET" && req.url === "/api/v1/public/menu?language=zh") {
    res.end(
      JSON.stringify({
        success: true,
        data: {
          language: "zh",
          items: [
            {
              id: v1MenuId,
              uid: "footer_v1_about",
              label: "V1 About",
              type: "PAGE",
              targetValue: "about",
              url: "",
              position: 10,
              isVisible: true,
              opensNewTab: false,
              metadata: {},
              createdAt: "2026-07-09T00:00:00.000Z",
              updatedAt: "2026-07-09T00:00:00.000Z",
            },
          ],
        },
      }),
    );
    return;
  }
  if (req.method === "GET" && req.url === `/api/v1/public/menu-target/${v1MenuId}?language=zh`) {
    res.end(
      JSON.stringify({
        success: true,
        data: {
          item: {
            id: v1MenuId,
            uid: "footer_v1_about",
            label: "V1 About",
            type: "PAGE",
            targetValue: "about",
            url: "",
            position: 10,
            isVisible: true,
            opensNewTab: false,
            metadata: {},
            createdAt: "2026-07-09T00:00:00.000Z",
            updatedAt: "2026-07-09T00:00:00.000Z",
          },
          page: {
            id: "page-v1-about",
            slug: "about",
            language: "zh",
            title: "V1 About Page",
            excerpt: "Footer page from v1.",
            bodyMarkdown: "# V1 About Page\n\nFooter page from v1.",
            status: "PUBLISHED",
            linkedMemoryId: "",
            metadata: {},
            createdAt: "2026-07-09T00:00:00.000Z",
            updatedAt: "2026-07-09T00:00:00.000Z",
          },
        },
      }),
    );
    return;
  }
  res.end(
    JSON.stringify({
      url: req.url,
      method: req.method,
      auth: req.headers.authorization || "",
      forwarded: req.headers.forwarded || "",
      forwardedFor: req.headers["x-forwarded-for"] || "",
      forwardedHost: req.headers["x-forwarded-host"] || "",
      forwardedPort: req.headers["x-forwarded-port"] || "",
      forwardedProto: req.headers["x-forwarded-proto"] || "",
      body,
    }),
  );
});

await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
const appPort = await freePort();
const upstreamPort = upstream.address().port;
const app = spawn(process.execPath, ["server.mjs"], {
  env: {
    ...process.env,
    HOST: "127.0.0.1",
    PORT: String(appPort),
    API_BASE_URL: `http://127.0.0.1:${upstreamPort}`,
    I_REMEMBER_DATA_DIR: dataDir,
    I_REMEMBER_DEFAULT_LANGUAGE: "en",
    I_REMEMBER_TRUST_PROXY: "false",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let output = "";
app.stdout.on("data", (chunk) => {
  output += chunk;
});
app.stderr.on("data", (chunk) => {
  output += chunk;
});

try {
  const baseUrl = `http://127.0.0.1:${appPort}`;
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/version`);
      ready = response.ok;
    } catch {
      ready = false;
    }
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(ready, true, output || "server did not start");

  const readyResponse = await fetch(`${baseUrl}/readyz`);
  assert.equal(readyResponse.status, 200);
  assert.deepEqual(await readyResponse.json(), {
    ok: true,
    service: "web",
    api: "ready",
    database: "ready",
  });
  v1Ready = false;
  const notReadyResponse = await fetch(`${baseUrl}/readyz`);
  assert.equal(notReadyResponse.status, 503);
  assert.deepEqual(await notReadyResponse.json(), {
    ok: false,
    service: "web",
    api: "ready",
    database: "unavailable",
  });
  const liveResponse = await fetch(`${baseUrl}/healthz`);
  assert.equal(liveResponse.status, 200);
  assert.deepEqual(await liveResponse.json(), { ok: true, service: "web" });
  v1Ready = true;
  v1Reachable = false;
  const unreachableResponse = await fetch(`${baseUrl}/readyz`);
  assert.equal(unreachableResponse.status, 503);
  assert.deepEqual(await unreachableResponse.json(), {
    ok: false,
    service: "web",
    api: "unavailable",
    database: "unknown",
  });
  v1Reachable = true;

  const homeResponse = await fetch(`${baseUrl}/`);
  assert.equal(homeResponse.status, 200);
  assert.equal(homeResponse.headers.get("x-frame-options"), "SAMEORIGIN");
  const contentSecurityPolicy = homeResponse.headers.get("content-security-policy") || "";
  assert.match(contentSecurityPolicy, /script-src[^;]*https:\/\/stats\.example\.test/);
  assert.match(contentSecurityPolicy, /connect-src[^;]*https:\/\/stats\.example\.test/);
  const homeHtml = await homeResponse.text();
  assert.match(homeHtml, /src="https:\/\/stats\.example\.test\/script\.js"/);
  assert.match(homeHtml, /data-website-id="proxy-test-site"/);

  const memoryEditorResponse = await fetch(
    `${baseUrl}/admin/memory/editor?id=${encodeURIComponent(v1PublicId)}`,
  );
  assert.equal(memoryEditorResponse.status, 200);
  assert.match(await memoryEditorResponse.text(), /<title>songqi\.org — Admin<\/title>/);

  const removedAdminResponse = await fetch(`${baseUrl}/api/admin/setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@example.com", password: "correct horse battery staple" }),
  });
  assert.equal(removedAdminResponse.status, 404);

  const homeAfterSetupResponse = await fetch(`${baseUrl}/`);
  assert.equal(homeAfterSetupResponse.status, 200);
  const homeAfterSetupHtml = await homeAfterSetupResponse.text();
  assert.match(homeAfterSetupHtml, /Prisma public memory/);
  assert.match(homeAfterSetupHtml, new RegExp(`"public_id":"${v1PublicId}"`));

  const menuResponse = await fetch(`${baseUrl}/api/public/menu`);
  assert.equal(menuResponse.status, 200);
  const menuBody = await menuResponse.json();
  assert.equal(menuBody.data.items[0].id, v1MenuId);
  assert.equal(menuBody.data.items[0].label, "V1 About");

  const menuTargetResponse = await fetch(`${baseUrl}/api/public/menu-target/${v1MenuId}`);
  assert.equal(menuTargetResponse.status, 200);
  const menuTargetBody = await menuTargetResponse.json();
  assert.equal(menuTargetBody.data.item.id, v1MenuId);
  assert.equal(menuTargetBody.data.page.title, "V1 About Page");
  assert.match(menuTargetBody.data.page.bodyHtml, /<h1>V1 About Page<\/h1>/);

  const v1PublicMemoryResponse = await fetch(`${baseUrl}/memory/${v1PublicId}`);
  assert.equal(v1PublicMemoryResponse.status, 200);
  const v1PublicMemoryHtml = await v1PublicMemoryResponse.text();
  assert.match(v1PublicMemoryHtml, /var LANG = 'zh';/);
  assert.match(v1PublicMemoryHtml, /Rendered from the v1 direct memory API/);
  assert.match(v1PublicMemoryHtml, new RegExp(`"public_id":"${v1PublicId}"`));

  const frenchV1PublicMemoryResponse = await fetch(`${baseUrl}/fr/memory/${v1PublicId}`);
  assert.equal(frenchV1PublicMemoryResponse.status, 404);

  const chineseV1PublicMemoryResponse = await fetch(`${baseUrl}/zh/memory/${v1PublicId}`);
  assert.equal(chineseV1PublicMemoryResponse.status, 404);
  assert.equal(v1ViewCount, 1);

  const englishV1PublicMemoryResponse = await fetch(`${baseUrl}/en/memory/${v1PublicId}`);
  assert.equal(englishV1PublicMemoryResponse.status, 404);
  assert.equal(v1ViewCount, 1);

  const frenchDisplayMemoryResponse = await fetch(`${baseUrl}/memory/${v1PublicId}?ln=fr`);
  assert.equal(frenchDisplayMemoryResponse.status, 200);
  assert.match(await frenchDisplayMemoryResponse.text(), /var LANG = 'fr';/);
  assert.equal(v1ViewCount, 2);

  const invalidOriginResponse = await fetch(`${baseUrl}/api/post`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: `${baseUrl}/not-an-origin`,
    },
    body: new URLSearchParams({
      name: "Blocked visitor",
      message: "This write must not pass origin validation.",
    }),
  });
  assert.equal(invalidOriginResponse.status, 403);

  const publicSubmissionResponse = await fetch(`${baseUrl}/api/post`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: baseUrl,
    },
    body: new URLSearchParams({
      name: "Visitor",
      message: "From public form into v1.",
      latitude: "31.2304",
      longitude: "121.4737",
    }),
  });
  assert.equal(publicSubmissionResponse.status, 200);
  const publicSubmissionBody = await publicSubmissionResponse.json();
  assert.equal(publicSubmissionBody.data.public_id, v1SubmittedId);
  assert.equal(publicSubmissionBody.data.status, "NORMAL");
  assert.equal(publicSubmissionBody.data.latitude, 31.2304);
  assert.equal(publicSubmissionBody.data.longitude, 121.4737);
  assert.equal(v1CreateBodies[0].latitude, 31.2304);
  assert.equal(v1CreateBodies[0].longitude, 121.4737);
  assert.equal(v1CreateBodies[0].metadata.language, "zh");
  assert.equal(v1CreateBodies[0].metadata.source, "public-submission");

  const publicSubmissionSearchResponse = await fetch(`${baseUrl}/api/search-posts/public`);
  assert.equal(publicSubmissionSearchResponse.status, 200);
  const publicSubmissionSearchBody = await publicSubmissionSearchResponse.json();
  assert.equal(
    publicSubmissionSearchBody.data.posts.some((post) => post.public_id === v1SubmittedId),
    true,
  );

  const numericMemoryResponse = await fetch(`${baseUrl}/memory/123456789`);
  assert.equal(numericMemoryResponse.status, 404);

  const response = await fetch(`${baseUrl}/api/v1/memories?status=PENDING`, {
    headers: {
      Authorization: "Bearer proxy-test",
      Forwarded: "for=198.51.100.10;host=attacker.example;proto=https",
      "X-Forwarded-For": "198.51.100.10",
      "X-Forwarded-Host": "attacker.example",
      "X-Forwarded-Port": "443",
      "X-Forwarded-Proto": "https",
    },
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.url, "/api/v1/memories?status=PENDING");
  assert.equal(body.auth, "Bearer proxy-test");
  assert.match(body.forwardedFor, /^(?:127\.0\.0\.1|::ffff:127\.0\.0\.1)$/);
  assert.equal(body.forwardedHost, `127.0.0.1:${appPort}`);
  assert.equal(body.forwardedProto, "http");
  assert.equal(body.forwarded, "");
  assert.equal(body.forwardedPort, "");

  const assetsResponse = await fetch(`${baseUrl}/api/v1/assets?limit=1`, {
    headers: { Authorization: "Bearer proxy-test" },
  });
  assert.equal(assetsResponse.status, 200);
  const assetsBody = await assetsResponse.json();
  assert.equal(assetsBody.url, "/api/v1/assets?limit=1");
  assert.equal(assetsBody.auth, "Bearer proxy-test");

  const uploadedAssetResponse = await fetch(`${baseUrl}/uploads/admin/new-photo.jpg`);
  assert.equal(uploadedAssetResponse.status, 200);
  const uploadedAssetBody = await uploadedAssetResponse.json();
  assert.equal(uploadedAssetBody.url, "/uploads/admin/new-photo.jpg");

  const publicUploadForm = new FormData();
  publicUploadForm.set(
    "file",
    new Blob(
      [
        await readFile(
          new URL("../public/uploads/posts/revival-upload/thumb.jpg", import.meta.url),
        ),
      ],
      { type: "image/jpeg" },
    ),
    "thumb.jpg",
  );
  const publicUploadResponse = await fetch(`${baseUrl}/api/upload-image`, {
    method: "POST",
    body: publicUploadForm,
  });
  assert.equal(publicUploadResponse.status, 200);
  const publicUploadBody = await publicUploadResponse.json();
  const publicUploadPreviewResponse = await fetch(
    `${baseUrl}/uploads/tmp/${publicUploadBody.data.fileId}/resized.jpg`,
  );
  assert.equal(publicUploadPreviewResponse.status, 200);
  assert.match(publicUploadPreviewResponse.headers.get("content-type") || "", /^image\//);

  const legacyUploadResponse = await fetch(`${baseUrl}/uploads/posts/revival-upload/thumb.jpg`);
  assert.equal(legacyUploadResponse.status, 200);
  assert.match(legacyUploadResponse.headers.get("content-type") || "", /^image\//);

  const agentResponse = await fetch(`${baseUrl}/api/v1/agent`, {
    method: "POST",
    headers: {
      Authorization: "Bearer proxy-test",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: "test" }),
  });
  assert.equal(agentResponse.status, 200);
  const agentBody = await agentResponse.json();
  assert.equal(agentBody.url, "/api/v1/agent");
  assert.equal(agentBody.method, "POST");
  assert.equal(agentBody.auth, "Bearer proxy-test");
  assert.equal(JSON.parse(agentBody.body).query, "test");

  const adminOnlyDataDir = await mkdtemp(join(tmpdir(), "i-remember-admin-only-"));
  const adminOnlyPort = await freePort();
  const adminOnlyApp = spawn(process.execPath, ["server.mjs"], {
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(adminOnlyPort),
      API_BASE_URL: `http://127.0.0.1:${upstreamPort}`,
      I_REMEMBER_ADMIN_ONLY: "true",
      I_REMEMBER_TRUST_PROXY: "true",
      I_REMEMBER_DATA_DIR: adminOnlyDataDir,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    const adminOnlyBaseUrl = `http://127.0.0.1:${adminOnlyPort}`;
    let adminReady = false;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      try {
        const response = await fetch(`${adminOnlyBaseUrl}/version`);
        adminReady = response.ok;
      } catch {
        adminReady = false;
      }
      if (adminReady) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(adminReady, true, "admin-only server did not start");
    assert.equal((await fetch(`${adminOnlyBaseUrl}/`)).status, 404);
    const adminShell = await fetch(`${adminOnlyBaseUrl}/admin`, { redirect: "manual" });
    assert.equal(adminShell.status, 200);
    const adminOnlyApi = await fetch(`${adminOnlyBaseUrl}/api/v1/memories`, {
      headers: {
        Authorization: "Bearer proxy-test",
        Forwarded: "for=203.0.113.8;host=attacker.example;proto=https",
        "X-Forwarded-For": "198.51.100.42, 127.0.0.1",
        "X-Forwarded-Host": "attacker.example",
        "X-Forwarded-Port": "443",
        "X-Forwarded-Proto": "https",
      },
    });
    assert.equal(adminOnlyApi.status, 200);
    const adminOnlyApiBody = await adminOnlyApi.json();
    assert.equal(adminOnlyApiBody.forwardedFor, "198.51.100.42");
    assert.equal(adminOnlyApiBody.forwardedHost, `127.0.0.1:${adminOnlyPort}`);
    assert.equal(adminOnlyApiBody.forwardedProto, "http");
    assert.equal(adminOnlyApiBody.forwarded, "");
    assert.equal(adminOnlyApiBody.forwardedPort, "");

    const invalidForwardedApi = await fetch(`${adminOnlyBaseUrl}/api/v1/memories`, {
      headers: {
        Authorization: "Bearer proxy-test",
        "X-Forwarded-For": "not-an-ip, 198.51.100.42",
      },
    });
    assert.equal(invalidForwardedApi.status, 200);
    const invalidForwardedBody = await invalidForwardedApi.json();
    assert.match(invalidForwardedBody.forwardedFor, /^(?:127\.0\.0\.1|::ffff:127\.0\.0\.1)$/);
  } finally {
    adminOnlyApp.kill("SIGTERM");
    await rm(adminOnlyDataDir, { recursive: true, force: true });
  }
  console.log("server api proxy ok");
} finally {
  app.kill("SIGTERM");
  upstream.close();
  await rm(dataDir, { recursive: true, force: true });
}
