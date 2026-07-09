import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = await mkdtemp(join(tmpdir(), "i-remember-proxy-"));
const v1PublicId = "m11111111111111111111";
const v1SubmittedId = "m22222222222222222222";
const v1CreateBodies = [];
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
            metadata: { language: "en", imageKey: "revival-upload" },
            tags: [{ name: "Prisma", slug: "prisma" }],
            attachments: [],
            createdAt: "2026-07-09T00:00:00.000Z",
            updatedAt: "2026-07-09T00:00:00.000Z",
          },
        ],
      }),
    );
    return;
  }
  if (req.method === "GET" && req.url === `/api/v1/memories/${v1PublicId}`) {
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
          metadata: { language: "en", imageKey: "revival-upload" },
          tags: [{ name: "Prisma", slug: "prisma" }],
          attachments: [],
          createdAt: "2026-07-09T00:00:00.000Z",
          updatedAt: "2026-07-09T00:00:00.000Z",
        },
      }),
    );
    return;
  }
  if (req.method === "POST" && req.url === "/api/v1/memories") {
    const input = JSON.parse(body || "{}");
    v1CreateBodies.push(input);
    res.statusCode = 201;
    res.end(
      JSON.stringify({
        success: true,
        data: {
          id: v1SubmittedId,
          title: input.title,
          content: input.content,
          excerpt: input.content,
          authorName: input.authorName,
          visibility: "PUBLIC",
          status: "PENDING",
          metadata: input.metadata || {},
          tags: [],
          attachments: input.attachments || [],
          createdAt: "2026-07-09T00:00:00.000Z",
          updatedAt: "2026-07-09T00:00:00.000Z",
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

  const homeResponse = await fetch(`${baseUrl}/`);
  assert.equal(homeResponse.status, 200);
  assert.equal(homeResponse.headers.get("x-frame-options"), "SAMEORIGIN");

  const setupResponse = await fetch(`${baseUrl}/api/admin/setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@example.com", password: "correct horse battery staple" }),
  });
  assert.equal(setupResponse.status, 200);
  const adminCookie = setupResponse.headers.get("set-cookie")?.split(";")[0] || "";
  assert.match(adminCookie, /^i_remember_admin_session=/);

  const exportResponse = await fetch(`${baseUrl}/api/admin/export`, {
    headers: { Cookie: adminCookie },
  });
  assert.equal(exportResponse.status, 200);
  const exportBody = await exportResponse.json();
  assert.equal(exportBody.success, true);
  assert.equal(exportBody.data.format, "i-remember-admin-export-v1");
  assert.equal(exportBody.data.data.settings.account.email, "admin@example.com");

  const homeAfterSetupResponse = await fetch(`${baseUrl}/`);
  assert.equal(homeAfterSetupResponse.status, 200);
  const homeAfterSetupHtml = await homeAfterSetupResponse.text();
  assert.match(homeAfterSetupHtml, /Prisma public memory/);
  assert.match(homeAfterSetupHtml, new RegExp(`"public_id":"${v1PublicId}"`));

  const settingsResponse = await fetch(`${baseUrl}/api/admin/settings`, {
    method: "PUT",
    headers: {
      Cookie: adminCookie,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ defaultLanguage: "zh", anonymousSubmissions: true }),
  });
  assert.equal(settingsResponse.status, 200);

  const v1PublicMemoryResponse = await fetch(`${baseUrl}/memory/${v1PublicId}`);
  assert.equal(v1PublicMemoryResponse.status, 200);
  const v1PublicMemoryHtml = await v1PublicMemoryResponse.text();
  assert.match(v1PublicMemoryHtml, /Rendered from the v1 direct memory API/);
  assert.match(v1PublicMemoryHtml, new RegExp(`"public_id":"${v1PublicId}"`));

  const publicSubmissionResponse = await fetch(`${baseUrl}/api/post`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      name: "Visitor",
      message: "From public form into v1.",
    }),
  });
  assert.equal(publicSubmissionResponse.status, 200);
  const publicSubmissionBody = await publicSubmissionResponse.json();
  assert.equal(publicSubmissionBody.data.public_id, v1SubmittedId);
  assert.equal(publicSubmissionBody.data.status, "PENDING");
  assert.equal(v1CreateBodies[0].metadata.language, "zh");
  assert.equal(v1CreateBodies[0].metadata.source, "public-submission");

  const memoryResponse = await fetch(`${baseUrl}/api/admin/memories`, {
    method: "POST",
    headers: {
      Cookie: adminCookie,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: "Default language memory",
      bodyMarkdown: "# Default language memory\n\nStored through the configured content language.",
      status: "published",
    }),
  });
  assert.equal(memoryResponse.status, 200);
  const memoryBody = await memoryResponse.json();
  const memory = memoryBody.data;

  const publicMemoryResponse = await fetch(`${baseUrl}/memory/${memory.publicId}`);
  assert.equal(publicMemoryResponse.status, 200);
  const publicMemoryHtml = await publicMemoryResponse.text();
  assert.match(publicMemoryHtml, /var LANG = 'zh';/);
  assert.match(publicMemoryHtml, new RegExp(`"public_id":"${memory.publicId}"`));

  const frenchMemoryResponse = await fetch(`${baseUrl}/fr/memory/${memory.publicId}`);
  assert.equal(frenchMemoryResponse.status, 200);
  const frenchMemoryHtml = await frenchMemoryResponse.text();
  assert.match(frenchMemoryHtml, /var LANG = 'fr';/);
  assert.match(frenchMemoryHtml, new RegExp(`"public_id":"${memory.publicId}"`));

  const chineseMemoryResponse = await fetch(`${baseUrl}/zh/memory/${memory.publicId}`);
  assert.equal(chineseMemoryResponse.status, 200);
  const chineseMemoryHtml = await chineseMemoryResponse.text();
  assert.match(chineseMemoryHtml, /var LANG = 'zh';/);
  assert.match(chineseMemoryHtml, new RegExp(`"public_id":"${memory.publicId}"`));

  const numericMemoryResponse = await fetch(`${baseUrl}/memory/123456789`);
  assert.equal(numericMemoryResponse.status, 404);

  const response = await fetch(`${baseUrl}/api/v1/memories?status=PENDING`, {
    headers: { Authorization: "Bearer proxy-test" },
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.url, "/api/v1/memories?status=PENDING");
  assert.equal(body.auth, "Bearer proxy-test");

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
      headers: { Authorization: "Bearer proxy-test" },
    });
    assert.equal(adminOnlyApi.status, 200);
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
