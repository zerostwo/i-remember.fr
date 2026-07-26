import { createHash, timingSafeEqual } from "node:crypto";
import { join } from "node:path";
import { createLocalStorage, type StorageAdapter } from "@i-remember/storage";
import type {
  AgentAnswer,
  AgentQueryInput,
  AssetUploadInput,
  CommentInput,
  CommentUpdateInput,
  MenuItemInput,
  MenuItemUpdateInput,
  MemoryInput,
  MemoryRecord,
  MemoryUpdateInput,
  PageInput,
  PageUpdateInput,
  Principal,
  UserRecord,
} from "./domain.js";
import {
  assertLoginPassword,
  createRecoveryCodes,
  createTotpSecret,
  hashPassword,
  hashRecoveryCodes,
  loginUser,
  protectTotpSecret,
  requireRole,
  totpUri,
  twoFactorRequired,
  unprotectTotpSecret,
  verifyPasswordHash,
  verifyRecoveryCode,
  verifyTotp,
} from "./auth.js";
import type {
  AssetRepository,
  CommentListQuery,
  CommentRepository,
  MenuItemRepository,
  MemoryListQuery,
  MemoryRepository,
  PageRepository,
  ReadinessRepository,
  SettingRepository,
  UserRepository,
} from "./repositories.js";
import { ApiError } from "./errors.js";

export type RuntimeSettings = {
  defaultLanguage: "en" | "fr" | "zh";
  anonymousSubmissions: boolean;
  tracking: {
    enabled: boolean;
    umamiSrc: string;
    umamiWebsiteId: string;
  };
};

function environmentBoolean(value: unknown, fallback: boolean) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function runtimeBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  return environmentBoolean(value, fallback);
}

function initialRuntimeSettings(): RuntimeSettings {
  const configuredLanguage = String(process.env.I_REMEMBER_DEFAULT_LANGUAGE || "en").toLowerCase();
  const defaultLanguage = ["en", "fr", "zh"].includes(configuredLanguage)
    ? (configuredLanguage as RuntimeSettings["defaultLanguage"])
    : "en";
  const umamiSrc = String(process.env.UMAMI_SRC || "");
  const umamiWebsiteId = String(process.env.UMAMI_WEBSITE_ID || "");
  return {
    defaultLanguage,
    anonymousSubmissions: environmentBoolean(process.env.I_REMEMBER_ANONYMOUS_SUBMISSIONS, false),
    tracking: {
      enabled: Boolean(umamiSrc && umamiWebsiteId),
      umamiSrc,
      umamiWebsiteId,
    },
  };
}

function normalizedRuntimeSettings(values: Record<string, unknown>): RuntimeSettings {
  const language = String(values.defaultLanguage || "").toLowerCase();
  const tracking =
    values.tracking && typeof values.tracking === "object" && !Array.isArray(values.tracking)
      ? (values.tracking as Record<string, unknown>)
      : {};
  return {
    defaultLanguage: ["en", "fr", "zh"].includes(language)
      ? (language as RuntimeSettings["defaultLanguage"])
      : "en",
    anonymousSubmissions: runtimeBoolean(values.anonymousSubmissions, false),
    tracking: {
      enabled: runtimeBoolean(tracking.enabled, false),
      umamiSrc: typeof tracking.umamiSrc === "string" ? tracking.umamiSrc : "",
      umamiWebsiteId: typeof tracking.umamiWebsiteId === "string" ? tracking.umamiWebsiteId : "",
    },
  };
}

export class RuntimeSettingsService {
  constructor(private readonly settings: SettingRepository) {}

  private async ensureRecords() {
    const records = await this.settings.list();
    const existing = new Set(records.map((record) => record.key));
    const defaults = initialRuntimeSettings();
    const missing = Object.fromEntries(
      Object.entries(defaults).filter(([key]) => !existing.has(key)),
    );
    if (Object.keys(missing).length) {
      await this.settings.upsertMany(missing);
      return this.settings.list();
    }
    return records;
  }

  async current() {
    const records = await this.ensureRecords();
    return normalizedRuntimeSettings(
      Object.fromEntries(records.map((record) => [record.key, record.value])),
    );
  }

  listRecords() {
    return this.ensureRecords();
  }

  async upsertMany(values: Record<string, unknown>) {
    await this.settings.upsertMany(values);
    return this.ensureRecords();
  }
}

