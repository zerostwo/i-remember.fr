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
} from "./domain.js";
import { requireRole } from "./auth.js";
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
    if (!data.length) throw new Error("Asset content decoded to an empty file");
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
