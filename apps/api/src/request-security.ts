import { createHash } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { isIP } from "node:net";
import { ApiError } from "./errors.js";

type RateLimitWindow = {
  count: number;
  resetAt: number;
};

type RateLimitOptions = {
  bucket: string;
  identity: string;
  limit: number;
  windowMs: number;
};

function boundedEnvironmentInteger(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = Number.parseInt(String(process.env[name] || ""), 10);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

function enabled(value: unknown) {
  return ["1", "true", "yes", "on"].includes(
    String(value || "")
      .trim()
      .toLowerCase(),
  );
}

function firstHeaderValue(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value || "").split(",")[0]?.trim() || "";
}

function isLoopback(address: string) {
  const normalized = address.trim().toLowerCase();
  return (
    normalized === "::1" ||
    normalized === "127.0.0.1" ||
    normalized === "::ffff:127.0.0.1" ||
    normalized.startsWith("127.")
  );
}

function trustedProxy(req: IncomingMessage) {
  return enabled(process.env.API_TRUST_PROXY) && isLoopback(req.socket.remoteAddress || "");
}

function forwardedAddress(req: IncomingMessage) {
  const candidate = firstHeaderValue(req.headers["x-forwarded-for"])
    .replace(/^\[|\]$/g, "")
    .slice(0, 64);
  return isIP(candidate) ? candidate : "";
}

export function requestClientAddress(req: IncomingMessage) {
  if (trustedProxy(req)) {
    const forwarded = forwardedAddress(req);
    if (forwarded) return forwarded;
  }
  return (req.socket.remoteAddress || "unknown").slice(0, 64);
}

function identityHash(value: string) {
  return createHash("sha256").update(value).digest("base64url");
}

const rateLimitWindows = new Map<string, RateLimitWindow>();
const maxTrackedWindows = boundedEnvironmentInteger(
  "API_RATE_LIMIT_MAX_KEYS",
  10_000,
  100,
  100_000,
);

function trimRateLimitWindows(now: number) {
  if (rateLimitWindows.size < maxTrackedWindows) return;
  for (const [key, value] of rateLimitWindows) {
    if (value.resetAt <= now) rateLimitWindows.delete(key);
  }
  while (rateLimitWindows.size >= maxTrackedWindows) {
    const oldest = rateLimitWindows.keys().next().value;
    if (typeof oldest !== "string") break;
    rateLimitWindows.delete(oldest);
  }
}

export function assertRateLimit(
  res: ServerResponse,
  { bucket, identity, limit, windowMs }: RateLimitOptions,
) {
  const now = Date.now();
  trimRateLimitWindows(now);
  const key = `${bucket}:${identityHash(identity)}`;
  const existing = rateLimitWindows.get(key);
  const window =
    existing && existing.resetAt > now
      ? existing
      : {
          count: 0,
          resetAt: now + windowMs,
        };
  const retryAfterSeconds = Math.max(1, Math.ceil((window.resetAt - now) / 1000));

  res.setHeader("RateLimit-Limit", String(limit));
  res.setHeader("RateLimit-Remaining", String(Math.max(0, limit - window.count - 1)));
  res.setHeader("RateLimit-Reset", String(retryAfterSeconds));
  if (window.count >= limit) {
    res.setHeader("Retry-After", String(retryAfterSeconds));
    throw new ApiError(429, "Too many requests", "rate_limited");
  }

  window.count += 1;
  rateLimitWindows.set(key, window);
}

export function resetRequestSecurityState() {
  rateLimitWindows.clear();
}

export const REQUEST_RATE_LIMITS = {
  loginAccount: {
    limit: boundedEnvironmentInteger("API_LOGIN_RATE_LIMIT", 10, 1, 500),
    windowMs: boundedEnvironmentInteger(
      "API_LOGIN_RATE_WINDOW_MS",
      15 * 60 * 1000,
      1000,
      24 * 60 * 60 * 1000,
    ),
  },
  loginClient: {
    limit: boundedEnvironmentInteger("API_LOGIN_CLIENT_RATE_LIMIT", 30, 1, 1000),
    windowMs: boundedEnvironmentInteger(
      "API_LOGIN_CLIENT_RATE_WINDOW_MS",
      15 * 60 * 1000,
      1000,
      24 * 60 * 60 * 1000,
    ),
  },
  setup: {
    limit: boundedEnvironmentInteger("API_SETUP_RATE_LIMIT", 5, 1, 100),
    windowMs: boundedEnvironmentInteger(
      "API_SETUP_RATE_WINDOW_MS",
      15 * 60 * 1000,
      1000,
      24 * 60 * 60 * 1000,
    ),
  },
  setupProbe: {
    limit: boundedEnvironmentInteger("API_SETUP_PROBE_RATE_LIMIT", 30, 1, 1000),
    windowMs: boundedEnvironmentInteger(
      "API_SETUP_PROBE_RATE_WINDOW_MS",
      15 * 60 * 1000,
      1000,
      60 * 60 * 1000,
    ),
  },
  anonymousSubmission: {
    limit: boundedEnvironmentInteger("API_ANONYMOUS_SUBMISSION_RATE_LIMIT", 20, 1, 1000),
    windowMs: boundedEnvironmentInteger(
      "API_ANONYMOUS_SUBMISSION_RATE_WINDOW_MS",
      10 * 60 * 1000,
      1000,
      24 * 60 * 60 * 1000,
    ),
  },
} as const;

export function assertSafeWriteOrigin(req: IncomingMessage) {
  const fetchSite = firstHeaderValue(req.headers["sec-fetch-site"]).toLowerCase();
  if (fetchSite === "cross-site") {
    throw new ApiError(403, "Cross-site request denied", "cross_site_request");
  }

  const originHeader = firstHeaderValue(req.headers.origin);
  if (!originHeader) return;

  let origin: URL;
  try {
    origin = new URL(originHeader);
  } catch {
    throw new ApiError(403, "Invalid request origin", "invalid_origin");
  }

  const forwardedHost = trustedProxy(req) ? firstHeaderValue(req.headers["x-forwarded-host"]) : "";
  const expectedHost = (forwardedHost || firstHeaderValue(req.headers.host)).toLowerCase();
  if (!expectedHost || origin.host.toLowerCase() !== expectedHost) {
    throw new ApiError(403, "Cross-site request denied", "cross_site_request");
  }
}
