export const roles = ["ADMIN", "USER", "ANONYMOUS"] as const;
export const visibilityValues = ["PUBLIC", "UNLISTED", "PRIVATE"] as const;
export const memoryStatuses = ["NORMAL", "PENDING", "ARCHIVED", "REJECTED"] as const;
export const commentStatuses = ["NORMAL", "PENDING", "ARCHIVED", "REJECTED"] as const;
export const pageStatuses = ["PUBLISHED", "DRAFT", "ARCHIVED"] as const;
export const menuItemTypes = [
  "PAGE",
  "MEMORY",
  "SEARCH",
  "EXTERNAL",
  "GROUP",
  "TERMS",
  "CREDITS",
  "LANGUAGE",
  "SOUND",
  "SHARE",
  "LOGO",
] as const;

export type Role = (typeof roles)[number];
export type Visibility = (typeof visibilityValues)[number];
export type MemoryStatus = (typeof memoryStatuses)[number];
export type CommentStatus = (typeof commentStatuses)[number];
export type PageStatus = (typeof pageStatuses)[number];
export type MenuItemType = (typeof menuItemTypes)[number];
