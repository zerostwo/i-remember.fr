import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { createRevivalMiddleware } from "./src/server/revival.js";

const rootDir = resolve(fileURLToPath(new URL(".", import.meta.url)));
const distDir = resolve(rootDir, "dist");
const host = process.env.HOST || "127.0.0.1";
const port = Number.parseInt(process.env.PORT || "7890", 10);
const apiBaseUrl = process.env.API_BASE_URL || "";
const storagePublicBaseUrl = normalizeProxyPath(process.env.STORAGE_PUBLIC_BASE_URL || "/uploads");
const packageJson = JSON.parse(readFileSync(resolve(rootDir, "package.json"), "utf8"));
const hopByHopHeaders = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".eot": "application/vnd.ms-fontobject",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function setSecurityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
}

function safeStaticPath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch (error) {
    return null;
  }

  const candidate = resolve(distDir, `.${decoded}`);
  if (candidate !== distDir && !candidate.startsWith(`${distDir}${sep}`)) {
    return null;
  }

  return candidate;
}

function normalizeProxyPath(value) {
  const normalized = `/${String(value || "/uploads").replace(/^\/+|\/+$/g, "")}`;
  return normalized === "/" ? "/uploads" : normalized;
}

function sendStatus(res, statusCode, message) {
  res.statusCode = statusCode;
  setSecurityHeaders(res);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end(message);
}

function apiProxyTarget(req) {
  if (!apiBaseUrl) return null;
  const url = new URL(req.url || "/", "http://i-remember.local");
  const isApiPath = url.pathname === "/api/v1" || url.pathname.startsWith("/api/v1/");
  const isV1AssetPath =
    url.pathname.startsWith(`${storagePublicBaseUrl}/`) &&
    !(storagePublicBaseUrl === "/uploads" && url.pathname.startsWith("/uploads/posts/"));
  if (!isApiPath && !isV1AssetPath) return null;
  return new URL(`${url.pathname}${url.search}`, apiBaseUrl);
}

async function proxyApi(req, res, target) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined || hopByHopHeaders.has(name.toLowerCase())) continue;
    headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : req,
      duplex: req.method === "GET" || req.method === "HEAD" ? undefined : "half",
      redirect: "manual",
    });
    res.statusCode = upstream.status;
    upstream.headers.forEach((value, name) => {
      if (!hopByHopHeaders.has(name.toLowerCase())) res.setHeader(name, value);
    });
    if (req.method === "HEAD" || !upstream.body) {
      res.end();
      return;
    }
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (_error) {
    sendStatus(res, 502, "API upstream unavailable");
  }
}

function serveFile(req, res, filePath, stat) {
  const contentType = contentTypes[extname(filePath).toLowerCase()] || "application/octet-stream";
  const range = req.headers.range;

  setSecurityHeaders(res);
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.setHeader("Content-Type", contentType);

  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) {
      res.statusCode = 416;
      res.setHeader("Content-Range", `bytes */${stat.size}`);
      res.end();
      return;
    }

    const start = match[1] ? Number.parseInt(match[1], 10) : 0;
    const end = match[2] ? Number.parseInt(match[2], 10) : stat.size - 1;

    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start > end ||
      start >= stat.size
    ) {
      res.statusCode = 416;
      res.setHeader("Content-Range", `bytes */${stat.size}`);
      res.end();
      return;
    }

    res.statusCode = 206;
    res.setHeader("Content-Range", `bytes ${start}-${end}/${stat.size}`);
    res.setHeader("Content-Length", String(end - start + 1));
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    createReadStream(filePath, { start, end }).pipe(res);
    return;
  }

  res.statusCode = 200;
  res.setHeader("Content-Length", String(stat.size));
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  createReadStream(filePath).pipe(res);
}

function serveStatic(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    sendStatus(res, 405, "Method not allowed");
    return;
  }

  if (!existsSync(distDir)) {
    sendStatus(res, 500, "Production build not found. Run npm run build first.");
    return;
  }

  const url = new URL(req.url || "/", "http://i-remember.local");
  let filePath = url.pathname === "/admin" || url.pathname.startsWith("/admin/")
    ? resolve(distDir, "admin.html")
    : safeStaticPath(url.pathname);
  if (!filePath) {
    sendStatus(res, 403, "Forbidden");
    return;
  }

  if (existsSync(filePath) && statSync(filePath).isDirectory()) {
    filePath = resolve(filePath, "index.html");
  }

  if (!existsSync(filePath)) {
    sendStatus(res, 404, "Not found");
    return;
  }

  const stat = statSync(filePath);
  if (!stat.isFile()) {
    sendStatus(res, 404, "Not found");
    return;
  }

  serveFile(req, res, filePath, stat);
}

const revivalMiddleware = createRevivalMiddleware({ production: true });
const server = createServer((req, res) => {
  const target = apiProxyTarget(req);
  if (target) {
    proxyApi(req, res, target);
    return;
  }

  if (req.method === "GET" && req.url === "/version") {
    setSecurityHeaders(res);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ name: packageJson.name, version: packageJson.version }));
    return;
  }

  revivalMiddleware(req, res, () => serveStatic(req, res));
});
server.requestTimeout = 30_000;
server.headersTimeout = 35_000;
server.keepAliveTimeout = 5_000;
server.on("clientError", (_error, socket) => {
  if (socket.writable) {
    socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
  }
});
server.on("error", (error) => {
  console.error("Server failed", error);
});

server.listen(port, host, () => {
  console.log(`I Remember revival server listening at http://${host}:${port}/`);
});
