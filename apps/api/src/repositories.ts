import type { AssetRecord, MemoryInput, MemoryRecord, UserRecord } from "./domain.js";

export type MemoryListQuery = {
  q?: string;
  limit?: number;
};

export interface MemoryRepository {
  list(query: MemoryListQuery): Promise<MemoryRecord[]>;
  get(id: string): Promise<MemoryRecord | null>;
  create(input: MemoryInput): Promise<MemoryRecord>;
  update(id: string, input: Partial<MemoryInput>): Promise<MemoryRecord>;
  archive(id: string): Promise<MemoryRecord>;
}

export interface UserRepository {
  list(): Promise<UserRecord[]>;
}

export interface AssetRepository {
  list(limit: number): Promise<AssetRecord[]>;
}
