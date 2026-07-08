export type Role = "ADMIN" | "USER" | "ANONYMOUS";
export type Visibility = "PUBLIC" | "PRIVATE" | "UNLISTED";
export type MemoryStatus = "NORMAL" | "PENDING" | "ARCHIVED" | "REJECTED";

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

export interface AuthSession {
  token: string;
  role: Role;
  email: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: Record<string, unknown>;
}
