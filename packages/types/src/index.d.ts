export type Role = "ADMIN" | "USER" | "ANONYMOUS";
export type Visibility = "PUBLIC" | "PRIVATE" | "UNLISTED";
export type MemoryStatus = "NORMAL" | "PENDING" | "ARCHIVED" | "REJECTED";
export type CommentStatus = "NORMAL" | "PENDING" | "ARCHIVED" | "REJECTED";
export type PageStatus = "PUBLISHED" | "DRAFT" | "ARCHIVED";
export type MenuItemType =
  "PAGE" | "MEMORY" | "SEARCH" | "EXTERNAL" | "TERMS" | "CREDITS" | "LANGUAGE";

export interface Tag {
  id: string;
  name: string;
  slug: string;
}

export interface Attachment {
  id: string;
  memoryId?: string;
  url: string;
  type: string;
  metadata?: Record<string, unknown> | null;
  createdAt?: string;
}

export interface AssetUpload {
  key: string;
  contentBase64: string;
  memoryId?: string;
  contentType?: string;
  metadata?: Record<string, unknown>;
}

export interface Memory {
  id: string;
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
  metadata: Record<string, unknown>;
  attachments: Attachment[];
  tags: Tag[];
  createdAt: string;
  updatedAt: string;
}

export interface DashboardSummary {
  totalMemories: number;
  pendingMemories: number;
  publishedMemories: number;
  archivedMemories: number;
  rejectedMemories: number;
  totalUsers: number;
  recentActivity: Array<Pick<Memory, "id" | "title" | "status" | "createdAt">>;
}

export interface User {
  id: string;
  email: string;
  role: Role;
  createdAt: string;
}

export interface Page {
  id: string;
  slug: string;
  language: string;
  title: string;
  excerpt?: string | null;
  bodyMarkdown: string;
  status: PageStatus;
  linkedMemoryId?: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  id: string;
  memoryId?: string | null;
  memoryTitle?: string | null;
  authorName: string;
  authorEmail?: string | null;
  content: string;
  status: CommentStatus;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface MenuItem {
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
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AuthSession {
  token: string;
  role: Role;
  email: string;
}

export interface AgentQuery {
  query: string;
  limit?: number;
}

export interface AgentAnswer {
  query: string;
  answer: string;
  citations: Array<Pick<Memory, "id" | "title" | "excerpt"> & { url: string }>;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: Record<string, unknown>;
}
