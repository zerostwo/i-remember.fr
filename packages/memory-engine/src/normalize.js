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

export function normalizeGalaxyMemory(memory = {}) {
  const id = firstText(memory.publicId, memory.public_id, memory.uid, memory.id);
  const legacyId = memory.legacyId ?? memory.legacy_id ?? null;
  const title = firstText(memory.title, memory.name, "Untitled memory");
  const content = firstText(memory.content, memory.bodyMarkdown, memory.body_markdown, memory.text);
  const excerpt = firstText(memory.excerpt, content.slice(0, 220));
  const imageUrl = firstText(memory.imageUrl, memory.image_url, memory.img, memory.thumbnailUrl);

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
