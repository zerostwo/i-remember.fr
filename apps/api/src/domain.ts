import type {
  CommentStatus,
  MemoryStatus,
  MenuItemType,
  PageStatus,
  Role,
  Visibility,
} from "@i-remember/types";

export type {
  CommentStatus,
  MemoryStatus,
  MenuItemType,
  PageStatus,
  Role,
  Visibility,
} from "@i-remember/types";

export type Principal = {
  role: Role;
  email?: string;
  id?: string;
};

export type MemoryRecord = {
  id: string;
  publicId: string;
  legacyId?: number | null;
  title: string;
  content: string;
  excerpt?: string | null;
  authorId?: string | null;
  authorName?: string | null;
  visibility: Visibility;
  status: MemoryStatus;
  latitude?: number | null;
  longitude?: number | null;
  emotion?: string | null;
  metadata?: Record<string, unknown> | null;
  embedding?: number[] | null;
  aiSummary?: string | null;
  knowledgeGraph?: Record<string, unknown> | null;
  attachments?: AttachmentRecord[];
  tags?: TagRecord[];
  createdAt: Date;
  updatedAt: Date;
};

export type AttachmentInput = {
  url: string;
  type?: string;
  metadata?: Record<string, unknown>;
};

export type MemoryInput = {
  title: string;
  content: string;
  legacyId?: number;
  authorId?: string;
  authorName?: string;
  visibility?: Visibility;
  latitude?: number;
  longitude?: number;
  emotion?: string;
  metadata?: Record<string, unknown>;
  embedding?: number[];
  aiSummary?: string;
  knowledgeGraph?: Record<string, unknown>;
  attachments?: AttachmentInput[];
  tags?: string[];
};

export type MemoryUpdateInput = Partial<MemoryInput> & {
  status?: MemoryStatus;
};

export type UserRecord = {
  id: string;
  email: string;
  passwordHash: string;
  role: Role;
  createdAt: Date;
};

export type AssetRecord = {
  id: string;
  memoryId: string;
  url: string;
  type: string;
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
};

export type AttachmentRecord = AssetRecord;

export type AssetCreateInput = {
  memoryId: string;
  url: string;
  type: string;
  metadata?: Record<string, unknown>;
};

export type TagRecord = {
  id: string;
  name: string;
  slug: string;
};

export type PageRecord = {
  id: string;
  slug: string;
  language: string;
  title: string;
  excerpt?: string | null;
  bodyMarkdown: string;
  status: PageStatus;
  linkedMemoryId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PageInput = {
  slug: string;
  language?: string;
  title: string;
  excerpt?: string;
  bodyMarkdown?: string;
  status?: PageStatus;
  linkedMemoryId?: string;
  metadata?: Record<string, unknown>;
};

export type PageUpdateInput = Partial<PageInput>;

export type CommentRecord = {
  id: string;
  memoryId?: string | null;
  memoryPublicId?: string | null;
  memoryTitle?: string | null;
  authorName: string;
  authorEmail?: string | null;
  content: string;
  status: CommentStatus;
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CommentInput = {
  memoryId?: string;
  authorName?: string;
  authorEmail?: string;
  content: string;
  status?: CommentStatus;
  metadata?: Record<string, unknown>;
};

export type CommentUpdateInput = Partial<CommentInput>;

export type MenuItemRecord = {
  id: string;
  uid: string;
  language: string;
  label: string;
  type: MenuItemType;
  targetValue?: string | null;
  url?: string | null;
  position: number;
  isVisible: boolean;
  opensNewTab: boolean;
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
};

export type MenuItemInput = {
  uid?: string;
  language?: string;
  label: string;
  type: MenuItemType;
  targetValue?: string;
  url?: string;
  position?: number;
  isVisible?: boolean;
  opensNewTab?: boolean;
  metadata?: Record<string, unknown>;
};

export type MenuItemUpdateInput = Partial<MenuItemInput>;

export type SettingRecord = {
  key: string;
  value: unknown;
  updatedAt: Date;
};

export type AssetUploadInput = {
  key: string;
  contentBase64: string;
  memoryId?: string;
  contentType?: string;
  metadata?: Record<string, unknown>;
};

export type AssetUploadResult = {
  id?: string;
  key: string;
  memoryId?: string;
  url: string;
  type: string;
  metadata?: Record<string, unknown>;
};

export type AgentQueryInput = {
  query: string;
  limit: number;
};

export type AgentCitation = {
  id: string;
  title: string;
  excerpt: string;
  url: string;
};

export type AgentAnswer = {
  query: string;
  answer: string;
  citations: AgentCitation[];
};
