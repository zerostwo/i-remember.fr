import { renderSeo, sitemapXml, siteOrigin, publicPosts } from "./seo.js";
import { markdownToHtml, memoryBody, memoryPreview } from "../../packages/content/src/markdown.js";
import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { memoryFadePercent } from "../../packages/memory-engine/src/normalize.js";

const rootUrl = new URL("../../", import.meta.url);
const postIdOffset = 1248;
const postSearchResultMax = 200;
const colorMapStartupDelayMs = 1000;
const apiFetchTimeoutMs = 2500;
const siteSettingsCacheMs = 5000;
const maxJsonBodyBytes = 64 * 1024;
const maxFormBodyBytes = 256 * 1024;
const maxUploadBodyBytes = Number.parseInt(
  process.env.I_REMEMBER_MAX_UPLOAD_BYTES || `${8 * 1024 * 1024}`,
  10,
);
const maxImagePixels = Number.parseInt(
  process.env.I_REMEMBER_MAX_IMAGE_PIXELS || `${30_000_000}`,
  10,
);
const htmlUrls = {
  en: new URL("./index.html", rootUrl),
  fr: new URL("./fr.html", rootUrl),
  zh: new URL("./index.html", rootUrl),
};

const legalHtmlUrl = new URL("./legal.html", rootUrl);
const adminSourceHtmlUrl = new URL("./admin.html", rootUrl);
const adminDistHtmlUrl = new URL("./dist/admin.html", rootUrl);
const instagramTokenCallbackHtmlUrl = new URL(
  "./public/api/instagram-token-callback",
  rootUrl,
);
const fallbackPostImages = {
  resized: {
    data: readFileSync(
      new URL("./public/uploads/posts/revival-upload/resized.jpg", rootUrl),
    ),
    mimeType: "image/jpeg",
  },
  thumb: {
    data: readFileSync(
      new URL("./public/uploads/posts/revival-upload/thumb.jpg", rootUrl),
    ),
    mimeType: "image/jpeg",
  },
};

const uploadedImages = new Map();
const rateLimitBuckets = new Map();

function runtimeDataDir() {
  return resolve(process.env.I_REMEMBER_DATA_DIR || ".revival-storage");
}

class HttpError extends Error {
  constructor(statusCode, message, errorMsg = "unexpected") {
    super(message);
    this.statusCode = statusCode;
    this.errorMsg = errorMsg;
    this.expose = statusCode < 500;
  }
}

function logInfo(event, fields = {}) {
  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    level: "info",
    event,
    ...fields,
  }));
}

const curatedTagsByLanguage = {
  en: [
    "family",
    "friends",
    "summer",
    "school",
    "love",
    "mother",
    "father",
    "childhood",
    "holiday",
    "birthday",
    "beach",
    "home",
    "life",
    "memory",
  ],
  fr: [
    "souvenir",
    "souvenirs",
    "amis",
    "famille",
    "vacances",
    "ete",
    "ecole",
    "amour",
    "maison",
    "enfance",
    "anniversaire",
    "maman",
    "papa",
    "vie",
  ],
  zh: [
    "回忆",
    "家人",
    "朋友",
    "童年",
    "夏天",
    "学校",
    "生日",
    "旅行",
    "母亲",
    "父亲",
    "生活",
    "爱",
  ],
};

const relatedTagStopWords = {
  en: new Set([
    "about",
    "all",
    "and",
    "are",
    "been",
    "but",
    "for",
    "from",
    "had",
    "has",
    "have",
    "her",
    "his",
    "how",
    "our",
    "that",
    "the",
    "their",
    "there",
    "these",
    "this",
    "those",
    "was",
    "were",
    "what",
    "when",
    "where",
    "which",
    "who",
    "why",
    "with",
    "you",
    "your",
  ]),
  fr: new Set([
    "avec",
    "aux",
    "avait",
    "avoir",
    "dans",
    "des",
    "elle",
    "est",
    "ete",
    "etre",
    "les",
    "leur",
    "leurs",
    "mais",
    "mes",
    "mon",
    "nous",
    "pas",
    "plus",
    "pour",
    "que",
    "qui",
    "sans",
    "ses",
    "son",
    "sur",
    "tous",
    "tout",
    "une",
    "vous",
  ]),
  zh: new Set(["一个", "一些", "这个", "那个", "我们", "你们", "他们", "自己"]),
};

export function normalizeLanguage(value = "") {
  const language = String(value || "").toLowerCase();
  if (language === "fr" || language === "zh") return language;
  return "en";
}

function languageId(language) {
  if (normalizeLanguage(language) === "fr") return "1";
  if (normalizeLanguage(language) === "zh") return "3";
  return "2";
}

export function languageFromPath(pathname, defaultLanguage = "en") {
  if (pathname === "/fr" || pathname.startsWith("/fr/")) return "fr";
  if (pathname === "/zh" || pathname.startsWith("/zh/")) return "zh";
  if (pathname === "/en" || pathname.startsWith("/en/")) return "en";
  return normalizeLanguage(defaultLanguage);
}

function languageFromRequest(url, pathname, defaultLanguage = "en") {
  return normalizeLanguage(url.searchParams.get("ln") || languageFromPath(pathname, defaultLanguage));
}

function contentLanguage(defaultLanguage = "en") {
  return normalizeLanguage(defaultLanguage);
}