function isRealPublicMemory(memory: MemoryRecord | null) {
  if (!memory || memory.status !== "NORMAL" || memory.visibility !== "PUBLIC") return false;
  const content = memory.content.trim();
  return (
    Boolean(content) &&
    !/^#?\s*untitled memor(?:y|oy)\b/i.test(content) &&
    !/^untitled memor(?:y|oy)$/i.test(memory.title.trim())
  );
}

export class MemoryService {
  constructor(
    private readonly memories: MemoryRepository,
    private readonly runtimeSettings: RuntimeSettingsService,
  ) {}

  async list(principal: Principal, query: MemoryListQuery) {
    if (
      (query.status && query.status !== "NORMAL") ||
      (query.visibility && query.visibility !== "PUBLIC")
    ) {
      requireRole(principal, ["ADMIN"]);
    }
    const memories = await this.memories.list(query);
    return principal.role === "ANONYMOUS" ? memories.filter(isRealPublicMemory) : memories;
  }

  async get(principal: Principal, id: string) {
    const memory = await this.memories.get(id);
    if (!memory) return null;
    if (principal.role === "ANONYMOUS" && !isRealPublicMemory(memory)) return null;
    if (memory.status !== "NORMAL" || memory.visibility !== "PUBLIC") {
      requireRole(principal, ["ADMIN"]);
    }
    return memory;
  }

  async create(principal: Principal, input: MemoryInput) {
    if (principal.role === "ANONYMOUS") {
      const settings = await this.runtimeSettings.current();
      if (!settings.anonymousSubmissions) {
        throw new ApiError(
          403,
          "Anonymous memory submissions are disabled",
          "anonymous_submissions_disabled",
        );
      }
      return this.memories.create({
        ...input,
        publicId: undefined,
        authorId: undefined,
        visibility: "PUBLIC",
        status: "NORMAL",
        embedding: undefined,
        aiSummary: undefined,
        knowledgeGraph: undefined,
      });
    }
    return this.memories.create(input);
  }

  async view(id: string) {
    if (!isRealPublicMemory(await this.memories.get(id))) {
      throw new ApiError(404, "Memory not found", "not_found");
    }
    return this.memories.incrementView(id);
  }

  update(principal: Principal, id: string, input: MemoryUpdateInput) {
    requireRole(principal, ["ADMIN"]);
    return this.memories.update(id, input);
  }

  archive(principal: Principal, id: string) {
    requireRole(principal, ["ADMIN"]);
    return this.memories.archive(id);
  }
}

export class UserService {
  constructor(private readonly users: UserRepository) {}

  list(principal: Principal) {
    requireRole(principal, ["ADMIN"]);
    return this.users.list();
  }
}

export class AuthService {
  constructor(private readonly users: UserRepository) {}

  async status() {
    const needsSetup = (await this.users.count()) === 0;
    return { needsSetup, bootstrapTokenRequired: needsSetup };
  }

  async login(input: Record<string, unknown>) {
    const email = String(input.email || "")
      .trim()
      .toLowerCase();
    const user: UserRecord | null = email ? await this.users.findByEmail(email) : null;
    if (!user) throw new ApiError(401, "Invalid credentials", "invalid_credentials");

    assertLoginPassword(input, user);
    if (!user.twoFactorEnabled) return loginUser(input, user);

    const code = String(input.totp || input.twoFactorCode || "");
    if (!code) return twoFactorRequired(user);

    const totpSecret = user.twoFactorSecret ? unprotectTotpSecret(user.twoFactorSecret) : "";
    if (totpSecret && verifyTotp(totpSecret, code)) {
      return loginUser(input, user);
    }

    const recoveryIndex = verifyRecoveryCode(code, user.twoFactorRecoveryCodes || []);
    if (recoveryIndex >= 0) {
      const remainingCodes = [...(user.twoFactorRecoveryCodes || [])];
      remainingCodes.splice(recoveryIndex, 1);
      const updated = await this.users.update(user.id, {
        twoFactorRecoveryCodes: remainingCodes,
      });
      return loginUser(input, updated);
    }

    throw new ApiError(401, "Invalid two-factor code", "invalid_two_factor");
  }

  assertBootstrapToken(providedBootstrapToken: string) {
    const configuredBootstrapToken = String(process.env.I_REMEMBER_SETUP_TOKEN || "");
    if (!configuredBootstrapToken) {
      throw new ApiError(503, "First-admin setup is not configured", "setup_not_configured");
    }
    const expectedDigest = createHash("sha256").update(configuredBootstrapToken).digest();
    const providedDigest = createHash("sha256").update(providedBootstrapToken).digest();
    if (!timingSafeEqual(expectedDigest, providedDigest)) {
      throw new ApiError(401, "Invalid bootstrap token", "invalid_bootstrap_token");
    }
  }

