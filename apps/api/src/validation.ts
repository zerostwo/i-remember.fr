import type {
  AgentQueryInput,
  AssetUploadInput,
  CommentInput,
  CommentStatus,
  CommentUpdateInput,
  MenuItemInput,
  MenuItemType,
  MenuItemUpdateInput,
  MemoryInput,
  MemoryStatus,
  MemoryUpdateInput,
  PageInput,
  PageStatus,
  PageUpdateInput,
  Visibility,
} from "./domain.js";
import {
  commentStatuses,
  menuItemTypes,
  memoryStatuses,
  pageStatuses,
  visibilityValues as schemaVisibilityValues,
} from "@i-remember/database";
import { ApiError } from "./errors.js";
import type { CommentListQuery, MemoryListQuery } from "./repositories.js";

const visibilityValues = new Set<string>(schemaVisibilityValues);
const memoryStatusValues = new Set<string>(memoryStatuses);
const commentStatusValues = new Set<string>(commentStatuses);
const pageStatusValues = new Set<string>(pageStatuses);
const menuItemTypeValues = new Set<string>(menuItemTypes);
const languageValues = new Set(["en", "fr", "zh"]);

function text(value: unknown, fallback = "", max = 1000) {
  return String(value ?? fallback)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function bodyText(value: unknown, fallback = "", max = 50000) {
  return String(value ?? fallback)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim()
    .slice(0, max);
}

function optionalNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const next = Number(value);
  if (!Number.isFinite(next)) throw new ApiError(400, "Invalid numeric value", "invalid_number");
  return next;
}

function coordinate(value: unknown, min: number, max: number, code: string) {
  const next = optionalNumber(value);
  if (next === undefined) return undefined;
  if (next < min || next > max) throw new ApiError(400, "Invalid coordinate", code);
  return next;
}

function limitParam(searchParams: URLSearchParams, fallback = 100) {
  const raw = searchParams.get("limit");
  if (raw === null || raw === "") return fallback;
  const limit = Number(raw);
  if (!Number.isFinite(limit) || limit < 1) {
    throw new ApiError(400, "Invalid limit", "invalid_limit");
  }
  return Math.min(Math.floor(limit), 200);
}

function has(value: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function bool(value: unknown, fallback?: boolean) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  throw new ApiError(400, "Invalid boolean value", "invalid_boolean");
}

function language(value: unknown, fallback = "en") {
  const next = text(value, fallback, 12).toLowerCase();
  if (!languageValues.has(next)) throw new ApiError(400, "Invalid language", "invalid_language");
  return next;
}

function metadata(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function embedding(value: unknown) {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw new ApiError(400, "Invalid embedding", "invalid_embedding");
  return value.map((item) => {
    const next = Number(item);
    if (!Number.isFinite(next)) throw new ApiError(400, "Invalid embedding", "invalid_embedding");
    return next;
  });
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

function base64Content(value: unknown) {
  const raw = bodyText(value, "", 15 * 1024 * 1024);
  const content = (raw.includes(",") ? raw.split(",").pop() || "" : raw).replace(/\s+/g, "");
  if (!content) throw new ApiError(400, "Asset content is required", "missing_asset_content");
  if (
    !/^[A-Za-z0-9+/]+={0,2}$/.test(content) ||
    /=[^=]/.test(content) ||
    content.length % 4 === 1
  ) {
    throw new ApiError(400, "Invalid asset content", "invalid_asset_content");
  }
  return content;
}

export function assetKeyInput(value: unknown, missingCode = "invalid_asset_key") {
  const parts = text(value, "", 240).replace(/\\/g, "/").split("/").filter(Boolean);
  if (!parts.length) {
    throw new ApiError(400, "Asset key is required", missingCode);
  }
  if (parts.some((part) => part === "." || part === "..")) {
    throw new ApiError(400, "Invalid asset key", "invalid_asset_key");
  }
  return parts.join("/");
}

export function pageSlugInput(value: unknown, missingCode = "invalid_page_slug") {
  const slug = text(value, "", 120).toLowerCase();
  if (!slug) throw new ApiError(400, "Page slug is required", missingCode);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new ApiError(400, "Invalid page slug", "invalid_page_slug");
  }
  return slug;
}

export function memoryInput(value: Record<string, unknown>): MemoryInput {
  const title = text(value.title, "", 180);
  const content = bodyText(value.content ?? value.bodyMarkdown ?? value.text, "", 50000);
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
    authorId:
      value.authorId || value.author_id
        ? text(value.authorId ?? value.author_id, "", 240)
        : undefined,
    authorName: text(value.authorName ?? value.author, "Anonymous", 120),
    visibility: visibility as Visibility,
    latitude: coordinate(value.latitude, -90, 90, "invalid_latitude"),
    longitude: coordinate(value.longitude, -180, 180, "invalid_longitude"),
    emotion: value.emotion ? text(value.emotion, "", 80) : undefined,
    metadata:
      value.metadata && typeof value.metadata === "object" && !Array.isArray(value.metadata)
        ? (value.metadata as Record<string, unknown>)
        : undefined,
    embedding: embedding(value.embedding),
    aiSummary:
      value.aiSummary || value.ai_summary
        ? text(value.aiSummary ?? value.ai_summary, "", 4000)
        : undefined,
    knowledgeGraph: metadata(value.knowledgeGraph ?? value.knowledge_graph),
    attachments: attachments(value.attachments),
    tags: tags(value.tags),
  };
}