export function normalizeTag(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function routeTag(value = "") {
  return normalizeTag(value).replace(/\s+/g, "-");
}

function postHaystack(post) {
  return normalizeTag(
    `${post.name || ""} ${post.title || ""} ${post.excerpt || ""} ${post.text || ""} ${post.body_markdown || ""}`,
  );
}

function postHaystackTokens(post) {
  return postHaystack(post).split(" ").filter(Boolean);
}

function matchingPosts(posts, tag) {
  const normalized = normalizeTag(tag);
  if (!normalized) return posts;

  const words = normalized.split(" ").filter(Boolean);
  const exact = posts.filter((post) => {
    const haystack = postHaystack(post);
    if (words.length === 1) {
      return postHaystackTokens(post).includes(words[0]) || haystack.includes(words[0]);
    }
    return haystack.includes(normalized);
  });
  if (exact.length) return exact;

  return posts.filter((post) => {
    const tokens = postHaystackTokens(post);
    return words.some((word) => {
      return word.length > 1 && tokens.some((token) => token.includes(word));
    });
  });
}

function numericPostId(post) {
  const id = Number.parseInt(post?.id, 10);
  return Number.isFinite(id) ? id : -1;
}

function paginatePosts(posts, url) {
  const lastId = url.searchParams.get("lastId");
  const index = lastId ? posts.findIndex((post) => String(post.id) === lastId) : -1;
  // The internal numeric handle is derived from a random public ID, not chronology.
  const page = lastId ? (index < 0 ? [] : posts.slice(index + 1)) : posts;

  return page.slice(0, postSearchResultMax);
}

function uniquePosts(posts) {
  const seen = new Set();
  return posts.filter((post) => {
    const key = String(post.public_id || post.uid || post.id || "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function textTagTokens(value = "", language = "en") {
  const stopWords = relatedTagStopWords[normalizeLanguage(language)];
  const matches = String(value).toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  return [...new Set(matches)].filter((word) => {
    return word.length > 1 && !stopWords.has(word);
  });
}

function relatedTagCountsForPosts(post, posts, language = "en") {
  if (post.tags && Object.keys(post.tags).length) return post.tags;

  const ownTokens = textTagTokens(post.text, language);
  const otherTokenSets = posts
    .filter((candidate) => String(candidate.id) !== String(post.id))
    .map((candidate) => {
      return new Set(
        textTagTokens(`${candidate.name || ""} ${candidate.text || ""}`, language),
      );
    });
  const related = {};

  for (const token of ownTokens) {
    const count = otherTokenSets.reduce((total, tokenSet) => {
      return total + (tokenSet.has(token) ? 1 : 0);
    }, 0);
    if (count > 0) related[token] = count;
  }

  return Object.fromEntries(
    Object.entries(related).sort((left, right) => {
      return right[1] - left[1] || left[0].localeCompare(right[0]);
    }),
  );
}

function autocompleteList(posts, fragment, language = "en") {
  const normalized = routeTag(fragment);
  if (!normalized) return [];

  const extracted = new Set(curatedTagsByLanguage[normalizeLanguage(language)]);
  for (const post of posts) {
    const text = postHaystack(post);
    for (const token of text.split(" ")) {
      if (token.length > 1) extracted.add(token);
    }
  }

  return [...extracted]
    .map(routeTag)
    .filter((tag) => tag.startsWith(normalized) && tag !== normalized)
    .sort((a, b) => a.length - b.length || a.localeCompare(b))
    .slice(0, 3);
}

function trackingDetails(settings = {}) {
  const tracking = settings?.tracking || settings;
  if (!tracking?.enabled || !tracking.umamiSrc || !tracking.umamiWebsiteId) return null;

  let scriptUrl;
  try {
    scriptUrl = new URL(String(tracking.umamiSrc));
  } catch (_error) {
    return null;
  }
  if (
    !["http:", "https:"].includes(scriptUrl.protocol) ||
    scriptUrl.username ||
    scriptUrl.password
  ) {
    return null;
  }

  return {
    origin: scriptUrl.origin,
    src: scriptUrl.href,
    websiteId: String(tracking.umamiWebsiteId),
  };
}

function setSecurityHeaders(res, { html = false, tracking = null } = {}) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (html) {
    const tracker = trackingDetails(tracking);
    const trackingSource = tracker ? ` ${tracker.origin}` : "";
    res.setHeader(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'self'",
        "img-src 'self' data: blob:",
        "media-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        `script-src 'self' 'unsafe-inline' 'unsafe-eval'${trackingSource}`,
        `connect-src 'self'${trackingSource}`,
        "form-action 'self'",
      ].join("; "),
    );
  }
}

function sendJson(req, res, payload, statusCode = 200) {
  const url = new URL(req.url || "/", "http://i-remember.local");
  const callback = url.searchParams.get("callback");
  const supportsJsonp =
    req.method === "GET" &&
    callback &&
    /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(callback);
  const json = JSON.stringify(payload);
  const body = supportsJsonp ? `${callback}(${json});` : json;

  res.statusCode = statusCode;
  setSecurityHeaders(res);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader(
    "Content-Type",
    supportsJsonp
      ? "application/javascript; charset=utf-8"
      : "application/json; charset=utf-8",
  );
  res.end(body);
}

function sendStatus(res, statusCode, message) {
  res.statusCode = statusCode;
  setSecurityHeaders(res);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end(message);
}

function sendHtml(res, html, { tracking = null } = {}) {
  res.statusCode = 200;
  setSecurityHeaders(res, { html: true, tracking });
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(html);
}

function clientAddress(req) {
  return req.socket?.remoteAddress || "unknown";
}

function assertRateLimit(req, bucketName, limit, windowMs) {
  const now = Date.now();
  const key = `${bucketName}:${clientAddress(req)}`;
  const bucket = rateLimitBuckets.get(key) || [];
  const active = bucket.filter((timestamp) => now - timestamp < windowMs);
  if (active.length >= limit) {
    rateLimitBuckets.set(key, active);
    throw new HttpError(429, "Too many requests", "rate_limited");
  }
  active.push(now);
  rateLimitBuckets.set(key, active);
}

function assertSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return;
  if (typeof origin !== "string") {
    throw new HttpError(403, "Invalid origin", "invalid_origin");
  }

  let parsed;
  try {
    parsed = new URL(origin);
  } catch (error) {
    throw new HttpError(403, "Invalid origin", "invalid_origin");
  }

  const host = String(req.headers.host || "").trim().toLowerCase();
  if (
    !host ||
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.origin !== origin ||
    parsed.host.toLowerCase() !== host
  ) {
    throw new HttpError(403, "Cross-origin writes are not allowed", "invalid_origin");
  }
}

function collectRequest(req, limitBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let rejected = false;
    req.on("data", (chunk) => {
      if (rejected) return;
      size += chunk.length;
      if (size > limitBytes) {
        rejected = true;
        reject(new HttpError(413, "Request body too large", "request_too_large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!rejected) resolve(Buffer.concat(chunks));
    });
    req.on("error", (error) => {
      if (!rejected) reject(error);
    });
  });
}

function parseMultipart(req, body) {
  const contentType = req.headers["content-type"] || "";
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  const fields = {};
  const files = {};
  if (!boundaryMatch) return { fields, files };

  const boundary = boundaryMatch[1] || boundaryMatch[2];
  const marker = Buffer.from(`--${boundary}`);
  let markerIndex = body.indexOf(marker);

  while (markerIndex !== -1) {
    const partStart = markerIndex + marker.length;
    const nextMarkerIndex = body.indexOf(marker, partStart);
    if (nextMarkerIndex === -1) break;

    let part = body.slice(partStart, nextMarkerIndex);
    if (part.subarray(0, 2).toString("utf8") === "\r\n") {
      part = part.subarray(2);
    }
    if (part.subarray(-2).toString("utf8") === "\r\n") {
      part = part.subarray(0, -2);
    }

    const headerEnd = part.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd !== -1) {
      const headers = part.subarray(0, headerEnd).toString("utf8");
      const content = part.subarray(headerEnd + 4);
      const disposition =
        headers.match(/^content-disposition:\s*([^\r\n]+)/im)?.[1] || "";
      const name = disposition.match(/name="([^"]+)"/)?.[1];
      const filename = disposition.match(/filename="([^"]*)"/)?.[1];
      const fileType =
        headers.match(/^content-type:\s*([^\r\n]+)/im)?.[1]?.trim() ||
        "application/octet-stream";

      if (name && filename) {
        files[name] = {
          data: content,
          filename,
          contentType: fileType,
        };
      } else if (name) {
        fields[name] = content.toString("utf8");
      }
    }

    markerIndex = nextMarkerIndex;
  }

  return { fields, files };
}

function parseFields(req, body) {
  const contentType = req.headers["content-type"] || "";
  const fields = {};

  if (contentType.includes("application/json")) {
    return parseJsonObject(body);
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(body.toString("utf8"));
    for (const [key, value] of params.entries()) fields[key] = value;
    return fields;
  }

  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) return fields;

  const boundary = `--${boundaryMatch[1] || boundaryMatch[2]}`;
  const parts = body.toString("binary").split(boundary);

  for (const part of parts) {
    const nameMatch = part.match(/name="([^"]+)"/);
    if (!nameMatch) continue;

    const splitIndex = part.indexOf("\r\n\r\n");
    if (splitIndex === -1) continue;

    let value = part.slice(splitIndex + 4);
    value = value.replace(/\r\n--$/, "").replace(/\r\n$/, "");
    fields[nameMatch[1]] = Buffer.from(value, "binary").toString("utf8");
  }

  return fields;
}

function parseJsonObject(body) {
  if (!body.length) return {};

  try {
    const value = JSON.parse(body.toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("JSON body must be an object");
    }
    return value;
  } catch (error) {
    throw new HttpError(400, "Invalid JSON body", "invalid_json");
  }
}

function firstUploadedImage(files) {
  return Object.values(files).find((file) => {
    return file?.filename && file.data?.length;
  });
}

function storedMimeType(file) {
  if (/^image\/(gif|jpeg|jpg|png|webp)$/i.test(file.contentType)) {
    return file.contentType.replace(/^image\/jpg$/i, "image/jpeg");
  }

  if (/\.png$/i.test(file.filename)) return "image/png";
  if (/\.gif$/i.test(file.filename)) return "image/gif";
  if (/\.webp$/i.test(file.filename)) return "image/webp";
  return "image/jpeg";
}

function mimeTypeForPath(pathname) {
  if (/\.png$/i.test(pathname)) return "image/png";
  if (/\.gif$/i.test(pathname)) return "image/gif";
  if (/\.webp$/i.test(pathname)) return "image/webp";
  return "image/jpeg";
}

