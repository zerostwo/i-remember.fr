import type { IncomingMessage, ServerResponse } from "node:http";
import { ApiError, errorBody } from "./errors.js";

const maxJsonBodyBytes = Number.parseInt(
  process.env.API_MAX_JSON_BODY_BYTES ||
    process.env.I_REMEMBER_MAX_UPLOAD_BYTES ||
    `${12 * 1024 * 1024}`,
  10,
);

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

export async function readJson(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxJsonBodyBytes) {
      throw new ApiError(413, "Request body too large", "request_too_large");
    }
    chunks.push(buffer);
  }

  if (!chunks.length) return {};
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
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