export function memoryListQuery(searchParams: URLSearchParams): MemoryListQuery {
  const status = text(searchParams.get("status"), "NORMAL", 20).toUpperCase();
  const visibility = text(searchParams.get("visibility"), "PUBLIC", 20).toUpperCase();
  const limit = limitParam(searchParams);
  const legacyId = optionalNumber(searchParams.get("legacyId") ?? searchParams.get("legacy_id"));

  if (status !== "ALL" && !memoryStatusValues.has(status)) {
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
    input.content = bodyText(value.content ?? value.bodyMarkdown ?? value.text, "", 50000);
    if (!input.content) throw new ApiError(400, "Content is required", "missing_content");
  }

  if (has(value, "authorName") || has(value, "author")) {
    input.authorName = text(value.authorName ?? value.author, "", 120);
  }

  if (has(value, "authorId") || has(value, "author_id")) {
    const authorId = text(value.authorId ?? value.author_id, "", 240);
    if (authorId) input.authorId = authorId;
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
    if (!memoryStatusValues.has(status)) {
      throw new ApiError(400, "Invalid status", "invalid_status");
    }
    input.status = status as MemoryStatus;
  }

  if (has(value, "latitude"))
    input.latitude = coordinate(value.latitude, -90, 90, "invalid_latitude");
  if (has(value, "longitude"))
    input.longitude = coordinate(value.longitude, -180, 180, "invalid_longitude");
  if (has(value, "emotion"))
    input.emotion = value.emotion ? text(value.emotion, "", 80) : undefined;
  if (has(value, "metadata")) {
    input.metadata =
      value.metadata && typeof value.metadata === "object" && !Array.isArray(value.metadata)
        ? (value.metadata as Record<string, unknown>)
        : undefined;
  }
  if (has(value, "embedding")) input.embedding = embedding(value.embedding);
  if (has(value, "aiSummary") || has(value, "ai_summary")) {
    input.aiSummary = text(value.aiSummary ?? value.ai_summary, "", 4000);
  }
  if (has(value, "knowledgeGraph") || has(value, "knowledge_graph")) {
    input.knowledgeGraph = metadata(value.knowledgeGraph ?? value.knowledge_graph);
  }
  if (has(value, "attachments")) input.attachments = attachments(value.attachments) || [];
  if (has(value, "tags")) input.tags = tags(value.tags) || [];

  if (!Object.keys(input).length)
    throw new ApiError(400, "No memory fields to update", "empty_patch");
  return input;
}

export function assetUploadInput(value: Record<string, unknown>): AssetUploadInput {
  const key = assetKeyInput(value.key ?? value.filename, "missing_asset_key");
  const contentType = value.contentType
    ? text(value.contentType, "", 120)
    : "application/octet-stream";

  const contentBase64 = base64Content(value.contentBase64 ?? value.data);

  return {
    key,
    contentBase64,
    memoryId:
      value.memoryId || value.memory_id
        ? text(value.memoryId ?? value.memory_id, "", 240)
        : undefined,
    contentType,
    metadata:
      value.metadata && typeof value.metadata === "object" && !Array.isArray(value.metadata)
        ? (value.metadata as Record<string, unknown>)
        : undefined,
  };
}

export function languageQuery(searchParams: URLSearchParams) {
  return language(searchParams.get("language") ?? searchParams.get("ln") ?? "en");
}