function htmlText(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function excerptFromMarkdown(value = "", title = "") {
  const preview = memoryPreview({ content: value, title });
  return preview.text + (preview.truncated ? "…" : "");
}

function normalizeLegacyDate(value) {
  if (!value) return sqlTimestamp(new Date());
  if (String(value).includes("T")) return sqlTimestamp(new Date(value));
  return String(value).replace("T", " ").replace(/\.\d+Z$/, "");
}

function sqlTimestamp(date) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function localPublicUrl(pathname) {
  return new URL(`./public${pathname}`, rootUrl);
}

function publicUploadImageForPath(pathname) {
  if (!/^\/uploads\/(?:tmp|posts)\//.test(pathname)) return null;

  const fileUrl = localPublicUrl(pathname);
  if (!existsSync(fileUrl)) return null;

  return {
    data: readFileSync(fileUrl),
    filename: pathname.split("/").pop() || "image.jpg",
    mimeType: mimeTypeForPath(pathname),
  };
}

function fallbackPostImageForPath(pathname) {
  const match = pathname.match(
    /^\/uploads\/posts\/([^/]+)\/(resized|thumb)\.jpg$/,
  );
  if (!match || match[1] === "revival-upload") return null;

  return fallbackPostImages[match[2]] || null;
}

function safeUploadedFileId(fileId) {
  const value = String(fileId || "");
  return /^revival-[a-z0-9-]+$/i.test(value) ? value : null;
}

function runtimeUploadedImageForPath(pathname) {
  const match = pathname.match(
    /^\/uploads\/(?:tmp|posts)\/([^/]+)\/(resized|thumb)\.(?:jpg|jpeg|png|gif|webp)$/i,
  );
  if (!match) return null;
  const cached = uploadedImages.get(match[1]);
  return cached?.[match[2]] || cached?.resized || cached?.original || null;
}

function legacyImagePath(imageKey, variant = "resized") {
  const safeVariant = variant === "thumb" ? "thumb" : "resized";
  return `/uploads/posts/${imageKey || "revival-upload"}/${safeVariant}.jpg`;
}

function publicMemoryUrl(post) {
  const publicId = String(post?.public_id || post?.publicId || "").trim();
  return publicId ? `/memory/${encodeURIComponent(publicId)}` : "";
}

function v1Language(memory, defaultLanguage = "en") {
  return normalizeLanguage(
    memory?.metadata?.language || memory?.metadata?.languageCode || defaultLanguage,
  );
}

function v1ImageKey(memory) {
  const metadataKey = String(memory?.metadata?.imageKey || "").trim();
  if (metadataKey) return metadataKey;
  const url = memory?.attachments?.find((attachment) => attachment?.url)?.url || "";
  return url.match(/\/uploads\/posts\/([^/]+)\//)?.[1] || "revival-upload";
}

function v1LegacyPostId(memory, index = 0) {
  const publicId = String(memory?.id || memory?.publicId || "");
  const match = publicId.match(/^m([0-9a-f]{20})$/);
  return match ? String(Number.parseInt(match[1].slice(0, 13), 16)) : String(900000 - index);
}

function v1MemoryToPost(memory, index = 0, language = "en") {
  const content = String(memory?.content || "");
  const preview = memoryPreview(memory);
  const excerpt = preview.text + (preview.truncated ? "…" : "");
  const imageKey = v1ImageKey(memory);
  const isLongForm = preview.longForm;
  return {
    id: v1LegacyPostId(memory, index),
    uid: String(memory?.id || memory?.publicId || `v1_memory_${index}`),
    public_id: String(memory?.id || memory?.publicId || ""),
    name: htmlText(memory?.authorName || "I Remember"),
    title: htmlText(memory?.title || "I Remember"),
    title_text: String(memory?.title || "I Remember"),
    img: imageKey,
    image_url: memory?.attachments?.find((attachment) => String(attachment.type).startsWith("image/"))?.url || legacyImagePath(imageKey),
    thumb_url: memory?.attachments?.find((attachment) => String(attachment.type).startsWith("image/"))?.url || legacyImagePath(imageKey, "thumb"),
    img_offset_x: "0",
    img_offset_y: "0",
    text: htmlText(excerpt),
    excerpt: htmlText(excerpt),
    body_markdown: content,
    body_html: markdownToHtml(memoryBody(memory) || excerpt),
    is_long_form: isLongForm ? "1" : "0",
    view_count: Number(memory?.viewCount || 0),
    resized_img_width: "600",
    resized_img_height: "600",
    latitude: memory?.latitude ?? null,
    longitude: memory?.longitude ?? null,
    has_created_tags: "1",
    is_stared: "0",
    created_at: normalizeLegacyDate(memory?.createdAt),
    language_id: languageId(language),
    tags: Object.fromEntries((memory?.tags || []).map((tag) => [tag.slug || tag.name, 1])),
  };
}

function legacyImageUrl(imageKey, variant = "thumb") {
  return legacyImagePath(imageKey || "revival-upload", variant);
}

function v1MenuItemToPublic(item = {}) {
  return {
    id: item.id,
    label: item.label,
    type: item.type,
    targetValue: item.targetValue || "",
    url: item.url || "",
    position: item.position || 0,
    opensNewTab: Boolean(item.opensNewTab),
    parentId: String(item.metadata?.parentId || ""),
  };
}

function v1PageToPublic(page = {}, defaultLanguage = "en") {
  const bodyMarkdown = String(page.bodyMarkdown || "");
  return {
    id: page.id,
    slug: page.slug,
    language: normalizeLanguage(page.language || defaultLanguage),
    title: page.title,
    excerpt: page.excerpt || excerptFromMarkdown(bodyMarkdown),
    bodyMarkdown,
    bodyHtml: markdownToHtml(bodyMarkdown),
    metadataJson: JSON.stringify(page.metadata || {}),
    status: page.status,
    linkedMemoryPublicId: page.linkedMemoryId || "",
    createdAt: page.createdAt,
    updatedAt: page.updatedAt,
  };
}

function v1MemoryToAdminMemory(memory = {}, language = "en") {
  const post = v1MemoryToPost(memory, 0, language);
  const bodyMarkdown = String(memory.content || "");
  const imageKey = v1ImageKey(memory);
  return {
    rowId: memory.id,
    id: memory.id,
    publicId: post.public_id,
    uid: post.uid,
    title: memory.title || "I Remember",
    author: memory.authorName || "I Remember",
    language: v1Language(memory, language),
    status: memory.status === "NORMAL" ? "published" : String(memory.status || "").toLowerCase(),
    dbStatus: memory.status,
    source: memory.metadata?.source || "v1",
    excerpt: excerptFromMarkdown(bodyMarkdown, memory.title),
    text: bodyMarkdown,
    bodyMarkdown,
    metadataJson: JSON.stringify(memory.metadata || {}),
    bodyHtml: markdownToHtml(bodyMarkdown),
    isLongForm: bodyMarkdown.length > String(memory.excerpt || "").length,
    imageKey,
    imageUrl: legacyImageUrl(imageKey, "thumb"),
    publicUrl: publicMemoryUrl(post),
    createdAt: memory.createdAt,
    updatedAt: memory.updatedAt,
    viewCount: Number(memory.viewCount || 0),
  };
}

function v1MenuTargetToPublic(data = {}, language = "en") {
  const memory = data.memory ? v1MemoryToAdminMemory(data.memory, language) : null;
  return {
    item: data.item ? v1MenuItemToPublic(data.item) : null,
    ...(data.page ? { page: v1PageToPublic(data.page, language) } : {}),
    ...(memory ? { memory, post: v1MemoryToPost(data.memory, 0, language) } : {}),
    ...(Array.isArray(data.results)
      ? { results: data.results.map((memory, index) => v1MemoryToPost(memory, index, language)) }
      : {}),
  };
}

function safeScriptJson(payload) {
  return JSON.stringify(payload).replace(/[<>&\u2028\u2029]/g, (char) => {
    switch (char) {
      case "<":
        return "\\u003C";
      case ">":
        return "\\u003E";
      case "&":
        return "\\u0026";
      case "\u2028":
        return "\\u2028";
      case "\u2029":
        return "\\u2029";
      default:
        return char;
    }
  });
}

function clampNumber(value, min, max, fallback = 0) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function optionalCoordinate(value, min, max) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : undefined;
}

function cleanText(value, fallback, maxLength) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return (text || fallback).slice(0, maxLength);
}

function validatedPostFields(fields = {}, defaultLanguage = "en") {
  const language = normalizeLanguage(defaultLanguage);
  const name = fields.name || fields.author || fields.username;
  const message = fields.message || fields.text || fields.memory;
  const fileId = fields.fileId || fields.file_id || fields.img || fields.imageKey;
  return {
    language,
    name: cleanText(name, "I Remember", 80),
    message: cleanText(message, defaultMessage(language), 1000),
    fileId: safeUploadedFileId(fileId) || "revival-upload",
    imgOffsetX: String(clampNumber(fields.imgOffsetX || fields.img_offset_x, -1, 1)),
    imgOffsetY: String(clampNumber(fields.imgOffsetY || fields.img_offset_y, -1, 1)),
    latitude: optionalCoordinate(fields.latitude ?? fields.lat, -90, 90),
    longitude: optionalCoordinate(fields.longitude ?? fields.lng ?? fields.lon, -180, 180),
  };
}

function environmentSiteSettings() {
  return {
    siteDescription: process.env.I_REMEMBER_SITE_DESCRIPTION ?? "Songqi Duan (段松岐): a personal home for memories, photographs, and beautiful moments worth keeping.",
    ownerName: process.env.I_REMEMBER_OWNER_NAME ?? "Songqi Duan",
    ownerAlternateName: process.env.I_REMEMBER_OWNER_ALTERNATE_NAME ?? "段松岐",
    siteTitle: process.env.I_REMEMBER_SITE_TITLE || "I Remember",
    canonicalUrl: process.env.I_REMEMBER_CANONICAL_URL || "https://songqi.org",
    timezone: process.env.TZ || "Asia/Shanghai",
    defaultLanguage: normalizeLanguage(process.env.I_REMEMBER_DEFAULT_LANGUAGE || "en"),
    anonymousSubmissions: process.env.I_REMEMBER_ANONYMOUS_SUBMISSIONS === "true",
    tracking: {
      enabled: Boolean(process.env.UMAMI_SRC && process.env.UMAMI_WEBSITE_ID),
      umamiSrc: process.env.UMAMI_SRC || "",
      umamiWebsiteId: process.env.UMAMI_WEBSITE_ID || "",
    },
  };
}

function normalizedSiteSettings(value, fallback) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const tracking =
    value.tracking && typeof value.tracking === "object" && !Array.isArray(value.tracking)
      ? value.tracking
      : null;
  return {
    siteDescription: typeof value.siteDescription === "string" ? value.siteDescription : fallback.siteDescription,
    ownerName: typeof value.ownerName === "string" ? value.ownerName : fallback.ownerName,
    ownerAlternateName: typeof value.ownerAlternateName === "string" ? value.ownerAlternateName : fallback.ownerAlternateName,
    siteTitle: value.siteTitle || fallback.siteTitle,
    canonicalUrl: value.canonicalUrl || fallback.canonicalUrl,
    timezone: value.timezone || fallback.timezone,
    defaultLanguage: normalizeLanguage(value.defaultLanguage || fallback.defaultLanguage),
    anonymousSubmissions:
      typeof value.anonymousSubmissions === "boolean"
        ? value.anonymousSubmissions
        : fallback.anonymousSubmissions,
    tracking: tracking
      ? {
          enabled: tracking.enabled === true,
          umamiSrc: typeof tracking.umamiSrc === "string" ? tracking.umamiSrc : "",
          umamiWebsiteId:
            typeof tracking.umamiWebsiteId === "string" ? tracking.umamiWebsiteId : "",
        }
      : fallback.tracking,
  };
}

