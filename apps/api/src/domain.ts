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
  createdAt: Date;
  updatedAt: Date;
};

export type MemoryInput = {
  title: string;
  content: string;
  authorName?: string;
  visibility?: Visibility;
  latitude?: number;
  longitude?: number;
  emotion?: string;
  metadata?: Record<string, unknown>;
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

export type AssetUploadInput = {
  key: string;
  contentBase64: string;
  contentType?: string;
  metadata?: Record<string, unknown>;
};

export type AssetUploadResult = {
  key: string;
  url: string;
  type: string;
  metadata?: Record<string, unknown>;
};