export function pageInput(value: Record<string, unknown>): PageInput {
  const slug = pageSlugInput(value.slug, "missing_page_slug");
  const title = text(value.title, "", 180);
  const status = text(value.status, "DRAFT", 20).toUpperCase();

  if (!title) throw new ApiError(400, "Page title is required", "missing_page_title");
  if (!pageStatusValues.has(status)) {
    throw new ApiError(400, "Invalid page status", "invalid_page_status");
  }

  return {
    slug,
    language: language(value.language ?? value.ln ?? "en"),
    title,
    excerpt: value.excerpt ? text(value.excerpt, "", 600) : undefined,
    bodyMarkdown: bodyText(value.bodyMarkdown ?? value.body_markdown ?? value.content, "", 50000),
    status: status as PageStatus,
    linkedMemoryId:
      value.linkedMemoryId || value.linked_memory_id
        ? text(value.linkedMemoryId ?? value.linked_memory_id, "", 240)
        : undefined,
    metadata: metadata(value.metadata),
  };
}

export function pagePatchInput(value: Record<string, unknown>): PageUpdateInput {
  const input: PageUpdateInput = {};
  if (has(value, "slug")) {
    input.slug = pageSlugInput(value.slug, "missing_page_slug");
  }
  if (has(value, "language") || has(value, "ln"))
    input.language = language(value.language ?? value.ln);
  if (has(value, "title")) {
    input.title = text(value.title, "", 180);
    if (!input.title) throw new ApiError(400, "Page title is required", "missing_page_title");
  }
  if (has(value, "excerpt"))
    input.excerpt = value.excerpt ? text(value.excerpt, "", 600) : undefined;
  if (has(value, "bodyMarkdown") || has(value, "body_markdown") || has(value, "content")) {
    input.bodyMarkdown = bodyText(
      value.bodyMarkdown ?? value.body_markdown ?? value.content,
      "",
      50000,
    );
  }
  if (has(value, "status")) {
    const status = text(value.status, "", 20).toUpperCase();
    if (!pageStatusValues.has(status)) {
      throw new ApiError(400, "Invalid page status", "invalid_page_status");
    }
    input.status = status as PageStatus;
  }
  if (has(value, "linkedMemoryId") || has(value, "linked_memory_id")) {
    input.linkedMemoryId =
      value.linkedMemoryId || value.linked_memory_id
        ? text(value.linkedMemoryId ?? value.linked_memory_id, "", 240)
        : undefined;
  }
  if (has(value, "metadata")) input.metadata = metadata(value.metadata);
  if (!Object.keys(input).length)
    throw new ApiError(400, "No page fields to update", "empty_patch");
  return input;
}

export function menuItemInput(value: Record<string, unknown>): MenuItemInput {
  const label = text(value.label, "", 120);
  const type = text(value.type ?? value.itemType, "", 20).toUpperCase();
  if (!label) throw new ApiError(400, "Menu label is required", "missing_menu_label");
  if (!menuItemTypeValues.has(type)) {
    throw new ApiError(400, "Invalid menu item type", "invalid_menu_item_type");
  }
  return {
    uid: value.uid ? text(value.uid, "", 120) : undefined,
    language: language(value.language ?? value.ln ?? "en"),
    label,
    type: type as MenuItemType,
    targetValue:
      value.targetValue || value.target_value
        ? text(value.targetValue ?? value.target_value, "", 240)
        : undefined,
    url: value.url ? text(value.url, "", 2000) : undefined,
    position: optionalNumber(value.position),
    isVisible: bool(value.isVisible ?? value.is_visible, true),
    opensNewTab: bool(value.opensNewTab ?? value.opens_new_tab, false),
    metadata: metadata(value.metadata),
  };
}

export function menuItemPatchInput(value: Record<string, unknown>): MenuItemUpdateInput {
  const input: MenuItemUpdateInput = {};
  if (has(value, "uid")) input.uid = value.uid ? text(value.uid, "", 120) : undefined;
  if (has(value, "language") || has(value, "ln"))
    input.language = language(value.language ?? value.ln);
  if (has(value, "label")) {
    input.label = text(value.label, "", 120);
    if (!input.label) throw new ApiError(400, "Menu label is required", "missing_menu_label");
  }
  if (has(value, "type") || has(value, "itemType")) {
    const type = text(value.type ?? value.itemType, "", 20).toUpperCase();
    if (!menuItemTypeValues.has(type)) {
      throw new ApiError(400, "Invalid menu item type", "invalid_menu_item_type");
    }
    input.type = type as MenuItemType;
  }
  if (has(value, "targetValue") || has(value, "target_value")) {
    input.targetValue =
      value.targetValue || value.target_value
        ? text(value.targetValue ?? value.target_value, "", 240)
        : undefined;
  }
  if (has(value, "url")) input.url = value.url ? text(value.url, "", 2000) : undefined;
  if (has(value, "position")) input.position = optionalNumber(value.position);
  if (has(value, "isVisible") || has(value, "is_visible")) {
    input.isVisible = bool(value.isVisible ?? value.is_visible);
  }
  if (has(value, "opensNewTab") || has(value, "opens_new_tab")) {
    input.opensNewTab = bool(value.opensNewTab ?? value.opens_new_tab);
  }
  if (has(value, "metadata")) input.metadata = metadata(value.metadata);
  if (!Object.keys(input).length)
    throw new ApiError(400, "No menu fields to update", "empty_patch");
  return input;
}

