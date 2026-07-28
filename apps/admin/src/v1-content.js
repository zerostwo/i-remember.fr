function pageStatus(value) {
  const normalized = String(value || "").toUpperCase();
  return ["PUBLISHED", "DRAFT", "ARCHIVED"].includes(normalized) ? normalized : "DRAFT";
}

function language(value, defaultLanguage = "en") {
  const fallback = String(defaultLanguage || "en").toLowerCase();
  const normalized = String(value || fallback).toLowerCase();
  if (["en", "fr", "zh"].includes(normalized)) return normalized;
  return ["en", "fr", "zh"].includes(fallback) ? fallback : "en";
}

async function contentLanguage(v1Api, record = {}) {
  const configured = record.defaultLanguage || record.siteDefaultLanguage;
  if (record.language || configured) return language(record.language, configured);
  try {
    const settings = await v1Api("/api/v1/settings");
    return language(settings?.defaultLanguage);
  } catch {
    return "en";
  }
}

function menuType(value) {
  const normalized = String(value || "").toUpperCase();
  return [
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
  ].includes(normalized)
    ? normalized
    : "PAGE";
}

function sourceMetadata(record = {}) {
  return {
    sourceRowId: record.id ?? record.rowId ?? null,
    sourceUid: record.uid || "",
  };
}

function jsonObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (!value) return {};
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function pageMetadata(record = {}) {
  return {
    ...jsonObject(record.metadataJson ?? record.metadata_json ?? record.metadata),
    ...sourceMetadata(record),
  };
}

export function v1PagePayload(
  page = {},
  defaultLanguage = page.defaultLanguage || page.siteDefaultLanguage || "en",
) {
  return {
    slug: String(page.slug || "page").trim(),
    language: language(page.language, defaultLanguage),
    title: String(page.title || "Untitled page").trim() || "Untitled page",
    excerpt: String(page.excerpt || "").slice(0, 600),
    bodyMarkdown: String(page.bodyMarkdown || page.body_markdown || ""),
    status: pageStatus(page.status),
    linkedMemoryId: page.linkedMemoryId || page.linked_memory_id || undefined,
    metadata: pageMetadata(page),
  };
}

export function v1PageMemory(page = {}) {
  const publicId = String(
    page.linkedMemoryPublicId ||
      page.linked_memory_public_id ||
      page.linkedMemoryId ||
      page.linked_memory_id ||
      "",
  ).trim();
  if (!publicId) return null;
  return {
    publicId,
    uid: page.linkedMemoryUid,
    language: language(page.language, page.defaultLanguage || page.siteDefaultLanguage || "en"),
    source: "page",
    title: page.title,
    author: "Songqi",
    excerpt: page.excerpt,
    bodyMarkdown: page.bodyMarkdown,
    isLongForm: true,
    dbStatus:
      pageStatus(page.status) === "PUBLISHED"
        ? "NORMAL"
        : pageStatus(page.status) === "ARCHIVED"
          ? "ARCHIVED"
          : "PENDING",
    metadata: {
      ...jsonObject(page.metadataJson ?? page.metadata_json ?? page.metadata),
      pageSlug: page.slug,
      linkedMemoryUid: page.linkedMemoryUid,
      isLongForm: true,
      source: "page",
    },
    tags: [page.slug, "page", "memory"].filter(Boolean),
  };
}

export async function syncV1Page(v1Api, page) {
  const defaultLanguage = await contentLanguage(v1Api, page);
  const payload = v1PagePayload(page, defaultLanguage);
  const path = `/api/v1/pages/${encodeURIComponent(page?.originalSlug || page?.slug || payload.slug)}?language=${encodeURIComponent(payload.language)}`;
  try {
    return await v1Api(path, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  } catch {
    return v1Api("/api/v1/pages", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }
}

export function v1MenuItemPayload(
  item = {},
  defaultLanguage = item.defaultLanguage || item.siteDefaultLanguage || "en",
) {
  const custom = jsonObject(item.metadataJson ?? item.metadata_json ?? item.metadata);
  return {
    uid: String(item.uid || `menu-${item.id || "item"}`),
    language: language(item.language, defaultLanguage),
    label: String(item.label || "Menu item").trim() || "Menu item",
    type: menuType(item.type),
    targetValue: item.targetValue || item.target_value || "",
    url: item.url || "",
    position: Number.isFinite(Number(item.position)) ? Number(item.position) : 0,
    isVisible: item.isVisible ?? item.is_visible ?? true,
    opensNewTab: item.opensNewTab ?? item.opens_new_tab ?? false,
    metadata: {
      ...custom,
      ...sourceMetadata(item),
      ...(item.parentId ? { parentId: item.parentId } : {}),
    },
  };
}

export async function findV1MenuItem(v1Api, item = {}, defaultLanguage) {
  const resolvedLanguage = defaultLanguage || (await contentLanguage(v1Api, item));
  const payload = v1MenuItemPayload(item, resolvedLanguage);
  const items = await v1Api(`/api/v1/menu-items?language=${encodeURIComponent(payload.language)}`);
  return (items || []).find((candidate) => {
    const metadata = candidate.metadata || {};
    return (
      candidate.uid === payload.uid ||
      (payload.metadata.sourceRowId !== null &&
        String(metadata.sourceRowId) === String(payload.metadata.sourceRowId))
    );
  });
}

export async function syncV1MenuItem(v1Api, item) {
  const defaultLanguage = await contentLanguage(v1Api, item);
  const payload = v1MenuItemPayload(item, defaultLanguage);
  const existing = await findV1MenuItem(v1Api, item, defaultLanguage).catch(() => null);
  if (existing) {
    return v1Api(`/api/v1/menu-items/${encodeURIComponent(existing.id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  }
  return v1Api("/api/v1/menu-items", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function deleteV1MenuItem(v1Api, item) {
  const existing = await findV1MenuItem(v1Api, item).catch(() => null);
  if (!existing) return null;
  return v1Api(`/api/v1/menu-items/${encodeURIComponent(existing.id)}`, {
    method: "DELETE",
  });
}

export function v1SettingsPayload(settings = {}) {
  return {
    siteTitle: String(settings.siteTitle || "Songqi").trim() || "Songqi",
    canonicalUrl: String(settings.canonicalUrl || "https://songqi.org").trim(),
    timezone: String(settings.timezone || "Asia/Shanghai").trim() || "Asia/Shanghai",
    defaultLanguage: language(settings.defaultLanguage),
    anonymousSubmissions: Boolean(settings.anonymousSubmissions),
    tracking: {
      enabled: Boolean(settings.tracking?.enabled),
      umamiSrc: String(settings.tracking?.umamiSrc || ""),
      umamiWebsiteId: String(settings.tracking?.umamiWebsiteId || ""),
    },
  };
}

export function syncV1Settings(v1Api, settings) {
  return v1Api("/api/v1/settings", {
    method: "PUT",
    body: JSON.stringify(v1SettingsPayload(settings)),
  });
}
