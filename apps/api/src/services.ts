import type { MemoryInput, Principal } from "./domain.js";
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

  update(principal: Principal, id: string, input: Partial<MemoryInput>) {
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
  constructor(private readonly assets: AssetRepository) {}

  list(principal: Principal, limit: number) {
    requireRole(principal, ["ADMIN"]);
    return this.assets.list(limit);
  }
}
