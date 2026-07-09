import type { CSSProperties, ReactElement } from "react";

export type GalaxyMemory = {
  id: string;
  publicId: string;
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
export function normalizeGalaxyPost(
  memory: Record<string, unknown>,
  index?: number,
): Record<string, string>;
export function normalizeGalaxyPosts(
  memories?: Array<Record<string, unknown>>,
): Array<Record<string, string>>;
export function memoryFadePercent(memories?: Array<Record<string, unknown>>, now?: number): number;

export function MemoryGalaxy(props: {
  memories?: Array<Record<string, unknown>>;
  src?: string;
  title?: string;
  deterministic?: boolean;
  className?: string;
  style?: CSSProperties;
}): ReactElement;

export const runtimePath: string;
