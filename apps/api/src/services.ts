import { join } from "node:path";
import { createLocalStorage, type StorageAdapter } from "@i-remember/storage";
import type { AssetUploadInput, MemoryInput, MemoryUpdateInput, Principal } from "./domain.js";
import { requireRole } from "./auth.js";
import type { AssetRepository, MemoryRepository, UserRepository } from "./repositories.js";

export class MemoryService {
  constructor(private readonly memories: MemoryRepository) {}

  list(query: { q?: string; limit?: number }) {
    return this.memories.list(query);
  }

  get(id: string) {
    return this.memories.get(id);
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
    return {
      key: input.key,
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
    return { key, deleted: true };
  }
}
