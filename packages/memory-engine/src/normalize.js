function firstText(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return "";
}

function optionalNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function attachmentImageUrl(attachments) {
  if (!Array.isArray(attachments)) return "";
  const image = attachments.find((attachment) =>
    String(attachment?.type || "").startsWith("image/"),
  );
  return firstText(image?.url, attachments.find((attachment) => attachment?.url)?.url);
}

function htmlText(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function imageKey(value) {
  const text = String(value || "");
  const match = text.match(/\/uploads\/posts\/([^/]+)\//);
  return match ? match[1] : "revival-upload";
}

function legacyDate(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function numericLegacyId(memory, index = 0) {
  const id = Number.parseInt(memory.legacyId, 10);
  return Number.isFinite(id) ? id : 900000 - index;
}

export function normalizeGalaxyMemory(memory = {}) {
  const id = firstText(memory.publicId, memory.public_id, memory.uid, memory.id);
  const legacyId = memory.legacyId ?? memory.legacy_id ?? null;
  const title = firstText(memory.title, memory.name, "Untitled memory");
  const content = firstText(memory.content, memory.bodyMarkdown, memory.body_markdown, memory.text);
  const excerpt = firstText(memory.excerpt, content.slice(0, 220));
  const imageUrl = firstText(
    memory.imageUrl,
    memory.image_url,
    memory.img,
    memory.thumbnailUrl,
    attachmentImageUrl(memory.attachments),
  );

  return {
    id,
    publicId: firstText(memory.publicId, memory.public_id, id),
    legacyId,
    title,
    content,
    excerpt,
    authorName: firstText(memory.authorName, memory.author_name, memory.author, memory.name),
    imageUrl,
    thumbnailUrl: firstText(memory.thumbnailUrl, memory.thumbnail_url, imageUrl),
    latitude: optionalNumber(memory.latitude ?? memory.lat),
    longitude: optionalNumber(memory.longitude ?? memory.lng ?? memory.lon),
    createdAt: firstText(memory.createdAt, memory.created_at),
    metadata:
      memory.metadata && typeof memory.metadata === "object" && !Array.isArray(memory.metadata)
        ? memory.metadata
        : {},
  };
}

export function normalizeGalaxyMemories(memories = []) {
  const seen = new Set();
  const normalized = [];

  for (const memory of memories || []) {
    const next = normalizeGalaxyMemory(memory);
    const identity = firstText(next.publicId, next.legacyId, next.id);
    if (!identity || seen.has(identity)) continue;
    seen.add(identity);
    normalized.push(next);
  }

  return normalized;
}

export function normalizeGalaxyPost(memory = {}, index = 0) {
  const next = normalizeGalaxyMemory(memory);
  const legacyId = numericLegacyId(next, index);
  const image = imageKey(next.imageUrl);

  return {
    id: String(legacyId),
    uid: next.id || `memory-engine-${legacyId}`,
    public_id: next.publicId,
    name: htmlText(next.authorName || "I Remember"),
    title: htmlText(next.title || "I Remember"),
    img: image,
    img_offset_x: "0",
    img_offset_y: "0",
    text: htmlText(next.content || next.excerpt || ""),
    excerpt: htmlText(next.excerpt || next.content || ""),
    body_markdown: next.content || "",
    body_html: `<p>${htmlText(next.content || next.excerpt || "")}</p>`,
    is_long_form: next.content && next.content.length > next.excerpt.length ? "1" : "0",
    resized_img_width: "600",
    resized_img_height: "600",
    has_created_tags: "1",
    is_stared: "0",
    created_at: legacyDate(next.createdAt),
    language_id: "2",
  };
}

export function normalizeGalaxyPosts(memories = []) {
  return normalizeGalaxyMemories(memories).map(normalizeGalaxyPost);
}
