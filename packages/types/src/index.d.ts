export type Role = "ADMIN" | "USER" | "ANONYMOUS";

export type Visibility = "PUBLIC" | "PRIVATE" | "UNLISTED";

export interface Memory {
  id: string;
  legacyId?: number;
  title: string;
  author: string;
  excerpt: string;
  content: string;
  url: string;
  imageUrl: string;
  thumbnailUrl: string;
  language: "en" | "fr" | "zh";
  createdAt: string;
  metadata: Record<string, unknown>;
}

export interface Attachment {
  id: string;
  memoryId: string;
  url: string;
  type: string;
  metadata?: Record<string, unknown>;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: Record<string, unknown>;
}