class RevivalBackend {
  constructor(options = {}) {
    this.production = options.production === true;
    this.apiBaseUrl = String(options.apiBaseUrl || process.env.API_BASE_URL || "http://127.0.0.1:7892").replace(/\/+$/g, "");
    this.cachedSiteSettings = environmentSiteSettings();
    this.siteSettingsExpiresAt = 0;
    this.siteSettingsRequest = null;
  }

  get mode() {
    return "v1";
  }

  get hasApiBackend() {
    return Boolean(this.apiBaseUrl);
  }

  async v1Data(path, options = {}) {
    const { envelope = false, ...requestOptions } = options;
    if (!this.apiBaseUrl) return null;
    let response;
    try {
      response = await fetch(new URL(path, `${this.apiBaseUrl}/`), {
        ...requestOptions,
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {}),
        },
        signal: AbortSignal.timeout(apiFetchTimeoutMs),
      });
    } catch (_error) {
      return null;
    }
    if (!response.ok) return null;
    try {
      const payload = await response.json();
      return payload?.success === true ? (envelope ? payload : payload.data) : null;
    } catch (_error) {
      return null;
    }
  }

  async v1PublicMemories(language) {
    const records = [], seen = new Set();
    let cursor = "";
    do {
      const result = await this.v1Data(`/api/v1/memories?limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, { envelope: true });
      if (!Array.isArray(result?.data)) throw new HttpError(503, "Memory service unavailable", "service_unavailable");
      records.push(...result.data);
      cursor = result.pagination?.nextCursor || "";
      if (cursor && seen.has(cursor)) throw new HttpError(502, "Invalid memory pagination", "invalid_pagination");
      if (cursor) seen.add(cursor);
    } while (cursor);
    return [...new Map(records.map((memory) => [memory.id, memory])).values()].map((memory, index) => v1MemoryToPost(memory, index, language));
  }

  async v1PublicMemory(publicId, language, trackView = false) {
    const path = trackView
      ? `/api/v1/memories/${encodeURIComponent(publicId)}/view`
      : `/api/v1/memories/${encodeURIComponent(publicId)}`;
    const data = await this.v1Data(path, trackView ? { method: "POST", body: "{}" } : {});
    return data?.id || data?.publicId ? v1MemoryToPost(data, 0, language) : null;
  }

  async v1PublicMenu(language) {
    const data = await this.v1Data(
      `/api/v1/public/menu?language=${encodeURIComponent(normalizeLanguage(language))}`,
    );
    return Array.isArray(data?.items) ? data.items.map(v1MenuItemToPublic) : null;
  }

  async v1PublicMenuTarget(id, language) {
    const data = await this.v1Data(
      `/api/v1/public/menu-target/${encodeURIComponent(id)}?language=${encodeURIComponent(
        normalizeLanguage(language),
      )}`,
    );
    return data?.item ? v1MenuTargetToPublic(data, language) : null;
  }

  siteSettings() {
    return this.cachedSiteSettings;
  }

  async currentSiteSettings() {
    if (Date.now() < this.siteSettingsExpiresAt) return this.siteSettings();
    if (this.siteSettingsRequest) return this.siteSettingsRequest;

    this.siteSettingsRequest = (async () => {
      const configured = await this.v1Data("/api/v1/public/settings");
      this.cachedSiteSettings = normalizedSiteSettings(configured, this.siteSettings());
      this.siteSettingsExpiresAt = Date.now() + siteSettingsCacheMs;
      return this.siteSettings();
    })();
    try {
      return await this.siteSettingsRequest;
    } finally {
      this.siteSettingsRequest = null;
    }
  }

  async readiness() {
    if (!this.apiBaseUrl) {
      return { ok: false, service: "web", api: "unavailable", database: "unknown" };
    }

    try {
      const response = await fetch(new URL("/readyz", `${this.apiBaseUrl}/`), {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(apiFetchTimeoutMs),
      });
      const payload = await response.json().catch(() => null);
      const apiReached = payload?.service === "api";
      const ready = apiReached && response.ok && payload?.ok === true;
      return {
        ok: ready,
        service: "web",
        api: apiReached ? "ready" : "unavailable",
        database: payload?.database === "ready" ? "ready" : "unavailable",
      };
    } catch (_error) {
      return { ok: false, service: "web", api: "unavailable", database: "unknown" };
    }
  }

  async needsAdminSetup() {
    const status = await this.v1Data("/api/v1/auth/status");
    return Boolean(status?.needsSetup);
  }

  async allPosts(language) {
    const v1Posts = await this.v1PublicMemories(language);
    if (v1Posts) return uniquePosts(v1Posts);
    return [];
  }

  memoryByPublicId(publicId) {
    void publicId;
    return null;
  }

  async directPost(publicId, language = "en") {
    const v1Post = await this.v1PublicMemory(publicId, language, true);
    if (v1Post) return v1Post;
    return null;
  }

  async searchPosts(language, tag, url) {
    const posts = await this.allPosts(language);
    return paginatePosts(matchingPosts(posts, tag), url);
  }

  async relatedTagCounts(language, id) {
    const posts = await this.allPosts(language);
    const post = posts.find((item) => String(item.id) === String(id));
    return post ? relatedTagCountsForPosts(post, posts, language) : {};
  }

  async autocomplete(language, fragment) {
    const posts = await this.allPosts(language);
    return autocompleteList(posts, fragment, language);
  }


  async publicMenu(language = "en") {
    const v1Menu = await this.v1PublicMenu(language);
    if (v1Menu) return v1Menu;
    return [];
  }

  async publicMenuTarget(id, language = "en") {
    const v1Target = await this.v1PublicMenuTarget(id, language);
    if (v1Target) return v1Target;
    void id;
    void language;
    throw new HttpError(404, "Menu item not found", "not_found");
  }

  async uploadImage(file) {
    if (!file?.data?.length) throw new HttpError(400, "Image is required", "invalid_image");
    if (file.data.length > maxUploadBodyBytes) {
      throw new HttpError(413, "Uploaded image is too large", "request_too_large");
    }

    const fileId = `revival-${randomUUID().slice(0, 12)}`;
    const original = file.data;
    const input = sharp(file.data, { limitInputPixels: maxImagePixels, animated: false });
    const metadata = await input.metadata();
    if (!["jpeg", "jpg", "png", "webp", "gif"].includes(metadata.format || "")) {
      throw new HttpError(400, "Unsupported image type", "invalid_image");
    }
    if ((metadata.width || 0) < 1 || (metadata.height || 0) < 1) {
      throw new HttpError(400, "Invalid image", "invalid_image");
    }

    const mimeType = storedMimeType({
      ...file,
      contentType: metadata.format === "png"
        ? "image/png"
        : metadata.format === "webp"
          ? "image/webp"
          : metadata.format === "gif"
            ? "image/gif"
            : "image/jpeg",
    });
    const resized = await sharp(file.data, { limitInputPixels: maxImagePixels, animated: false })
      .rotate()
      .resize(600, 600, { fit: "cover" })
      .jpeg({ quality: 88 })
      .toBuffer();
    const thumb = await sharp(file.data, { limitInputPixels: maxImagePixels, animated: false })
      .rotate()
      .resize(220, 220, { fit: "cover" })
      .jpeg({ quality: 82 })
      .toBuffer();

    uploadedImages.set(fileId, {
      original: { data: original, mimeType },
      resized: { data: resized, mimeType: "image/jpeg" },
      thumb: { data: thumb, mimeType: "image/jpeg" },
    });

    const uploadDir = join(process.env.STORAGE_PATH || join(runtimeDataDir(), "uploads"), "posts", fileId);
    mkdirSync(uploadDir, { recursive: true, mode: 0o770 });
    const originalPath = join(uploadDir, "original");
    const resizedPath = join(uploadDir, "resized.jpg");
    const thumbPath = join(uploadDir, "thumb.jpg");
    writeFileSync(originalPath, original, { mode: 0o660 });
    writeFileSync(resizedPath, resized, { mode: 0o660 });
    writeFileSync(thumbPath, thumb, { mode: 0o660 });

    return fileId;
  }

  async imageForPath(pathname) {
    const localRuntime = runtimeUploadedImageForPath(pathname);
    if (localRuntime) return localRuntime;

    const match = pathname.match(
      /^\/uploads\/(?:tmp|posts)\/([^/]+)\/(resized|thumb)\.(?:jpg|jpeg|png|gif|webp)$/i,
    );

    if (match) {
      const imageKey = match[1];
      const variant = match[2] === "thumb" ? "thumb" : "resized";
      const filePath = join(
        process.env.STORAGE_PATH || join(runtimeDataDir(), "uploads"),
        "posts",
        imageKey,
        `${variant}.jpg`,
      );
      if (existsSync(filePath) && statSync(filePath).isFile()) {
        return {
          data: readFileSync(filePath),
          filename: `${variant}.jpg`,
          mimeType: "image/jpeg",
        };
      }
    }

    return publicUploadImageForPath(pathname) || fallbackPostImageForPath(pathname);
  }

  async imageFromUrl(value) {
    if (!value) return null;

    let parsed;
    try {
      parsed = new URL(String(value), "http://i-remember.local");
    } catch (error) {
      return null;
    }
    if (parsed.origin !== "http://i-remember.local") return null;

    const pathname = decodeURIComponent(parsed.pathname);
    const stored = await this.imageForPath(pathname);
    if (!stored) return null;

    return {
      data: stored.data,
      filename: pathname.split("/").pop() || "image.jpg",
      contentType: stored.mimeType,
    };
  }

  async createPost(fields = {}, defaultLanguage = this.siteSettings().defaultLanguage) {
    const clean = validatedPostFields(fields, defaultLanguage);
    const language = clean.language;
    const v1Memory = await this.v1Data("/api/v1/memories", {
      method: "POST",
      body: JSON.stringify({
        title: clean.message.slice(0, 80) || "I Remember",
        content: clean.message,
        authorName: clean.name,
        visibility: "PUBLIC",
        latitude: clean.latitude,
        longitude: clean.longitude,
        metadata: {
          language,
          source: "public-submission",
          imageKey: clean.fileId,
        },
        attachments:
          clean.fileId && clean.fileId !== "revival-upload"
            ? [{ url: legacyImagePath(clean.fileId, "resized"), type: "image/jpeg" }]
            : undefined,
        tags: Object.keys(defaultTags(language)),
      }),
    });
    if (v1Memory) {
      return {
        ...v1MemoryToPost(v1Memory, 0, language),
        status: v1Memory.status || "NORMAL",
      };
    }
    throw new HttpError(502, "API memory creation failed", "api_unavailable");
  }

}

function defaultMessage(language) {
  if (normalizeLanguage(language) === "fr") return "ce souvenir revit.";
  if (normalizeLanguage(language) === "zh") return "这段回忆重新被点亮。";
  return "this revived memory lives again.";
}

function defaultTags(language) {
  if (normalizeLanguage(language) === "fr") {
    return { souvenir: 2, souvenirs: 2, memoire: 2 };
  }
  if (normalizeLanguage(language) === "zh") {
    return { 回忆: 2, 记得: 2, 生活: 2 };
  }
  return { memory: 2, remember: 2, revived: 2 };
}

function appHtmlUrlForLanguage(language) {
  return htmlUrls[normalizeLanguage(language)] || htmlUrls.en;
}

function legalPageRequested(pathname) {
  return ["/legal", "/fr/legal", "/en/legal", "/zh/legal"].includes(pathname);
}

function instagramTokenCallbackRequested(pathname) {
  return pathname === "/api/instagram-token-callback";
}

function adminPageRequested(pathname) {
  const normalized = pathname.replace(/\/+$/g, "");
  return (
    normalized === "/admin" ||
    normalized === "/admin/index.html" ||
    normalized === "/admin/setup" ||
    /^\/admin\/(?:dashboard|memory(?:\/editor)?|pages|comments|attachments|theme|menus|settings|backups)$/.test(normalized)
  );
}

function adminHtmlUrlForMode({ production = false } = {}) {
  if (production && existsSync(adminDistHtmlUrl)) return adminDistHtmlUrl;
  return adminSourceHtmlUrl;
}

function appShellRequested(pathname) {
  return [
    "/",
    "/fr",
    "/fr/",
    "/en",
    "/en/",
    "/zh",
    "/zh/",
  ].includes(pathname);
}

function publicMemoryPathMatch(pathname) {
  return pathname.match(/^\/memory\/([^/?#]+)\/?$/);
}

function memoryShellRequested(pathname) {
  return Boolean(publicMemoryPathMatch(pathname));
}

function nonSiteArtifactRequested(pathname) {
  return (
    pathname === "/qa" ||
    pathname.startsWith("/qa/") ||
    pathname === "/data" ||
    pathname.startsWith("/data/") ||
    pathname === "/dist" ||
    pathname.startsWith("/dist/") ||
    pathname === "/node_modules" ||
    pathname.startsWith("/node_modules/") ||
    pathname === "/.revival-storage" ||
    pathname.startsWith("/.revival-storage/") ||
    pathname === "/.revival-data" ||
    pathname.startsWith("/.revival-data/") ||
    pathname === "/db" ||
    pathname.startsWith("/db/") ||
    pathname === "/.env" ||
    pathname.startsWith("/.env.") ||
    pathname === "/src" ||
    pathname.startsWith("/src/") ||
    pathname === "/supabase" ||
    pathname.startsWith("/supabase/") ||
    pathname === "/scripts" ||
    pathname.startsWith("/scripts/") ||
    pathname === "/AGENTS.md" ||
    pathname === "/REVIVAL_NOTES.md" ||
    pathname === "/design-qa.md" ||
    pathname === "/package.json" ||
    pathname === "/package-lock.json" ||
    pathname === "/vite.config.mjs" ||
    pathname === "/server.mjs" ||
    pathname === "/Dockerfile" ||
    pathname === "/docker-compose.yml"
  );
}

function directPostPublicId(pathname) {
  return publicMemoryPathMatch(pathname)?.[1] || "";
}

function validPublicMemoryId(value) {
  return /^m[a-f0-9]{20}$/i.test(String(value || ""));
}

function shouldLogRequest(pathname) {
  return (
    pathname === "/healthz" ||
    pathname === "/readyz" ||
    pathname === "/version" ||
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    appShellRequested(pathname) ||
    memoryShellRequested(pathname) ||
    legalPageRequested(pathname) ||
    adminPageRequested(pathname)
  );
}

async function renderAppHtml(
  backend,
  language,
  directPayload = null,
  pathname = "/",
  memoryLanguage = language,
  siteSettings = backend.siteSettings(),
) {
  const normalized = normalizeLanguage(language);
  const normalizedMemoryLanguage = normalizeLanguage(memoryLanguage);
  let html = readFileSync(appHtmlUrlForLanguage(normalized), "utf8");
  if (normalized === "zh") html = localizeChineseHtml(html);
  if (backend.production) html = html.replace("/src/public-markdown.js", "/assets/public-markdown.js");
  html = html.replace("<head>", () => `<head><script>window.SONGQI_SITE_SETTINGS=${safeScriptJson(siteSettings)};</script>`);

  html = patchLanguageShell(html, normalized, pathname);
  html = injectTracking(html, siteSettings);

  const defaultPosts = await backend.allPosts(normalizedMemoryLanguage);
  html = replaceDefaultPosts(html, {
    success: 1,
    data: {
      tagName: "",
      posts: defaultPosts,
    },
    input: { ln: normalized },
  }, memoryFadePercent(defaultPosts));

  html = renderSeo(html, siteSettings, directPayload?.data, defaultPosts);
  if (!directPayload) return html;

  return html.replace(
    /var DEFAULT_POST = \(function \(\) \{[\s\S]*?\n\s*\}\(\)\);/,
    `var DEFAULT_POST = ${safeScriptJson(directPayload)};`,
  );
}

function htmlAttr(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function injectTracking(html, settings) {
  const tracking = trackingDetails(settings);
  if (!tracking) return html;
  const script = `<script defer src="${htmlAttr(tracking.src)}" data-website-id="${htmlAttr(tracking.websiteId)}"></script>`;
  return html.includes("</head>") ? html.replace("</head>", `    ${script}\n</head>`) : `${script}\n${html}`;
}

function replaceDefaultPosts(html, payload, fadePercent = 100) {
  return html
    .replace(/<span class="header-fade-percent-num">\d+<\/span>/, `<span class="header-fade-percent-num">${fadePercent}</span>`)
    .replace(
    /var DEFAULT_POSTS = [\s\S]*?\n\s*var DEFAULT_POST =/,
    `var REVIVAL_FADING = ${100 - fadePercent};\n    var DEFAULT_POSTS = ${safeScriptJson(payload)};\n    var DEFAULT_POST =`,
  );
}

function languagePathForLanguageSwitcher(pathname) {
  if (!pathname || pathname === "/") return "";
  return pathname.replace(/^\/+/, "").replace(/\/+$/, "");
}

function patchLanguageShell(html, language, pathname = "/") {
  const normalized = normalizeLanguage(language);
  const languagePath = languagePathForLanguageSwitcher(pathname);
  const labels = {
    en: "language",
    fr: "langue",
    zh: "语言",
  };
  const htmlLang = {
    en: "en-US",
    fr: "fr-FR",
    zh: "zh-CN",
  };
  const menu = [
    languageMenuItem("en", languagePath, "English", normalized),
    languageMenuItem("fr", languagePath, "French", normalized),
    languageMenuItem("zh", languagePath, "中文", normalized),
  ].join("\n");

  return html
    .replace(/lang="(?:en-US|fr-FR|zh-CN)"/g, `lang="${htmlLang[normalized]}"`)
    .replace(/var LANG = '[^']+';/, `var LANG = '${normalized}';`)
    .replace(
      /<div class="footer-link-lang footer-link-item footer-fade-item">[\s\S]*?(?=\s*<div class="footer-link-credits)/,
      `<div class="footer-link-lang footer-link-item footer-fade-item">\n                <div class="footer-link-lang-text">${labels[normalized]}</div>\n                <div class="footer-link-lang-list">\n${menu}\n                </div>\n            </div>`,
    );
}

function languageMenuItem(id, suffix, label, selectedLanguage) {
  const selected = id === selectedLanguage ? " selected" : " ";
  return `                    <div class="footer-link-lang-item${selected}" data-id="${id}" data-url-suffix="${suffix}">${label}</div>`;
}

function localizeChineseHtml(html) {
  const replacements = [
    [/var SITE_DESCRIPTION = '[^']*';/, "var SITE_DESCRIPTION = '把不想遗忘的珍贵时刻留在这里。记录自己的回忆，也分享值得被记住的美好瞬间。';"],
    [/var TWITTER_SITE_DESCRIPTION = '[^']*';/, "var TWITTER_SITE_DESCRIPTION = '把不想遗忘的珍贵时刻留在 songqi.org。';"],
    [/var POST_DESCRIPTION = '[^']*';/, "var POST_DESCRIPTION = '我在 songqi.org 留下了一段值得记住的回忆。';"],
    [/var TWITTER_POST_DESCRIPTION = '[^']*';/, "var TWITTER_POST_DESCRIPTION = '我在 songqi.org 留下了一段值得记住的回忆。';"],
    [/How lucky we are to be able to say <span class='font-italic'>«I remember»<\/span>\./, "能说出 <span class='font-italic'>“我记得”</span> 是多么幸运。"],
    [/Let's keep the moments we never want to lose\./, "把不想遗忘的珍贵时刻留在这里。"],
    [/Even the brightest memories may fade/, "再美好的回忆也可能慢慢褪色"],
    [/if we do not give them a place to stay\./, "把它留在这里，让它被记住。"],
    [/tell a<br\/><span class="font-light-italic">memory<\/span>/, "说出<br/><span class=\"font-light-italic\">一段回忆</span>"],
    [/see all <span class="font-italic">memories<\/span>/, "查看所有<span class=\"font-italic\">回忆</span>"],
    [/loading\.\.\./, "加载中..."],
    [/upload<br\/><span class="font-light-italic">a picture<\/span><br\/><span class="add-steps-upload-methods-text-size">\(min res: 500px\)<\/span>/, "上传<br/><span class=\"font-light-italic\">一张照片</span><br/><span class=\"add-steps-upload-methods-text-size\">(最小 500px)</span>"],
    [/from<br\/><span class="font-light-italic">your desktop<\/span>/, "来自<br/><span class=\"font-light-italic\">你的电脑</span>"],
    [/Your <span class="">Name<\/span>/, "你的<span class=\"\">名字</span>"],
    [/Your <span class="">Email<\/span>/, "你的<span class=\"\">邮箱</span>"],
    [/I remember,/, "我记得，"],
    [/\(when\), \(with\), \(where\)/, "（什么时候）、（和谁）、（在哪里）"],
    [/I have read and agree with the/, "我已阅读并同意"],
    [/Terms of Service/, "服务条款"],
    [/Thank you /, "谢谢"],
    [/Your memory now has a place to stay\.<br\/>May it be remembered for years to come\./, "你的回忆已经有了一个安放之处。<br/>愿它在未来的岁月里依然清晰。"],
    [/Back/, "返回"],
    [/Confirm/, "确认"],
    [/Share on:/, "分享到："],
    [/other memory talk about/, "段其他回忆提到"],
    [/other memories talk about/, "段其他回忆提到"],
    [/Search for a memory/, "搜索回忆"],
    [/Add a memory/, "添加回忆"],
    [/No memory match your search &lt;&lt;<span class="font-bold-italic">\{\{interpolation\}\}<\/span>&gt;&gt;\.<br\/>Please make an other search\./, "没有回忆匹配 &lt;&lt;<span class=\"font-bold-italic\">{{interpolation}}</span>&gt;&gt;。<br/>请换一个词搜索。"],
    [/Search\.\.\./, "搜索..."],
    [/The experience of <span class="font-bold">I Remember<\/span> requires WebGL\. <br\/>Please upgrade your browser to the latest <a href="http:\/\/www\.mozilla\.org\/firefox" target="_blank">Firefox<\/a> or <a href="http:\/\/www\.google\.com\/chrome" target="_blank">Chrome<\/a>\./, "体验 <span class=\"font-bold\">I Remember</span> 需要 WebGL。<br/>请升级到最新版 <a href=\"http://www.mozilla.org/firefox\" target=\"_blank\">Firefox</a> 或 <a href=\"http://www.google.com/chrome\" target=\"_blank\">Chrome</a>。"],
    [/Use your mouse/, "移动鼠标"],
    [/to move/, "探索回忆"],
    [/Scroll or double click/, "滚动或双击"],
    [/to zoom in/, "放大"],
    [/Click to watch/, "点击查看"],
    [/a memory/, "一段回忆"],
    [/Let's share our memories <br\/> and make sure this website does not disappear\./, "分享我们的回忆<br/>让这个网站继续存在。"],
    [/fade from memories/, "记忆褪色"],
    [/Credits/, "鸣谢"],
    [/Terms and Conditions/, "条款"],
    [/Donate/, "捐赠"],
    [/Your Facebook albums/, "你的 Facebook 相册"],
    [/Your Facebook photos/, "你的 Facebook 照片"],
    [/Your Instagram photos/, "你的 Instagram 照片"],
    [/Download/, "下载"],
    [/General terms and conditions for using the site's services/, "网站服务使用条款"],
  ];

  let output = html
    .replace(/<html class="[^"]*">/, '<html class="no-js" lang="zh-CN">')
    .replace(/<meta name="description" content="[^"]*">/, '<meta name="description" content="分享你的回忆，一起守护记忆。">')
    .replace(/<meta property="og:description" content="[^"]*" \/>/, '<meta property="og:description" content="分享你的回忆，一起守护记忆。" />')
    .replace(/<title>I Remember<\/title>/g, "<title>I Remember | 我记得</title>");

  for (const [pattern, replacement] of replacements) {
    output = output.replace(pattern, replacement);
  }

  return output.replace(
    /<div class="terms-description font-light">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>\s*<div class="scroll-indicator"><\/div>\s*<\/div>/,
    `<div class="terms-description font-light"><span class='font-bold'>第 1 条 - 服务说明</span><br/><br/>I-Remember.fr 用于保存和分享与照片相关的个人回忆。提交内容时，请确认你拥有相应权利，并同意该内容可在本服务中展示。<br/><br/><span class='font-bold'>第 2 条 - 内容责任</span><br/><br/>请勿上传违法、侵权、仇恨、色情、骚扰、威胁或包含他人隐私的信息。你需要对自己提交的文字、图片和其他内容负责。<br/><br/><span class='font-bold'>第 3 条 - 数据与删除</span><br/><br/>服务会保存你提交的名字、邮箱、回忆文字和图片，用于展示、检索和维护本项目。若需要删除或更正内容，请联系站点维护者。<br/><br/><span class='font-bold'>第 4 条 - 技术要求</span><br/><br/>本体验需要支持 WebGL 的现代浏览器。</div>
            </div>
        </div>
        <div class="scroll-indicator"></div>
    </div>`,
  );
}

export function createRevivalMiddleware(options = {}) {
  const backend = new RevivalBackend(options);

  return (req, res, next) => {
    handleRequest(backend, req, res, next, options).catch((error) => {
      if (!(error instanceof HttpError) || error.statusCode >= 500) {
        console.error(error);
      }
      if (res.headersSent) return;
      const statusCode = error instanceof HttpError ? error.statusCode : 500;
      sendJson(
        req,
        res,
        {
          success: false,
          errorMsg: error instanceof HttpError ? error.errorMsg : "unexpected",
          message: error instanceof HttpError && error.expose
            ? error.message
            : "Unexpected server error",
        },
        statusCode,
      );
    });
  };
}

async function handleRequest(backend, req, res, next, options = {}) {
  const url = new URL(req.url || "/", "http://i-remember.local");
  const pathname = decodeURIComponent(url.pathname);
  const startedAt = Date.now();
  if (req.method === "GET" && ["/index.html", "/fr.html", "/legal.html"].includes(pathname)) {
    res.statusCode = 308; res.setHeader("Location", `${pathname === "/fr.html" ? "/fr" : pathname === "/legal.html" ? "/legal" : "/"}${url.search}`); res.end(); return;
  }
  if (pathname.startsWith("/admin") || pathname.startsWith("/api/") || legalPageRequested(pathname)) res.setHeader("X-Robots-Tag", "noindex, nofollow");
  const needsRuntimeSettings =
    pathname === "/robots.txt" || /^\/sitemap(?:-\d+)?\.xml$/.test(pathname) ||
    appShellRequested(pathname) ||
    memoryShellRequested(pathname) ||
    pathname === "/api/public/menu" ||
    pathname.startsWith("/api/public/menu-target/") ||
    pathname === "/api/post" ||
    pathname.startsWith("/api/related-post-count/") ||
    pathname.startsWith("/api/auto-complete-tags/") ||
    pathname.startsWith("/api/search-posts") ||
    /^\/api(?:\/(?!v1(?:\/|$))[^/]+)?$/.test(pathname);
  const siteSettings = needsRuntimeSettings
    ? await backend.currentSiteSettings()
    : backend.siteSettings();
  const defaultLanguage = siteSettings.defaultLanguage;
  const memoryLanguage = contentLanguage(defaultLanguage);
  if (req.method === "GET" && pathname === "/robots.txt") {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nSitemap: ${siteOrigin(siteSettings.canonicalUrl)}/sitemap.xml\n`);
    return;
  }
  if (req.method === "GET" && /^\/sitemap(?:-\d+)?\.xml$/.test(pathname)) {
    const posts = publicPosts(await backend.allPosts(memoryLanguage));
    const size = 20000;
    const page = pathname.match(/^\/sitemap-(\d+)\.xml$/)?.[1];
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    if (!page && posts.length > size) {
      const origin = siteOrigin(siteSettings.canonicalUrl);
      res.end(`<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${Array.from({ length: Math.ceil(posts.length / size) }, (_, index) => `<sitemap><loc>${origin}/sitemap-${index + 1}.xml</loc></sitemap>`).join("")}</sitemapindex>`);
    } else if (page && (Number(page) < 1 || Number(page) > Math.ceil(posts.length / size))) {
      sendStatus(res, 404, "Not found");
    } else {
      res.end(sitemapXml(siteSettings, page ? posts.slice((Number(page) - 1) * size, Number(page) * size) : posts));
    }
    return;
  }

  // Language-free URLs use the configured default (or an explicit /fr, /zh,
  // /en route). Do not retain a query parameter that repeats that language.
  // This redirect is temporary because the owner can change the site default.
  if (req.method === "GET" && (appShellRequested(pathname) || memoryShellRequested(pathname)) &&
      url.searchParams.has("ln") &&
      languageFromRequest(url, pathname, defaultLanguage) === languageFromPath(pathname, defaultLanguage)) {
    url.searchParams.delete("ln");
    res.statusCode = 302;
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Location", `${url.pathname}${url.search}${url.hash}`);
    res.end();
    return;
  }

  if (shouldLogRequest(pathname)) {
    res.once("finish", () => {
      logInfo("http_request", {
        method: req.method || "GET",
        path: pathname,
        status: res.statusCode,
        durationMs: Date.now() - startedAt,
        contentLength: req.headers["content-length"] || "",
      });
    });
  }

  if (req.method === "GET" && pathname === "/healthz") {
    sendJson(req, res, { ok: true, service: "web" });
    return;
  }

  if (req.method === "GET" && pathname === "/readyz") {
    const readiness = await backend.readiness();
    sendJson(req, res, readiness, readiness.ok ? 200 : 503);
    return;
  }

  if (req.method === "GET" && nonSiteArtifactRequested(pathname)) {
    // Vite serves transformed modules from these paths during local development.
    // Keep the production artifact boundary intact and never allow env/data paths.
    if (options.transformIndexHtml &&
        (/^\/node_modules\/\.vite\/deps\//.test(pathname) ||
         /^\/node_modules\/(?:\.pnpm\/vite@[^/]+\/node_modules\/)?vite\/dist\/client\/env\.mjs$/.test(pathname) ||
         /^\/node_modules\/(?:\.pnpm\/@fontsource-variable\+geist@[^/]+\/node_modules\/)?@fontsource-variable\/geist\/files\/[^/]+\.woff2$/.test(pathname) ||
         /^\/src\/(?:index\.css$|public-markdown\.js$|components\/|lib\/)/.test(pathname))) {
      next();
      return;
    }
    sendStatus(res, 404, "Not found");
    return;
  }

  if (req.method === "GET" && pathname === "/favicon.ico") {
    res.statusCode = 204;
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.end();
    return;
  }

  const image = await backend.imageForPath(pathname);
  if (image) {
    res.statusCode = 200;
    setSecurityHeaders(res);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("Content-Type", image.mimeType);
    res.end(image.data);
    return;
  }

  if (pathname === "/api/public/menu" && req.method === "GET") {
    sendJson(req, res, {
      success: true,
      data: {
        language: memoryLanguage,
        items: await backend.publicMenu(memoryLanguage),
      },
    });
    return;
  }

  if (pathname.startsWith("/api/public/menu-target/") && req.method === "GET") {
    const id = pathname.split("/").pop() || "";
    if (!id) throw new HttpError(400, "Invalid menu item", "invalid_menu_item");
    sendJson(req, res, {
      success: true,
      data: await backend.publicMenuTarget(id, memoryLanguage),
    });
    return;
  }

  if (pathname === "/api/admin" || pathname.startsWith("/api/admin/")) {
    sendStatus(res, 404, "Not found");
    return;
  }

  if (req.method === "GET") {
    if (instagramTokenCallbackRequested(pathname)) {
      sendHtml(res, readFileSync(instagramTokenCallbackHtmlUrl, "utf8"));
      return;
    }

    if (legalPageRequested(pathname)) {
      sendHtml(res, readFileSync(legalHtmlUrl, "utf8"));
      return;
    }

    if ((await backend.needsAdminSetup()) && appShellRequested(pathname)) {
      res.statusCode = 302;
      res.setHeader("Location", "/admin/setup");
      res.end();
      return;
    }

    if (adminPageRequested(pathname)) {
      const html = readFileSync(adminHtmlUrlForMode(options), "utf8");
      sendHtml(res, options.transformIndexHtml
        ? await options.transformIndexHtml(req.url, html)
        : html);
      return;
    }

    const directId = directPostPublicId(pathname);
    if (directId) {
      if (!validPublicMemoryId(directId)) {
        sendStatus(res, 404, "Not found");
        return;
      }
      const language = languageFromRequest(url, pathname, defaultLanguage);
      const post = await backend.directPost(directId, memoryLanguage);
      if (!post) {
        sendStatus(res, 404, "Not found");
        return;
      }
      const payload = {
        success: 1,
        data: post,
        input: { ln: language, id: String(numericPostId(post)) },
      };
      sendHtml(
        res,
        await renderAppHtml(
          backend,
          language,
          payload,
          pathname,
          memoryLanguage,
          siteSettings,
        ),
        { tracking: siteSettings.tracking },
      );
      return;
    }

    if (appShellRequested(pathname)) {
      const language = languageFromRequest(url, pathname, defaultLanguage);
      sendHtml(
        res,
        await renderAppHtml(
          backend,
          language,
          null,
          pathname,
          memoryLanguage,
          siteSettings,
        ),
        { tracking: siteSettings.tracking },
      );
      return;
    }
  }

  if (pathname === "/img/colorMap.png") {
    setTimeout(() => next(), colorMapStartupDelayMs);
    return;
  }

  if (pathname === "/api/upload-image" && req.method === "POST") {
    assertSameOrigin(req);
    assertRateLimit(req, "upload-image", 20, 10 * 60 * 1000);
    const body = await collectRequest(req, maxUploadBodyBytes);
    const { fields, files } = parseMultipart(req, body);
    const directImage = firstUploadedImage(files);
    const urlImage = directImage ? null : await backend.imageFromUrl(fields.url);
    const sourceImage = directImage || urlImage;
    const fileId = sourceImage
      ? await backend.uploadImage({
          data: sourceImage.data,
          filename: sourceImage.filename || "upload.jpg",
          contentType: sourceImage.contentType || sourceImage.mimeType || "image/jpeg",
        })
      : "revival-upload";

    logInfo("upload_image", {
      fileId,
      source: directImage ? "file" : urlImage ? "url" : "fallback",
      bytes: sourceImage?.data?.length || 0,
    });

    sendJson(req, res, {
      success: true,
      data: { fileId },
    });
    return;
  }

  if (pathname === "/api/post" && req.method === "POST") {
    assertSameOrigin(req);
    if (!siteSettings.anonymousSubmissions) {
      throw new HttpError(403, "Anonymous submissions are closed", "submissions_closed");
    }
    assertRateLimit(req, "post", 10, 10 * 60 * 1000);
    const body = await collectRequest(req, maxFormBodyBytes);
    const fields = parseFields(req, body);
    const post = await backend.createPost(fields, memoryLanguage);
    logInfo("memory_submitted", {
      language: memoryLanguage,
      memoryId: post.id,
      publicId: post.public_id || "",
      status: post.status || "",
      imageKey: post.img || "",
    });
    sendJson(req, res, {
      success: true,
      data: post,
    });
    return;
  }

  if (req.method === "GET" && pathname.startsWith("/api/related-post-count/")) {
    assertRateLimit(req, "related-post-count", 240, 60 * 1000);
    const id = pathname.split("/").pop();
    const tags = await backend.relatedTagCounts(memoryLanguage, id);
    sendJson(req, res, {
      success: 1,
      data: tags,
      input: {
        id,
        ln: memoryLanguage,
        found: Object.keys(tags).length > 0,
      },
    });
    return;
  }

  if (req.method === "GET" && pathname.startsWith("/api/auto-complete-tags/")) {
    assertRateLimit(req, "auto-complete-tags", 240, 60 * 1000);
    const fragment = pathname.replace(/^\/api\/auto-complete-tags\/?/, "").slice(0, 120);
    sendJson(req, res, {
      success: true,
      data: {
        tagFragment: routeTag(fragment),
        list: await backend.autocomplete(memoryLanguage, fragment),
      },
    });
    return;
  }

  if (req.method === "GET" && pathname.startsWith("/api/search-posts")) {
    assertRateLimit(req, "search-posts", 240, 60 * 1000);
    const pathTag = pathname.startsWith("/api/search-posts")
      ? pathname.replace(/^\/api\/search-posts\/?/, "").slice(0, 120)
      : "";
    const inputTag = (url.searchParams.get("tagName") || pathTag).slice(0, 120);
    const parsedTag = routeTag(inputTag);
    const found = await backend.searchPosts(memoryLanguage, inputTag, url);
    logInfo("search_posts", {
      language: memoryLanguage,
      tagName: parsedTag,
      count: found.length,
    });

    sendJson(req, res, {
      success: 1,
      data: {
        tagName: parsedTag,
        posts: found,
      },
      input: {
        ln: memoryLanguage,
        tagName: inputTag,
        lastId: url.searchParams.get("lastId") || "",
      },
    });
    return;
  }

  if (req.method === "GET" && /^\/api(?:\/[^/]+)?$/.test(pathname)) {
    assertRateLimit(req, "search-posts", 240, 60 * 1000);
    const inputTag = pathname.replace(/^\/api\/?/, "").slice(0, 120);
    const parsedTag = routeTag(inputTag);
    const found = await backend.searchPosts(memoryLanguage, inputTag, url);
    logInfo("search_posts", {
      language: memoryLanguage,
      tagName: parsedTag,
      count: found.length,
    });

    sendJson(req, res, {
      success: 1,
      data: {
        tagName: parsedTag,
        posts: found,
      },
      input: {
        ln: memoryLanguage,
        tagName: inputTag,
        lastId: url.searchParams.get("lastId") || "",
      },
    });
    return;
  }

  next();
}

export function createViteRevivalPlugin() {
  return {
    name: "i-remember-api-shim",
    configureServer(server) {
      server.middlewares.use(createRevivalMiddleware({
        apiBaseUrl: process.env.API_BASE_URL,
        transformIndexHtml: (url, html) => server.transformIndexHtml(url, html),
      }));
    },
    configurePreviewServer(server) {
      server.middlewares.use(createRevivalMiddleware({ production: true, apiBaseUrl: process.env.API_BASE_URL }));
    },
  };
}

export function createBackendForScripts() {
  return new RevivalBackend();
}

export {
  fallbackPostImages,
  legacyImagePath,
  postIdOffset,
};
