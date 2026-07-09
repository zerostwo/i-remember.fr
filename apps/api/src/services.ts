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
  SettingRepository,
  UserRepository,
} from "./repositories.js";
import { ApiError } from "./errors.js";

export class MemoryService {
  constructor(private readonly memories: MemoryRepository) {}

  list(principal: Principal, query: MemoryListQuery) {
    if (
      (query.status && query.status !== "NORMAL") ||
      (query.visibility && query.visibility !== "PUBLIC")
    ) {
      requireRole(principal, ["ADMIN"]);
    }
    return this.memories.list(query);
  }

  async get(principal: Principal, id: string) {
    const memory = await this.memories.get(id);
    if (!memory) return null;
    if (memory.status !== "NORMAL" || memory.visibility !== "PUBLIC") {
      requireRole(principal, ["ADMIN"]);
    }
    return memory;
  }

  create(input: MemoryInput) {
    return this.memories.create(input);
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
    return { needsSetup: (await this.users.count()) === 0 };
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

  async setup(input: Record<string, unknown>) {
    if ((await this.users.count()) > 0) {
      throw new ApiError(409, "Admin user already exists", "admin_exists");
    }
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
    const user = await this.users.create({
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
  constructor(private readonly settings: SettingRepository) {}

  list(principal: Principal) {
    requireRole(principal, ["ADMIN"]);
    return this.settings.list();
  }

  upsertMany(principal: Principal, values: Record<string, unknown>) {
    requireRole(principal, ["ADMIN"]);
    return this.settings.upsertMany(values);
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