  async setup(input: Record<string, unknown>, providedBootstrapToken: string) {
    this.assertBootstrapToken(providedBootstrapToken);
    const email = String(input.email || "")
      .trim()
      .toLowerCase();
    const password = String(input.password || "");
    if (!email || !email.includes("@")) {
      throw new ApiError(400, "Valid email is required", "invalid_email");
    }
    if (password.length < 12) {
      throw new ApiError(400, "Password must be at least 12 characters", "weak_password");
    }
    const user = await this.users.createFirstAdmin({
      email,
      passwordHash: hashPassword(password),
      role: "ADMIN",
    });
    return loginUser({ password }, user);
  }

  private async currentUser(principal: Principal) {
    requireRole(principal, ["ADMIN"]);
    const user = principal.id
      ? await this.users.findById(principal.id)
      : principal.email
        ? await this.users.findByEmail(principal.email)
        : null;
    if (!user) throw new ApiError(401, "A user-backed admin session is required", "user_required");
    return user;
  }

  async account(principal: Principal) {
    return this.currentUser(principal);
  }

  async updateAccount(principal: Principal, input: Record<string, unknown>) {
    const user = await this.currentUser(principal);
    const currentPassword = String(input.currentPassword || "");
    if (!verifyPasswordHash(currentPassword, user.passwordHash)) {
      throw new ApiError(401, "Current password is incorrect", "invalid_current_password");
    }

    const email = String(input.email || "")
      .trim()
      .toLowerCase();
    const newPassword = String(input.newPassword || "");
    if (!email || !email.includes("@")) {
      throw new ApiError(400, "Valid email is required", "invalid_email");
    }
    if (newPassword && newPassword.length < 12) {
      throw new ApiError(400, "Password must be at least 12 characters", "weak_password");
    }

    const updated = await this.users.update(user.id, {
      email,
      ...(newPassword ? { passwordHash: hashPassword(newPassword) } : {}),
    });
    return {
      account: updated,
      token: loginUser({}, updated).token,
    };
  }

  async setupTwoFactor(principal: Principal, input: Record<string, unknown>) {
    const user = await this.currentUser(principal);
    const currentPassword = String(input.currentPassword || "");
    if (!verifyPasswordHash(currentPassword, user.passwordHash)) {
      throw new ApiError(401, "Current password is incorrect", "invalid_current_password");
    }
    if (user.twoFactorEnabled) {
      throw new ApiError(409, "Two-factor authentication is already enabled", "two_factor_enabled");
    }
    const secret = createTotpSecret();
    const updated = await this.users.update(user.id, {
      twoFactorSecret: protectTotpSecret(secret),
      twoFactorEnabled: false,
      twoFactorRecoveryCodes: null,
    });
    return {
      secret,
      otpauthUrl: totpUri(updated, secret),
    };
  }

  async enableTwoFactor(principal: Principal, input: Record<string, unknown>) {
    const user = await this.currentUser(principal);
    const secret = user.twoFactorSecret ? unprotectTotpSecret(user.twoFactorSecret) : "";
    if (!secret) throw new ApiError(400, "Two-factor setup has not been started", "totp_not_setup");
    if (!verifyTotp(secret, String(input.totp || input.code || ""))) {
      throw new ApiError(401, "Invalid two-factor code", "invalid_two_factor");
    }
    const recoveryCodes = createRecoveryCodes();
    const updated = await this.users.update(user.id, {
      twoFactorEnabled: true,
      twoFactorRecoveryCodes: hashRecoveryCodes(recoveryCodes),
    });
    return { account: updated, recoveryCodes };
  }

  async disableTwoFactor(principal: Principal, input: Record<string, unknown>) {
    const user = await this.currentUser(principal);
    if (user.twoFactorEnabled) {
      const code = String(input.totp || input.code || "");
      const recoveryIndex = verifyRecoveryCode(code, user.twoFactorRecoveryCodes || []);
      const secret = user.twoFactorSecret ? unprotectTotpSecret(user.twoFactorSecret) : "";
      const validTotp = secret ? verifyTotp(secret, code) : false;
      if (!validTotp && recoveryIndex < 0) {
        throw new ApiError(401, "Invalid two-factor code", "invalid_two_factor");
      }
    }
    const updated = await this.users.update(user.id, {
      twoFactorSecret: null,
      twoFactorEnabled: false,
      twoFactorRecoveryCodes: null,
    });
    return { account: updated };
  }
}

