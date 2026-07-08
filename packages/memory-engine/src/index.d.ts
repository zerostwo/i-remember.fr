export type GalaxyMemory = {
  id: string;
  publicId: string;
  legacyId?: string | number | null;
  title: string;
  content: string;
  excerpt: string;
  authorName: string;
  imageUrl: string;
  thumbnailUrl: string;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
  metadata: Record<string, unknown>;
};

export function normalizeGalaxyMemory(memory: Record<string, unknown>): GalaxyMemory;
export function normalizeGalaxyMemories(memories?: Array<Record<string, unknown>>): GalaxyMemory[];

export function MemoryGalaxy(props: {
  memories?: Array<Record<string, unknown>>;
  src?: string;
  title?: string;
  deterministic?: boolean;
  className?: string;
  style?: Record<string, string | number>;
}): unknown;

export const legacyRuntimePath: string;
