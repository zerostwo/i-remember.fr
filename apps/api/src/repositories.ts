import type {
  AssetCreateInput,
  AssetRecord,
  MenuItemInput,
  MenuItemRecord,
  MenuItemUpdateInput,
  MemoryInput,
  MemoryRecord,
  MemoryUpdateInput,
  PageInput,
  PageRecord,
  PageUpdateInput,
  SettingRecord,
  UserRecord,
} from "./domain.js";

export type MemoryListQuery = {
  q?: string;
  legacyId?: number;
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

export interface PageRepository {
  list(language?: string): Promise<PageRecord[]>;
  get(slug: string, language?: string): Promise<PageRecord | null>;
  create(input: PageInput): Promise<PageRecord>;
  update(slug: string, input: PageUpdateInput, language?: string): Promise<PageRecord>;
  archive(slug: string, language?: string): Promise<PageRecord>;
}

export interface MenuItemRepository {
  list(language?: string): Promise<MenuItemRecord[]>;
  create(input: MenuItemInput): Promise<MenuItemRecord>;
  update(id: string, input: MenuItemUpdateInput): Promise<MenuItemRecord>;
  delete(id: string): Promise<void>;
}

export interface SettingRepository {
  list(): Promise<SettingRecord[]>;
  upsertMany(values: Record<string, unknown>): Promise<SettingRecord[]>;
}

export interface AssetRepository {
  list(limit: number): Promise<AssetRecord[]>;
  create(input: AssetCreateInput): Promise<AssetRecord>;
  deleteByUrl(url: string): Promise<void>;
}
