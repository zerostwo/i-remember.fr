import type {
  AssetCreateInput,
  AssetRecord,
  CommentInput,
  CommentRecord,
  CommentUpdateInput,
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
  UserCreateInput,
  UserRecord,
  UserUpdateInput,
} from "./domain.js";

export type MemoryListQuery = {
  q?: string;
  limit?: number;
  status?: "all" | MemoryRecord["status"];
  visibility?: "all" | MemoryRecord["visibility"];
};

export type CommentListQuery = {
  q?: string;
  limit?: number;
  memoryId?: string;
  status?: "all" | CommentRecord["status"];
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
  findById(id: string): Promise<UserRecord | null>;
  findByEmail(email: string): Promise<UserRecord | null>;
  create(input: UserCreateInput): Promise<UserRecord>;
  update(id: string, input: UserUpdateInput): Promise<UserRecord>;
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

export interface CommentRepository {
  list(query: CommentListQuery): Promise<CommentRecord[]>;
  create(input: CommentInput): Promise<CommentRecord>;
  update(id: string, input: CommentUpdateInput): Promise<CommentRecord>;
  archive(id: string): Promise<CommentRecord>;
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
