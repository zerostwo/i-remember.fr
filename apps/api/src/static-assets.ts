import { createReadStream, existsSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import type { ApiErrorResponse } from "@i-remember/types";

const contentTypes: Record<string, string> = {
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
};

function publicBaseUrl(value = process.env.STORAGE_PUBLIC_BASE_URL || "/uploads") {
  const normalized = `/${String(value || "/uploads").replace(/^\/+|\/+$/g, "")}`;
  return normalized === "/" ? "/uploads" : normalized;
}

function assetErrorBody(code: string, message: string): ApiErrorResponse {
  return { success: false, error: { code, message } };
}

function assetPath(reqUrl = "/", rootDir: string, baseUrl: string) {
  const url = new URL(reqUrl, "http://i-remember.local");
  let pathname = "";
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return { handled: true, forbidden: true };
  }

  if (!pathname.startsWith(`${baseUrl}/`)) return { handled: false };
  const key = pathname.slice(baseUrl.length + 1).replace(/\\/g, "/");
  const parts = key.split("/").filter(Boolean);
  if (!parts.length || parts.some((part) => part === "." || part === "..")) {
    return { handled: true, forbidden: true };
  }

  const root = resolve(rootDir);
  const filePath = resolve(root, join(...parts));
  if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
    return { handled: true, forbidden: true };
  }
  return { handled: true, filePath };
}

export function serveLocalAsset(
  req: IncomingMessage,
  res: ServerResponse,
  options: { rootDir?: string; publicBaseUrl?: string } = {},
) {
  const rootDir =
    options.rootDir || process.env.STORAGE_PATH || join(process.cwd(), ".revival-storage");
  const resolved = assetPath(req.url || "/", rootDir, publicBaseUrl(options.publicBaseUrl));
  if (!resolved.handled) return false;

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(assetErrorBody("method_not_allowed", "Method not allowed")));
    return true;
  }

  if (resolved.forbidden || !resolved.filePath) {
    res.statusCode = 403;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(assetErrorBody("forbidden", "Asset path is forbidden")));
    return true;
  }

  if (!existsSync(resolved.filePath)) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(assetErrorBody("not_found", "Asset not found")));
    return true;
  }

  const stat = statSync(resolved.filePath);
  if (!stat.isFile()) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(assetErrorBody("not_found", "Asset not found")));
    return true;
  }

  res.statusCode = 200;
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.setHeader("Content-Length", String(stat.size));
  res.setHeader(
    "Content-Type",
    contentTypes[extname(resolved.filePath).toLowerCase()] || "application/octet-stream",
  );
  if (req.method === "HEAD") {
    res.end();
    return true;
  }
  createReadStream(resolved.filePath).pipe(res);
  return true;
}