export class PageService {
  constructor(private readonly pages: PageRepository) {}

  list(principal: Principal, language?: string) {
    requireRole(principal, ["ADMIN"]);
    return this.pages.list(language);
  }

  async get(principal: Principal, slug: string, language?: string) {
    requireRole(principal, ["ADMIN"]);
    return this.pages.get(slug, language);
  }

  create(principal: Principal, input: PageInput) {
    requireRole(principal, ["ADMIN"]);
    return this.pages.create(input);
  }

  update(principal: Principal, slug: string, input: PageUpdateInput, language?: string) {
    requireRole(principal, ["ADMIN"]);
    return this.pages.update(slug, input, language);
  }

  archive(principal: Principal, slug: string, language?: string) {
    requireRole(principal, ["ADMIN"]);
    return this.pages.archive(slug, language);
  }
}

export class MenuItemService {
  constructor(private readonly menuItems: MenuItemRepository) {}

  list(principal: Principal, language?: string) {
    requireRole(principal, ["ADMIN"]);
    return this.menuItems.list(language);
  }

  create(principal: Principal, input: MenuItemInput) {
    requireRole(principal, ["ADMIN"]);
    return this.menuItems.create(input);
  }

  update(principal: Principal, id: string, input: MenuItemUpdateInput) {
    requireRole(principal, ["ADMIN"]);
    return this.menuItems.update(id, input);
  }

  async delete(principal: Principal, id: string) {
    requireRole(principal, ["ADMIN"]);
    await this.menuItems.delete(id);
    return { id, deleted: true };
  }
}

export class PublicContentService {
  constructor(
    private readonly menuItems: MenuItemRepository,
    private readonly pages: PageRepository,
    private readonly memories: MemoryRepository,
  ) {}

  async menu(language = "en") {
    return (await this.menuItems.list(language)).filter((item) => item.isVisible);
  }

  async target(id: string, language = "en") {
    const item = (await this.menu(language)).find(
      (candidate) => candidate.id === id || candidate.uid === id,
    );
    if (!item) throw new ApiError(404, "Menu item not found", "not_found");

    if (item.type === "PAGE") {
      const page = await this.pages.get(item.targetValue || item.label, language);
      if (!page || page.status !== "PUBLISHED") {
        throw new ApiError(404, "Page not found", "not_found");
      }
      return { item, page };
    }

    if (item.type === "MEMORY") {
      const memory = item.targetValue ? await this.memories.get(item.targetValue) : null;
      if (!memory || memory.status !== "NORMAL" || memory.visibility !== "PUBLIC") {
        throw new ApiError(404, "Memory not found", "not_found");
      }
      return { item, memory };
    }

    if (item.type === "SEARCH") {
      const results = await this.memories.list({
        q: item.targetValue || item.label,
        status: "NORMAL",
        visibility: "PUBLIC",
        limit: 100,
      });
      return { item, results };
    }

    return { item };
  }
}

export class SettingService {
  constructor(private readonly settings: RuntimeSettingsService) {}

  list(principal: Principal) {
    requireRole(principal, ["ADMIN"]);
    return this.settings.listRecords();
  }

  upsertMany(principal: Principal, values: Record<string, unknown>) {
    requireRole(principal, ["ADMIN"]);
    return this.settings.upsertMany(values);
  }

  publicSettings() {
    return this.settings.current();
  }
}

export class ReadinessService {
  constructor(private readonly readiness: ReadinessRepository) {}

  async status() {
    const configuredTimeout = Number.parseInt(
      String(process.env.API_READINESS_TIMEOUT_MS || ""),
      10,
    );
    const timeoutMs =
      Number.isFinite(configuredTimeout) && configuredTimeout >= 250 && configuredTimeout <= 10_000
        ? configuredTimeout
        : 2000;
    let timeout: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.readiness.check(),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => reject(new Error("readiness timeout")), timeoutMs);
          timeout.unref();
        }),
      ]);
      return { ok: true, service: "api", database: "ready" as const };
    } catch {
      return { ok: false, service: "api", database: "unavailable" as const };
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}

