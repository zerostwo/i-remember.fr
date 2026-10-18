import assert from "node:assert/strict";
import sharp from "sharp";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRevivalMiddleware } from "../src/server/revival.js";

const dataDir = await mkdtemp(join(tmpdir(), "i-remember-proxy-"));
const v1PublicId = "m11111111111111111111";
const v1ChinesePublicId = "Ab3xY9qR";
const v1SubmittedId = "new-memory";
const v1MenuId = "menu-v1-about";
const v1CreateBodies = [];
const v1CreatedMemories = [];
let v1ViewCount = 0;
let siteDefaultLanguage = "zh";
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
          siteTitle: "Configured title",
          ownerName: "", ownerAlternateName: "", siteDescription: "A configured archive",
          canonicalUrl: "https://songqi.org",
          timezone: "Asia/Shanghai",
          defaultLanguage: siteDefaultLanguage,
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
          {
            id: v1ChinesePublicId,
            title: "Chinese memory on every UI language",
            content: "The display language must not select a separate content collection.",
            excerpt: "The display language must not select a separate content collection.",
            authorName: "Songqi",
            visibility: "PUBLIC",
            status: "NORMAL",
            metadata: { imageKey: "revival-upload", language: "zh" },
            tags: [],
            attachments: [],
            createdAt: "2021-01-01T00:00:00.000Z",
            updatedAt: "2021-01-01T00:00:00.000Z",
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
          title: "Prisma public memory & notes",
          content: "# Prisma public memory & notes\n\nRendered from the v1 direct memory API. **A & B**.",
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
  assert.match(homeHtml, /<title>Configured title<\/title>/);
  assert.ok(homeHtml.indexOf("window.SONGQI_SITE_SETTINGS=") < homeHtml.indexOf("js/revival-runtime.js"), "Configured default language must be available before runtime URL normalization");
  assert.match(homeHtml, /rel="canonical" href="https:\/\/songqi.org\/"/);
  assert.match(homeHtml, /src="\/assets\/public-markdown.js"/);
  assert.match(homeHtml, /name="description" content="A configured archive"/);
  const robots = await fetch(`${baseUrl}/robots.txt`);
  assert.match(await robots.text(), /Sitemap: https:\/\/songqi.org\/sitemap.xml/);
  const sitemap = await fetch(`${baseUrl}/sitemap.xml`);
  const xml = await sitemap.text();
  assert.equal(sitemap.status, 200);
  assert.match(xml, new RegExp(`/memory/${v1PublicId}`));
  assert.ok(!xml.includes("/admin"));
  const adminSeo = await fetch(`${baseUrl}/admin/login`);
  assert.equal(adminSeo.headers.get("x-robots-tag"), "noindex, nofollow");
  const indexResponse = await fetch(`${baseUrl}/index.html?ln=en`, { redirect: "manual" });
  assert.equal(indexResponse.status, 308);
  assert.equal(indexResponse.headers.get("location"), "/?ln=en");
  assert.match(homeHtml, /src="https:\/\/stats\.example\.test\/script\.js"/);
  assert.match(homeHtml, /data-website-id="proxy-test-site"/);

  const redundantLanguageResponse = await fetch(`${baseUrl}/?ln=zh&source=menu`, { redirect: "manual" });
  assert.equal(redundantLanguageResponse.status, 302);
  assert.equal(redundantLanguageResponse.headers.get("location"), "/?source=menu");
  assert.equal(redundantLanguageResponse.headers.get("cache-control"), "no-store");
  const redundantMemoryLanguage = await fetch(`${baseUrl}/memory/${v1PublicId}?ln=zh&source=menu`, { redirect: "manual" });
  assert.equal(redundantMemoryLanguage.status, 302);
  assert.equal(redundantMemoryLanguage.headers.get("location"), `/memory/${v1PublicId}?source=menu`);
  assert.equal(v1ViewCount, 0, "URL normalization must not count an extra memory view");

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

  const englishUiHomeResponse = await fetch(`${baseUrl}/?ln=en`);
  assert.equal(englishUiHomeResponse.status, 200);
  const englishUiHomeHtml = await englishUiHomeResponse.text();
  assert.match(englishUiHomeHtml, /var LANG = 'en';/);
  assert.match(englishUiHomeHtml, /Chinese memory on every UI language/);
  assert.match(englishUiHomeHtml, new RegExp(`"public_id":"${v1ChinesePublicId}"`));

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
  assert.match(v1PublicMemoryHtml, /<title>Prisma public memory &amp; notes · Configured title<\/title>/);
  assert.match(v1PublicMemoryHtml, new RegExp(`"public_id":"${v1PublicId}"`));
  const directListPayload = JSON.parse(
    v1PublicMemoryHtml.match(/var DEFAULT_POSTS = ([\s\S]*?);\n\s*var DEFAULT_POST =/)?.[1] ||
      "null",
  );
  const directPostPayload = JSON.parse(
    v1PublicMemoryHtml.match(/var DEFAULT_POST = (\{[^\n]*\});/)?.[1] || "null",
  );
  assert.equal(directPostPayload.data.text, "Rendered from the v1 direct memory API. A & B.", "Card text is escaped once by the DOM renderer");
  assert.equal(directPostPayload.data.is_long_form, "0");
  assert.match(directPostPayload.data.body_html, /<strong>A &amp; B<\/strong>/);
  assert.doesNotMatch(directPostPayload.data.body_html, /<h1>/);
  assert.match(v1PublicMemoryHtml, new RegExp(`rel="canonical" href="https://songqi.org/memory/${v1PublicId}"`));
  assert.equal(
    directPostPayload.data.id,
    directListPayload.data.posts.find((post) => post.public_id === v1PublicId).id,
  );

  const frenchV1PublicMemoryResponse = await fetch(`${baseUrl}/fr/memory/${v1PublicId}`);
  assert.equal(frenchV1PublicMemoryResponse.status, 404);

  const chineseV1PublicMemoryResponse = await fetch(`${baseUrl}/zh/memory/${v1PublicId}`);
  assert.equal(chineseV1PublicMemoryResponse.status, 404);
  assert.equal(v1ViewCount, 0, "HTML reads do not count as displayed memory opens");

  const englishV1PublicMemoryResponse = await fetch(`${baseUrl}/en/memory/${v1PublicId}`);
  assert.equal(englishV1PublicMemoryResponse.status, 404);
  assert.equal(v1ViewCount, 0, "HTML reads do not count as displayed memory opens");

  const frenchDisplayMemoryResponse = await fetch(`${baseUrl}/memory/${v1PublicId}?ln=fr`);
  assert.equal(frenchDisplayMemoryResponse.status, 200);
  assert.match(await frenchDisplayMemoryResponse.text(), /var LANG = 'fr';/);
  assert.equal(v1ViewCount, 0, "Language and metadata reads must not count views");
  const randomMemory = await (await fetch(`${baseUrl}/api/random-memory?current=${v1PublicId}`)).json();
  assert.equal(randomMemory.data.post.public_id, v1ChinesePublicId, "Random discovery excludes the current memory and includes every content language");
  const fromShortId = await (await fetch(`${baseUrl}/api/random-memory?current=${v1ChinesePublicId}`)).json();
  assert.equal(fromShortId.data.post.public_id, v1PublicId, "Short-ID memories can navigate back to original-ID memories");
  const exhaustedRandom = await (await fetch(`${baseUrl}/api/random-memory?current=${v1PublicId}&seen=${v1PublicId},${v1ChinesePublicId}`)).json();
  assert.equal(exhaustedRandom.data.post.public_id, v1ChinesePublicId, "Exhausting recent history still never selects the current memory");
  assert.equal(v1ViewCount, 0, "Random discovery does not count undisplayed previews");

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

  // A 40.6 MP camera photo with colored edges catches both the old resolution
  // rejection and destructive square cropping. No personal photo is committed.
  const cameraPhoto = await sharp({ create: { width: 7840, height: 5184, channels: 3, background: "#00ff00" } })
    .composite([{ input: Buffer.from('<svg width="7840" height="5184"><rect width="1000" height="5184" fill="red"/><rect x="6840" width="1000" height="5184" fill="blue"/></svg>') }])
    .jpeg().toBuffer();
  const cameraForm = new FormData();
  cameraForm.set("local", new Blob([cameraPhoto], { type: "image/jpeg" }), "camera.jpg");
  const cameraResponse = await fetch(`${baseUrl}/api/upload-image`, { method: "POST", body: cameraForm });
  assert.equal(cameraResponse.status, 200);
  const cameraId = (await cameraResponse.json()).data.fileId;
  const fullResponse = await fetch(`${baseUrl}/uploads/posts/${cameraId}/full.jpg`);
  assert.equal(fullResponse.status, 200);
  const fullPhoto = Buffer.from(await fullResponse.arrayBuffer());
  const dimensions = await sharp(fullPhoto).metadata();
  assert.equal(dimensions.width, 2400);
  assert.equal(dimensions.height, 1587);
  for (const [left, channel] of [[10, 0], [2380, 2]]) {
    const pixel = await sharp(fullPhoto).extract({ left, top: 790, width: 1, height: 1 }).raw().toBuffer();
    assert.ok(pixel[channel] > 230, "Both outer edges of the photograph must remain visible");
  }
  const squareResponse = await fetch(`${baseUrl}/uploads/posts/${cameraId}/resized.jpg`);
  const squarePhoto = Buffer.from(await squareResponse.arrayBuffer());
  const corner = await sharp(squarePhoto).extract({ left: 1, top: 1, width: 1, height: 1 }).raw().toBuffer();
  assert.ok([...corner].every((value) => value < 10), "Square preview should letterbox, not crop");
  const crops = [
    { fileId: cameraId, crop: { x: 1, y: 0.5, zoom: 4 } },
    { fileId: publicUploadBody.data.fileId, crop: { x: 0.5, y: 0.5, zoom: 1 } },
  ];
  const albumResponse = await fetch(`${baseUrl}/api/post`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: baseUrl },
    body: JSON.stringify({ name: "Gallery test", message: "Two independently cropped photos.", photos: crops }),
  });
  assert.equal(albumResponse.status, 200);
  const album = (await albumResponse.json()).data;
  assert.equal(album.photos.length, 2);
  assert.ok(album.photos[0].image_url.includes("/crop-"));
  assert.equal(album.photos[0].full_image_url, `/uploads/posts/${cameraId}/full.jpg`);
  assert.deepEqual(v1CreateBodies.at(-1).attachments.map(a => a.metadata.crop), crops.map(p => p.crop));
  const cropped = await fetch(`${baseUrl}${album.photos[0].image_url}`).then(r => r.arrayBuffer());
  const croppedDimensions = await sharp(Buffer.from(cropped)).metadata();
  assert.equal(croppedDimensions.width, 600);
  assert.equal(croppedDimensions.height, 600);
  const cropCenter = await sharp(Buffer.from(cropped)).extract({ left: 300, top: 300, width: 1, height: 1 }).raw().toBuffer();
  assert.ok(cropCenter[2] > 230 && cropCenter[0] < 20, "Saved crop must reflect zoom and rightward pan, not the center of the original");
  const originalAfter = await fetch(`${baseUrl}${album.photos[0].full_image_url}`).then(r => r.arrayBuffer());
  assert.deepEqual(Buffer.from(originalAfter), fullPhoto, "Cropping must never modify the full photograph");
  for (const photos of [[], Array(7).fill(crops[0]), [crops[0], crops[0]], [{ fileId: "../../bad", crop: crops[0].crop }], [{ fileId: cameraId, crop: { x: 0.5, y: 0.5, zoom: 0 } }]]) {
    const rejected = await fetch(`${baseUrl}/api/post`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ photos }) });
    assert.equal(rejected.status, 400, "Malformed or oversized galleries must be rejected");
  }
  // Distinct frames catch silent first-frame flattening at every image endpoint.
  const rgba = Buffer.alloc(80 * 40 * 4);
  for (let offset = 0; offset < rgba.length; offset += 4) {
    rgba[offset] = offset < 80 * 20 * 4 ? 255 : 0;
    rgba[offset + 2] = offset < 80 * 20 * 4 ? 0 : 255;
    rgba[offset + 3] = 255;
  }
  const animation = await sharp(rgba, { raw: { width: 80, height: 40, channels: 4, pageHeight: 20 } })
    .gif({ delay: [120, 230], loop: 0 }).toBuffer();
  const gifForm = new FormData();
  gifForm.set("local", new Blob([animation], { type: "image/gif" }), "animation.gif");
  const gifUpload = await fetch(`${baseUrl}/api/upload-image`, { method: "POST", body: gifForm });
  assert.equal(gifUpload.status, 200);
  const gifId = (await gifUpload.json()).data.fileId;
  const gifPost = await fetch(`${baseUrl}/api/post`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: baseUrl },
    body: JSON.stringify({ name: "Animation test", message: "Animated memory.", photos: [{ fileId: gifId, crop: { x: 0.75, y: 0.5, zoom: 2 } }] }),
  });
  assert.equal(gifPost.status, 200);
  const gifMemory = (await gifPost.json()).data;
  for (const url of [gifMemory.photos[0].image_url, gifMemory.photos[0].full_image_url, `/uploads/posts/${gifId}/resized.jpg`]) {
    const response = await fetch(`${baseUrl}${url}`);
    assert.equal(response.headers.get("content-type"), "image/gif");
    const data = Buffer.from(await response.arrayBuffer());
    const meta = await sharp(data).metadata();
    assert.equal(meta.pages, 2, "Both animation frames must survive upload and cropping");
    assert.deepEqual(meta.delay, [120, 230]);
    assert.equal(meta.loop, 0);
    const frames = await sharp(data, { animated: true }).raw().toBuffer();
    const second = meta.width * meta.height * meta.channels;
    const center = (Math.floor(meta.height / 2) * meta.width + Math.floor(meta.width / 2)) * meta.channels;
    assert.ok(frames[center] > 240 && frames[second + center + 2] > 240, "The frame content must remain distinct");
  }
  await rm(join(dataDir, "uploads", "posts", gifId, "full.jpg"));
  const recovered = await fetch(`${baseUrl}${gifMemory.photos[0].full_image_url}`).then(r => r.arrayBuffer());
  assert.equal((await sharp(Buffer.from(recovered)).metadata()).pages, 2, "Regenerating a missing full image must preserve animation");
  const excessiveFrames = Buffer.alloc(301 * 4);
  for (let frame = 0; frame < 301; frame++) { excessiveFrames[frame * 4] = frame % 2 ? 255 : 0; excessiveFrames[frame * 4 + 3] = 255; }
  const oversizedAnimation = await sharp(excessiveFrames, { raw: { width: 1, height: 301, channels: 4, pageHeight: 1 } }).gif({ delay: 100 }).toBuffer();
  const oversizedGifForm = new FormData();
  oversizedGifForm.set("local", new Blob([oversizedAnimation], { type: "image/gif" }), "too-many-frames.gif");
  const oversizedGif = await fetch(`${baseUrl}/api/upload-image`, { method: "POST", body: oversizedGifForm });
  assert.equal(oversizedGif.status, 400, "Unbounded animation decoding must be rejected");
  assert.match((await oversizedGif.json()).errorMsg, /300 frames/);
  const invalidForm = new FormData();
  invalidForm.set("local", new Blob(["not an image"], { type: "image/jpeg" }), "broken.jpg");
  const invalidImage = await fetch(`${baseUrl}/api/upload-image`, { method: "POST", body: invalidForm });
  assert.equal(invalidImage.status, 400, "Invalid images should return a useful client error");

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

  // A fresh middleware instance loads the owner's changed default, rather
  // than relying on the environment fallback or the prior instance's cache.
  siteDefaultLanguage = "en";
  const englishMiddleware = createRevivalMiddleware({ apiBaseUrl: `http://127.0.0.1:${upstreamPort}` });
  const englishServer = createServer((req, res) => englishMiddleware(req, res, () => {
    res.statusCode = 404;
    res.end();
  }));
  await new Promise((resolve) => englishServer.listen(0, "127.0.0.1", resolve));
  try {
    const englishBaseUrl = `http://127.0.0.1:${englishServer.address().port}`;
    for (const path of ["/", `/memory/${v1PublicId}`]) {
      const response = await fetch(`${englishBaseUrl}${path}?ln=en&source=menu`, { redirect: "manual" });
      assert.equal(response.status, 302);
      assert.equal(response.headers.get("location"), `${path}?source=menu`);
      assert.equal(response.headers.get("cache-control"), "no-store");
      const cleanResponse = await fetch(`${englishBaseUrl}${response.headers.get("location")}`);
      assert.equal(cleanResponse.status, 200);
      assert.match(await cleanResponse.text(), /var LANG = 'en';/);
    }
    const frenchResponse = await fetch(`${englishBaseUrl}/?ln=fr`, { redirect: "manual" });
    assert.equal(frenchResponse.status, 200);
    assert.match(await frenchResponse.text(), /var LANG = 'fr';/);
  } finally {
    await new Promise((resolve) => englishServer.close(resolve));
    siteDefaultLanguage = "zh";
  }

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
