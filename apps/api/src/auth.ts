import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Principal, Role } from "./domain.js";
import { ApiError } from "./errors.js";

function safeEqual(left: string, right: string) {
  const a = createHash("sha256").update(left).digest();
  const b = createHash("sha256").update(right).digest();
  return timingSafeEqual(a, b);
}

export function authenticate(req: IncomingMessage): Principal {
  const header = String(req.headers.authorization || "");
  const token = header.match(/^Bearer\s+(.+)$/i)?.[1] || "";
  const secret = process.env.AUTH_SECRET || "";

  if (secret && token && safeEqual(token, secret)) {
    return {
      role: "ADMIN",
      email: process.env.ADMIN_EMAIL || "admin@i-remember.fr",
    };
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

export function login(input: { email?: string; password?: string }) {
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
    throw new ApiError(401, "Invalid admin credentials", "invalid_credentials");
  }

  return {
    token,
    user: {
      email: expectedEmail,
      role: "ADMIN" as const,
    },
  };
}
