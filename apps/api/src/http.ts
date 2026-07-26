import type { IncomingMessage, ServerResponse } from "node:http";
import { ApiError, errorBody } from "./errors.js";

function boundedEnvironmentInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

const rawUploadBytes = boundedEnvironmentInteger(
  process.env.I_REMEMBER_MAX_UPLOAD_BYTES,
  12 * 1024 * 1024,
  64 * 1024,
  24 * 1024 * 1024,
);

export const JSON_BODY_LIMITS = {
  standardBytes: boundedEnvironmentInteger(
    process.env.API_MAX_STANDARD_JSON_BODY_BYTES,
    256 * 1024,
    16 * 1024,
    2 * 1024 * 1024,
  ),
  assetBytes: boundedEnvironmentInteger(
    process.env.API_MAX_ASSET_JSON_BODY_BYTES || process.env.API_MAX_JSON_BODY_BYTES,
    Math.ceil((rawUploadBytes * 4) / 3) + 64 * 1024,
    256 * 1024,
    32 * 1024 * 1024,
  ),
  timeoutMs: boundedEnvironmentInteger(process.env.API_JSON_BODY_TIMEOUT_MS, 15_000, 1000, 60_000),
} as const;

export type RequestContext = {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  params: Record<string, string>;
};

export type RouteHandler = (context: RequestContext) => Promise<unknown> | unknown;

type Route = {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: RouteHandler;
};

export class Router {
  private routes: Route[] = [];

  add(method: string, path: string, handler: RouteHandler) {
    const keys: string[] = [];
    const pattern = new RegExp(
      `^${path
        .replace(/:([A-Za-z0-9_]+)\*/g, (_part, key: string) => {
          keys.push(key);
          return "(.+)";
        })
        .replace(/:([A-Za-z0-9_]+)/g, (_part, key: string) => {
          keys.push(key);
          return "([^/]+)";
        })}$`,
    );
    this.routes.push({ method, pattern, keys, handler });
  }

  async handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url || "/", "http://i-remember.local");
    for (const route of this.routes) {
      if (route.method !== (req.method || "GET").toUpperCase()) continue;
      const match = url.pathname.match(route.pattern);
      if (!match) continue;
      const params = Object.fromEntries(
        route.keys.map((key, index) => [key, decodeURIComponent(match[index + 1] || "")]),
      );
      await sendJson(res, await route.handler({ req, res, url, params }));
      return true;
    }
    return false;
  }
}

export type ReadJsonOptions = {
  maxBytes?: number;
  timeoutMs?: number;
};

function contentLength(req: IncomingMessage) {
  const raw = Array.isArray(req.headers["content-length"])
    ? req.headers["content-length"][0]
    : req.headers["content-length"];
  if (!raw || !/^\d+$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function readBody(req: IncomingMessage, maxBytes: number, timeoutMs: number) {
  const declaredLength = contentLength(req);
  if (declaredLength !== null && declaredLength > maxBytes) {
    req.resume();
    throw new ApiError(413, "Request body too large", "request_too_large");
  }

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;

    const cleanup = () => {
      clearTimeout(timer);
      req.off("data", onData);
      req.off("end", onEnd);
      req.off("aborted", onAborted);
      req.off("error", onError);
    };
    const fail = (error: unknown, drain = false) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (drain) req.resume();
      reject(error);
    };
    const onData = (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > maxBytes) {
        fail(new ApiError(413, "Request body too large", "request_too_large"), true);
        return;
      }
      chunks.push(buffer);
    };
    const onEnd = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(Buffer.concat(chunks));
    };
    const onAborted = () => fail(new ApiError(400, "Request body was aborted", "request_aborted"));
    const onError = (error: Error) => fail(error);
    const timer = setTimeout(
      () => fail(new ApiError(408, "Request body timed out", "request_timeout"), true),
      timeoutMs,
    );
    timer.unref();

    req.on("data", onData);
    req.once("end", onEnd);
    req.once("aborted", onAborted);
    req.once("error", onError);
  });
}

export async function readJson(req: IncomingMessage, options: ReadJsonOptions = {}) {
  const maxBytes =
    Number.isFinite(options.maxBytes) && Number(options.maxBytes) > 0
      ? Math.floor(Number(options.maxBytes))
      : JSON_BODY_LIMITS.standardBytes;
  const timeoutMs =
    Number.isFinite(options.timeoutMs) && Number(options.timeoutMs) > 0
      ? Math.floor(Number(options.timeoutMs))
      : JSON_BODY_LIMITS.timeoutMs;
  const body = await readBody(req, maxBytes, timeoutMs);

  if (!body.length) return {};
  try {
    const value = JSON.parse(body.toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("JSON object expected");
    }
    return value as Record<string, unknown>;
  } catch (_error) {
    throw new ApiError(400, "Invalid JSON body", "invalid_json");
  }
}

export async function sendJson(res: ServerResponse, payload: unknown, statusCode?: number) {
  if (!res.headersSent) {
    res.statusCode = statusCode || res.statusCode || 200;
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
  }
  res.end(JSON.stringify(payload));
}

export async function handleErrors(res: ServerResponse, task: () => Promise<boolean>) {
  try {
    return await task();
  } catch (error) {
    if (error instanceof ApiError) {
      await sendJson(res, errorBody(error), error.statusCode);
      return true;
    }
    console.error(error);
    await sendJson(res, errorBody(error), 500);
    return true;
  }
}
