export type Role = "ADMIN" | "USER" | "ANONYMOUS";
export type Visibility = "PUBLIC" | "UNLISTED" | "PRIVATE";
export type MemoryStatus = "NORMAL" | "PENDING" | "ARCHIVED" | "REJECTED";

export type Principal = {
  role: Role;
  email?: string;
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
  authorName?: string;
  visibility?: Visibility;
  latitude?: number;
  longitude?: number;
  emotion?: string;
  metadata?: Record<string, unknown>;
  attachments?: AttachmentInput[];
  tags?: string[];
};

export type MemoryUpdateInput = Partial<MemoryInput> & {
  status?: MemoryStatus;
};

export type UserRecord = {
  id: string;
  email: string;
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