function commentStatus(value: unknown, fallback = "PENDING") {
  const status = text(value, fallback, 20).toUpperCase();
  if (!commentStatusValues.has(status)) {
    throw new ApiError(400, "Invalid comment status", "invalid_comment_status");
  }
  return status as CommentStatus;
}

export function commentListQuery(searchParams: URLSearchParams): CommentListQuery {
  const status = text(searchParams.get("status"), "PENDING", 20).toUpperCase();
  const limit = limitParam(searchParams);
  if (status !== "ALL" && !commentStatusValues.has(status)) {
    throw new ApiError(400, "Invalid comment status", "invalid_comment_status");
  }
  return {
    q: searchParams.get("q") || undefined,
    limit,
    memoryId: searchParams.get("memoryId") || searchParams.get("memory_id") || undefined,
    status: status === "ALL" ? "all" : (status as CommentStatus),
  };
}

export function commentInput(value: Record<string, unknown>): CommentInput {
  const content = bodyText(value.content ?? value.body ?? value.text, "", 10000);
  if (!content) throw new ApiError(400, "Comment content is required", "missing_comment_content");
  return {
    memoryId:
      value.memoryId || value.memory_id
        ? text(value.memoryId ?? value.memory_id, "", 240)
        : undefined,
    authorName: text(value.authorName ?? value.author, "Anonymous", 120),
    authorEmail:
      value.authorEmail || value.author_email
        ? text(value.authorEmail ?? value.author_email, "", 240)
        : undefined,
    content,
    status: commentStatus(value.status),
    metadata: metadata(value.metadata),
  };
}

export function commentPatchInput(value: Record<string, unknown>): CommentUpdateInput {
  const input: CommentUpdateInput = {};
  if (has(value, "memoryId") || has(value, "memory_id")) {
    input.memoryId =
      value.memoryId || value.memory_id
        ? text(value.memoryId ?? value.memory_id, "", 240)
        : undefined;
  }
  if (has(value, "authorName") || has(value, "author"))
    input.authorName = text(value.authorName ?? value.author, "Anonymous", 120);
  if (has(value, "authorEmail") || has(value, "author_email"))
    input.authorEmail =
      value.authorEmail || value.author_email
        ? text(value.authorEmail ?? value.author_email, "", 240)
        : undefined;
  if (has(value, "content") || has(value, "body") || has(value, "text")) {
    input.content = bodyText(value.content ?? value.body ?? value.text, "", 10000);
    if (!input.content)
      throw new ApiError(400, "Comment content is required", "missing_comment_content");
  }
  if (has(value, "status")) input.status = commentStatus(value.status);
  if (has(value, "metadata")) input.metadata = metadata(value.metadata);
  if (!Object.keys(input).length)
    throw new ApiError(400, "No comment fields to update", "empty_patch");
  return input;
}

export function settingsInput(value: Record<string, unknown>) {
  const entries = Object.entries(value).filter(([key]) => key.trim());
  if (!entries.length) throw new ApiError(400, "No settings to update", "empty_settings");
  return Object.fromEntries(entries.map(([key, next]) => [text(key, "", 120), next]));
}

export function agentQueryInput(value: Record<string, unknown>): AgentQueryInput {
  const query = text(value.query ?? value.q, "", 240);
  const requestedLimit = Number(value.limit ?? 5);
  if (!Number.isFinite(requestedLimit) || requestedLimit < 1) {
    throw new ApiError(400, "Invalid limit", "invalid_limit");
  }
  const limit = Math.min(Math.floor(requestedLimit), 10);

  if (!query) throw new ApiError(400, "Agent query is required", "missing_agent_query");

  return { query, limit };
}
