function v1Status(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "published" || normalized === "normal") return "NORMAL";
  if (normalized === "archived") return "ARCHIVED";
  if (normalized === "rejected") return "REJECTED";
  return "NORMAL";
}

function memoryTags(value) {
  if (!value) return undefined;
  if (Array.isArray(value)) return value;
  return String(value)
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function memoryAttachments(memory) {
  if (memory.imageKey && memory.imageKey !== "revival-upload") {
    return [{ url: `/uploads/posts/${memory.imageKey}/resized.jpg`, type: "image/jpeg" }];
  }
  if (memory.imageUrl && !String(memory.imageUrl).includes("revival-upload")) {
    return [{ url: memory.imageUrl, type: "image/jpeg" }];
  }
  return undefined;
}

function memoryMetadata(memory = {}) {
  let custom = {};
  const raw = memory.metadataJson ?? memory.metadata_json ?? memory.metadata;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    custom = raw;
  } else if (raw) {
    try {
      custom = JSON.parse(String(raw));
    } catch {
      custom = {};
    }
  }
  return {
    ...custom,
    language: memory.language,
    source: memory.source || "admin",
    isLongForm: String(memory.bodyMarkdown || memory.body_markdown || memory.content || memory.text || "").length > 220,
    imageKey: memory.imageKey,
  };
}

export function v1MemoryPayload(memory = {}) {
  const publicId = String(memory.publicId || memory.public_id || "").trim();
  const content = String(
    memory.bodyMarkdown || memory.body_markdown || memory.content || memory.text || memory.excerpt || "",
  );
  return {
    ...(publicId ? { publicId } : {}),
    title: String(memory.title || "").trim(),
    content: content.trim(),
    authorName: String(memory.authorName || memory.author || memory.name || "I Remember"),
    visibility: "PUBLIC",
    status: v1Status(memory.dbStatus || memory.status),
    metadata: memoryMetadata(memory),
    tags: memoryTags(memory.tags),
    attachments: memoryAttachments(memory),
  };
}

function v1MemoryPatchPayload(payload = {}) {
  const patch = { ...payload };
  delete patch.publicId;
  return patch;
}

export async function syncV1Memory(v1Api, memory) {
  const payload = v1MemoryPayload(memory);
  if (!payload.publicId) {
    const created = await v1Api("/api/v1/memories", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (payload.status === "PENDING") return created;
    return v1Api(`/api/v1/memories/${encodeURIComponent(created.id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  }

  const existing = await v1Api(`/api/v1/memories/${encodeURIComponent(payload.publicId)}`).catch(
    () => null,
  );
  if (existing) {
    return v1Api(`/api/v1/memories/${encodeURIComponent(existing.id)}`, {
      method: "PATCH",
      body: JSON.stringify(v1MemoryPatchPayload(payload)),
    });
  }

  const created = await v1Api("/api/v1/memories", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (payload.status === "PENDING") return created;
  return v1Api(`/api/v1/memories/${encodeURIComponent(created.id)}`, {
    method: "PATCH",
    body: JSON.stringify(v1MemoryPatchPayload(payload)),
  });
}

export async function archiveV1Memory(v1Api, memory = {}) {
  const publicId = String(memory.publicId || memory.public_id || "").trim();
  if (!publicId) return null;

  const existing = await v1Api(`/api/v1/memories/${encodeURIComponent(publicId)}`).catch(
    () => null,
  );
  if (!existing) return null;

  return v1Api(`/api/v1/memories/${encodeURIComponent(existing.id)}`, {
    method: "DELETE",
  });
}
