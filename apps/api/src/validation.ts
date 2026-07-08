import type { MemoryInput, Visibility } from "./domain.js";
import { ApiError } from "./errors.js";

const visibilityValues = new Set(["PUBLIC", "UNLISTED", "PRIVATE"]);

function text(value: unknown, fallback = "", max = 1000) {
  return String(value ?? fallback)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function optionalNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const next = Number(value);
  if (!Number.isFinite(next)) throw new ApiError(400, "Invalid numeric value", "invalid_number");
  return next;
}

export function memoryInput(value: Record<string, unknown>): MemoryInput {
  const title = text(value.title, "", 180);
  const content = text(value.content ?? value.bodyMarkdown ?? value.text, "", 50000);
  const visibility = text(value.visibility, "PUBLIC", 20).toUpperCase();

  if (!title) throw new ApiError(400, "Title is required", "missing_title");
  if (!content) throw new ApiError(400, "Content is required", "missing_content");
  if (!visibilityValues.has(visibility)) {
    throw new ApiError(400, "Invalid visibility", "invalid_visibility");
  }

  return {
    title,
    content,
    authorName: text(value.authorName ?? value.author, "Anonymous", 120),
    visibility: visibility as Visibility,
    latitude: optionalNumber(value.latitude),
    longitude: optionalNumber(value.longitude),
    emotion: value.emotion ? text(value.emotion, "", 80) : undefined,
    metadata:
      value.metadata && typeof value.metadata === "object" && !Array.isArray(value.metadata)
        ? (value.metadata as Record<string, unknown>)
        : undefined,
  };
}
