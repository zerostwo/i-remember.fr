import type {
  AssetRecord,
  MemoryInput,
  MemoryRecord,
  MemoryUpdateInput,
  UserRecord,
} from "./domain.js";

export type MemoryListQuery = {
  q?: string;
  limit?: number;
  status?: "all" | MemoryRecord["status"];
  visibility?: "all" | MemoryRecord["visibility"];
};

export interface MemoryRepository {
  list(query: MemoryListQuery): Promise<MemoryRecord[]>;
  count(query: MemoryListQuery): Promise<number>;
  get(id: string): Promise<MemoryRecord | null>;
  create(input: MemoryInput): Promise<MemoryRecord>;
  update(id: string, input: MemoryUpdateInput): Promise<MemoryRecord>;
  archive(id: string): Promise<MemoryRecord>;
}

export interface UserRepository {
  list(): Promise<UserRecord[]>;
  count(): Promise<number>;
}

export interface AssetRepository {
  list(limit: number): Promise<AssetRecord[]>;
}
