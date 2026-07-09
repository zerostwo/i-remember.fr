import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  pbkdf2Sync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Principal, Role, UserRecord } from "./domain.js";
import { ApiError } from "./errors.js";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const TOKEN_MAX_AGE_SECONDS = 12 * 60 * 60;

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

function signedToken(principal: { email: string; role: Role; id?: string }) {
  const secret = authSecret();
  if (!secret) throw new ApiError(503, "Admin login is not configured", "auth_not_configured");
  const payload = Buffer.from(
    JSON.stringify({
      email: principal.email,
      role: principal.role,
      id: principal.id,
      iat: Math.floor(Date.now() / 1000),
    }),
  ).toString("base64url");
  return `v1.${payload}.${tokenSignature(payload, secret)}`;
}

function publicUser(user: UserRecord) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    twoFactorEnabled: Boolean(user.twoFactorEnabled),
  };
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
      id?: unknown;
      iat?: unknown;
    };
    const email = String(payload.email || "")
      .trim()
      .toLowerCase();
    if (!email || !isRole(payload.role) || payload.role === "ANONYMOUS") return null;
    const issuedAt = Number(payload.iat || 0);
    if (!Number.isFinite(issuedAt) || Math.floor(Date.now() / 1000) - issuedAt > TOKEN_MAX_AGE_SECONDS) {
      return null;
    }
    const id = String(payload.id || "").trim();
    return { email, role: payload.role, ...(id ? { id } : {}) };
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

export function hashPassword(password: string) {
  const iterations = 210000;
  const salt = randomBytes(18).toString("base64url");
  const hash = pbkdf2Sync(String(password || ""), salt, iterations, 32, "sha256").toString(
    "base64url",
  );
  return `pbkdf2$${iterations}$${salt}$${hash}`;
}

function base32Encode(buffer: Buffer) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(value: string) {
  const normalized = String(value || "")
    .toUpperCase()
    .replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let current = 0;
  const bytes: number[] = [];
  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) throw new ApiError(400, "Invalid two-factor secret", "invalid_totp_secret");
    current = (current << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((current >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function createTotpSecret() {
  return base32Encode(randomBytes(20));
}

export function totpCode(secret: string, step = Math.floor(Date.now() / 30000)) {
  const key = base32Decode(secret);
  const counter = Buffer.alloc(8);
  counter.writeUInt32BE(Math.floor(step / 0x100000000), 0);
  counter.writeUInt32BE(step >>> 0, 4);
  const hmac = createHmac("sha1", key).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const value =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(value % 1000000).padStart(6, "0");
}

export function verifyTotp(secret: string, token: string, window = 1) {
  const normalized = String(token || "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;
  const current = Math.floor(Date.now() / 30000);
  for (let offset = -window; offset <= window; offset += 1) {
    if (safeEqual(totpCode(secret, current + offset), normalized)) return true;
  }
  return false;
}

export function totpUri(user: UserRecord, secret: string) {
  const issuer = "I Remember";
  const label = `${issuer}:${user.email}`;
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });
  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
}

export function protectTotpSecret(secret: string) {
  if (!authSecret()) throw new ApiError(503, "Admin login is not configured", "auth_not_configured");
  const key = createHash("sha256").update(authSecret()).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString(
    "base64url",
  )}`;
}

export function unprotectTotpSecret(value: string) {
  const stored = String(value || "");
  if (!stored.startsWith("enc:v1:")) return stored;
  if (!authSecret()) throw new ApiError(503, "Admin login is not configured", "auth_not_configured");
  const [, , ivText, tagText, encryptedText] = stored.split(":");
  try {
    const key = createHash("sha256").update(authSecret()).digest();
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivText, "base64url"));
    decipher.setAuthTag(Buffer.from(tagText, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedText, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch (_error) {
    throw new ApiError(401, "Invalid two-factor secret", "invalid_totp_secret");
  }
}

function recoveryRawCode() {
  const bytes = randomBytes(12);
  let value = "";
  for (const byte of bytes) value += RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length];
  return value.slice(0, 12);
}

export function normalizeRecoveryCode(code: string) {
  return String(code || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function createRecoveryCodes(count = 10) {
  return Array.from({ length: count }, () => {
    const raw = recoveryRawCode();
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
  });
}

export function hashRecoveryCodes(codes: string[]) {
  return codes.map((code) => hashPassword(normalizeRecoveryCode(code)));
}

export function verifyRecoveryCode(code: string, hashes: string[] = []) {
  const normalized = normalizeRecoveryCode(code);
  if (!normalized) return -1;
  return hashes.findIndex((hash) => verifyPasswordHash(normalized, hash));
}

export function assertLoginPassword(input: Record<string, unknown>, user: UserRecord) {
  const password = String(input.password || "");
  if (user.role === "ANONYMOUS") {
    throw new ApiError(403, "Anonymous users cannot log in", "forbidden");
  }

  if (!verifyPasswordHash(password, user.passwordHash)) {
    throw new ApiError(401, "Invalid credentials", "invalid_credentials");
  }
}

export function loginUser(_input: Record<string, unknown>, user: UserRecord) {
  return {
    token: signedToken({ email: user.email, role: user.role, id: user.id }),
    user: publicUser(user),
  };
}

export function twoFactorRequired(user: UserRecord) {
  return {
    requiresTwoFactor: true,
    user: publicUser(user),
  };
}
