import type {
  AssetUploadInput,
  MemoryInput,
  MemoryStatus,
  MemoryUpdateInput,
  Visibility,
} from "./domain.js";
import { ApiError } from "./errors.js";
import type { MemoryListQuery } from "./repositories.js";

const visibilityValues = new Set(["PUBLIC", "UNLISTED", "PRIVATE"]);
const statusValues = new Set(["NORMAL", "PENDING", "ARCHIVED", "REJECTED"]);

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

function has(value: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function tags(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const raw = Array.isArray(value) ? value : String(value).split(",");
  const seen = new Set<string>();
  return raw
    .map((tag) => text(tag, "", 80))
    .filter((tag) => {
      const key = tag.toLowerCase();
      if (!tag || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 24);
}

function attachments(value: unknown) {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw new ApiError(400, "Invalid attachments", "invalid_attachments");
  return value.slice(0, 24).map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new ApiError(400, "Invalid attachment", "invalid_attachment");
    }
    const record = item as Record<string, unknown>;
    const url = text(record.url, "", 2000);
    if (!url) throw new ApiError(400, "Attachment URL is required", "missing_attachment_url");
    return {
      url,
      type: text(record.type ?? record.contentType, "application/octet-stream", 120),
      metadata:
        record.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata)
          ? (record.metadata as Record<string, unknown>)
          : undefined,
    };
  });
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
    legacyId: optionalNumber(value.legacyId ?? value.legacy_id),
    authorName: text(value.authorName ?? value.author, "Anonymous", 120),
    visibility: visibility as Visibility,
    latitude: optionalNumber(value.latitude),
    longitude: optionalNumber(value.longitude),
    emotion: value.emotion ? text(value.emotion, "", 80) : undefined,
    metadata:
      value.metadata && typeof value.metadata === "object" && !Array.isArray(value.metadata)
        ? (value.metadata as Record<string, unknown>)
        : undefined,
    attachments: attachments(value.attachments),
    tags: tags(value.tags),
  };
}

export function memoryListQuery(searchParams: URLSearchParams): MemoryListQuery {
  const status = text(searchParams.get("status"), "NORMAL", 20).toUpperCase();
  const visibility = text(searchParams.get("visibility"), "PUBLIC", 20).toUpperCase();
  const limit = Math.min(Math.max(Number(searchParams.get("limit") || 100), 1), 200);
  const legacyId = optionalNumber(searchParams.get("legacyId") ?? searchParams.get("legacy_id"));

  if (status !== "ALL" && !statusValues.has(status)) {
    throw new ApiError(400, "Invalid status", "invalid_status");
  }
  if (visibility !== "ALL" && !visibilityValues.has(visibility)) {
    throw new ApiError(400, "Invalid visibility", "invalid_visibility");
  }

  return {
    q: searchParams.get("q") || searchParams.get("tag") || undefined,
    legacyId,
    limit,
    status: status === "ALL" ? "all" : (status as MemoryStatus),
    visibility: visibility === "ALL" ? "all" : (visibility as Visibility),
  };
}

export function memoryPatchInput(value: Record<string, unknown>): MemoryUpdateInput {
  const input: MemoryUpdateInput = {};

  if (has(value, "title")) {
    input.title = text(value.title, "", 180);
    if (!input.title) throw new ApiError(400, "Title is required", "missing_title");
  }
  if (has(value, "legacyId") || has(value, "legacy_id")) {
    input.legacyId = optionalNumber(value.legacyId ?? value.legacy_id);
  }

  if (has(value, "content") || has(value, "bodyMarkdown") || has(value, "text")) {
    input.content = text(value.content ?? value.bodyMarkdown ?? value.text, "", 50000);
    if (!input.content) throw new ApiError(400, "Content is required", "missing_content");
  }

  if (has(value, "authorName") || has(value, "author")) {
    input.authorName = text(value.authorName ?? value.author, "", 120);
  }

  if (has(value, "visibility")) {
    const visibility = text(value.visibility, "", 20).toUpperCase();
    if (!visibilityValues.has(visibility)) {
      throw new ApiError(400, "Invalid visibility", "invalid_visibility");
    }
    input.visibility = visibility as Visibility;
  }

  if (has(value, "status")) {
    const status = text(value.status, "", 20).toUpperCase();
    if (!statusValues.has(status)) {
      throw new ApiError(400, "Invalid status", "invalid_status");
    }
    input.status = status as MemoryStatus;
  }

  if (has(value, "latitude")) input.latitude = optionalNumber(value.latitude);
  if (has(value, "longitude")) input.longitude = optionalNumber(value.longitude);
  if (has(value, "emotion"))
    input.emotion = value.emotion ? text(value.emotion, "", 80) : undefined;
  if (has(value, "metadata")) {
    input.metadata =
      value.metadata && typeof value.metadata === "object" && !Array.isArray(value.metadata)
        ? (value.metadata as Record<string, unknown>)
        : undefined;
  }
  if (has(value, "attachments")) input.attachments = attachments(value.attachments) || [];
  if (has(value, "tags")) input.tags = tags(value.tags) || [];

  if (!Object.keys(input).length)
    throw new ApiError(400, "No memory fields to update", "empty_patch");
  return input;
}

export function assetUploadInput(value: Record<string, unknown>): AssetUploadInput {
  const key = text(value.key ?? value.filename, "", 240);
  const rawContent = text(value.contentBase64 ?? value.data, "", 15 * 1024 * 1024);
  const contentBase64 = rawContent.includes(",") ? rawContent.split(",").pop() || "" : rawContent;
  const contentType = value.contentType
    ? text(value.contentType, "", 120)
    : "application/octet-stream";

  if (!key) throw new ApiError(400, "Asset key is required", "missing_asset_key");
  if (!contentBase64) throw new ApiError(400, "Asset content is required", "missing_asset_content");

  return {
    key,
    contentBase64,
    contentType,
    metadata:
      value.metadata && typeof value.metadata === "object" && !Array.isArray(value.metadata)
        ? (value.metadata as Record<string, unknown>)
        : undefined,
  };
}
