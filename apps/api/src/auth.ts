import { createHash, createHmac, pbkdf2Sync, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Principal, Role, UserRecord } from "./domain.js";
import { ApiError } from "./errors.js";

function safeEqual(left: string, right: string) {
  const a = createHash("sha256").update(left).digest();
  const b = createHash("sha256").update(right).digest();
  return timingSafeEqual(a, b);
}

function authSecret() {
  return process.env.AUTH_SECRET || "";
}

function tokenSignature(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function isRole(value: unknown): value is Role {
  return value === "ADMIN" || value === "USER" || value === "ANONYMOUS";
}

function signedToken(principal: { email: string; role: Role }) {
  const secret = authSecret();
  if (!secret) throw new ApiError(503, "Admin login is not configured", "auth_not_configured");
  const payload = Buffer.from(
    JSON.stringify({
      email: principal.email,
      role: principal.role,
      iat: Math.floor(Date.now() / 1000),
    }),
  ).toString("base64url");
  return `v1.${payload}.${tokenSignature(payload, secret)}`;
}

function verifySignedToken(token: string, secret: string): Principal | null {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return null;
  const expected = tokenSignature(parts[1], secret);
  if (!safeEqual(parts[2], expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as {
      email?: unknown;
      role?: unknown;
    };
    const email = String(payload.email || "")
      .trim()
      .toLowerCase();
    if (!email || !isRole(payload.role) || payload.role === "ANONYMOUS") return null;
    return { email, role: payload.role };
  } catch (_error) {
    return null;
  }
}

export function authenticate(req: IncomingMessage): Principal {
  const header = String(req.headers.authorization || "");
  const token = header.match(/^Bearer\s+(.+)$/i)?.[1] || "";
  const secret = authSecret();

  if (secret && token) {
    const signed = verifySignedToken(token, secret);
    if (signed) return signed;

    if (safeEqual(token, secret)) {
      return {
        role: "ADMIN",
        email: process.env.ADMIN_EMAIL || "admin@i-remember.fr",
      };
    }
  }

  return { role: "ANONYMOUS" };
}

export function requireRole(principal: Principal, allowed: Role[]) {
  if (principal.role === "ANONYMOUS") {
    throw new ApiError(401, "Authentication is required", "unauthorized");
  }

  if (!allowed.includes(principal.role)) {
    throw new ApiError(403, "Permission denied", "forbidden");
  }
}

export function verifyPasswordHash(password: string, stored: string) {
  const parts = String(stored || "").split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number.parseInt(parts[1], 10);
  if (!Number.isFinite(iterations) || iterations < 100000) return false;
  const expected = Buffer.from(parts[3], "base64url");
  const actual = pbkdf2Sync(
    String(password || ""),
    parts[2],
    iterations,
    expected.length,
    "sha256",
  );
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function loginUser(input: Record<string, unknown>, user: UserRecord) {
  const password = String(input.password || "");
  if (user.role === "ANONYMOUS") {
    throw new ApiError(403, "Anonymous users cannot log in", "forbidden");
  }

  if (!verifyPasswordHash(password, user.passwordHash)) {
    throw new ApiError(401, "Invalid credentials", "invalid_credentials");
  }

  return {
    token: signedToken({ email: user.email, role: user.role }),
    user: {
      email: user.email,
      role: user.role,
    },
  };
}

export function login(input: Record<string, unknown>) {
  const email = String(input.email || "")
    .trim()
    .toLowerCase();
  const password = String(input.password || "");
  const expectedEmail = String(process.env.ADMIN_EMAIL || "")
    .trim()
    .toLowerCase();
  const expectedPassword = String(process.env.ADMIN_PASSWORD || "");
  const token = process.env.AUTH_SECRET || "";

  if (!expectedEmail || !expectedPassword || !token) {
    throw new ApiError(503, "Admin login is not configured", "auth_not_configured");
  }

  if (!safeEqual(email, expectedEmail) || !safeEqual(password, expectedPassword)) {
    throw new ApiError(401, "Invalid credentials", "invalid_credentials");
  }

  return {
    token: signedToken({ email: expectedEmail, role: "ADMIN" }),
    user: {
      email: expectedEmail,
      role: "ADMIN" as const,
    },
  };
}
