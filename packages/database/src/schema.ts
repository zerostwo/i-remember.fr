export const roles = ["ADMIN", "USER", "ANONYMOUS"] as const;
export const visibilityValues = ["PUBLIC", "UNLISTED", "PRIVATE"] as const;
export const memoryStatuses = ["NORMAL", "PENDING", "ARCHIVED", "REJECTED"] as const;

export type Role = (typeof roles)[number];
export type Visibility = (typeof visibilityValues)[number];
export type MemoryStatus = (typeof memoryStatuses)[number];