export class CommentService {
  constructor(private readonly comments: CommentRepository) {}

  list(principal: Principal, query: CommentListQuery) {
    requireRole(principal, ["ADMIN"]);
    return this.comments.list(query);
  }

  create(principal: Principal, input: CommentInput) {
    requireRole(principal, ["ADMIN"]);
    return this.comments.create(input);
  }

  update(principal: Principal, id: string, input: CommentUpdateInput) {
    requireRole(principal, ["ADMIN"]);
    return this.comments.update(id, input);
  }

  archive(principal: Principal, id: string) {
    requireRole(principal, ["ADMIN"]);
    return this.comments.archive(id);
  }
}

function citation(memory: MemoryRecord) {
  return {
    id: memory.publicId,
    title: memory.title,
    excerpt: memory.excerpt || memory.content.slice(0, 220),
    url: `/memory/${memory.publicId}`,
  };
}

export class AgentService {
  constructor(private readonly memories: MemoryService) {}

  async answer(principal: Principal, input: AgentQueryInput): Promise<AgentAnswer> {
    const matches = await this.memories.list(principal, {
      q: input.query,
      limit: input.limit,
      status: "NORMAL",
      visibility: "PUBLIC",
    });
    return {
      query: input.query,
      answer: matches.length
        ? `Found ${matches.length} public memories matching "${input.query}".`
        : `No public memories matched "${input.query}".`,
      citations: matches.map(citation),
    };
  }
}

export class DashboardService {
  constructor(
    private readonly memories: MemoryRepository,
    private readonly users: UserRepository,
  ) {}

  async summary(principal: Principal) {
    requireRole(principal, ["ADMIN"]);
    const [
      totalMemories,
      pendingMemories,
      publishedMemories,
      archivedMemories,
      rejectedMemories,
      totalUsers,
      recentMemories,
    ] = await Promise.all([
      this.memories.count({ status: "all", visibility: "all" }),
      this.memories.count({ status: "PENDING", visibility: "all" }),
      this.memories.count({ status: "NORMAL", visibility: "all" }),
      this.memories.count({ status: "ARCHIVED", visibility: "all" }),
      this.memories.count({ status: "REJECTED", visibility: "all" }),
      this.users.count(),
      this.memories.list({ status: "all", visibility: "all", limit: 5 }),
    ]);

    return {
      totalMemories,
      pendingMemories,
      publishedMemories,
      archivedMemories,
      rejectedMemories,
      totalUsers,
      recentActivity: recentMemories.map((memory) => ({
        id: memory.publicId,
        title: memory.title,
        status: memory.status,
        createdAt: memory.createdAt.toISOString(),
      })),
    };
  }
}

export class AssetService {
  constructor(
    private readonly assets: AssetRepository,
    private readonly storage: StorageAdapter = createLocalStorage({
      rootDir: process.env.STORAGE_PATH || join(process.cwd(), ".revival-storage"),
      publicBaseUrl: process.env.STORAGE_PUBLIC_BASE_URL || "/uploads",
    }),
  ) {}

  list(principal: Principal, limit: number) {
    requireRole(principal, ["ADMIN"]);
    return this.assets.list(limit);
  }

  async upload(principal: Principal, input: AssetUploadInput) {
    requireRole(principal, ["ADMIN"]);
    const data = Buffer.from(input.contentBase64, "base64");
    if (!data.length) {
      throw new ApiError(400, "Invalid asset content", "invalid_asset_content");
    }
    const url = await this.storage.upload(input.key, data, { contentType: input.contentType });
    let record = null;
    try {
      record = input.memoryId
        ? await this.assets.create({
            memoryId: input.memoryId,
            url,
            type: input.contentType || "application/octet-stream",
            metadata: input.metadata,
          })
        : null;
    } catch (error) {
      await this.storage.delete(input.key).catch(() => null);
      throw error;
    }
    return {
      id: record?.id,
      key: input.key,
      memoryId: record?.memoryId,
      url,
      type: input.contentType || "application/octet-stream",
      metadata: input.metadata,
    };
  }

  getUrl(principal: Principal, key: string) {
    requireRole(principal, ["ADMIN"]);
    return {
      key,
      url: this.storage.getUrl(key),
    };
  }

  async delete(principal: Principal, key: string) {
    requireRole(principal, ["ADMIN"]);
    await this.storage.delete(key);
    await this.assets.deleteByUrl(this.storage.getUrl(key));
    return { key, deleted: true };
  }
}
