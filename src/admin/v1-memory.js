function numberOrNull(value) {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function v1Status(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "published" || normalized === "normal") return "NORMAL";
  if (normalized === "archived") return "ARCHIVED";
  if (normalized === "rejected") return "REJECTED";
  return "PENDING";
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

export function v1MemoryPayload(memory = {}) {
  const legacyId = numberOrNull(memory.legacyId ?? memory.rowId ?? memory.id);
  const content = String(
    memory.bodyMarkdown || memory.body_markdown || memory.content || memory.text || memory.excerpt || "",
  );
  return {
    ...(legacyId === null ? {} : { legacyId }),
    title: String(memory.title || memory.author || "Untitled memory"),
    content: content || "Untitled memory",
    authorName: String(memory.authorName || memory.author || memory.name || "I Remember"),
    visibility: "PUBLIC",
    status: v1Status(memory.dbStatus || memory.status),
    metadata: {
      language: memory.language,
      source: memory.source || "admin",
      legacyUid: memory.uid,
      isLongForm: Boolean(memory.isLongForm || memory.is_long_form),
      imageKey: memory.imageKey,
    },
    tags: memoryTags(memory.tags),
    attachments: memoryAttachments(memory),
  };
}

export async function syncV1Memory(v1Api, memory) {
  const payload = v1MemoryPayload(memory);
  if (!payload.legacyId) return null;

  const matches = await v1Api(
    `/api/v1/memories?legacyId=${encodeURIComponent(payload.legacyId)}&status=all&visibility=all`,
  );
  const existing = matches?.[0];
  if (existing) {
    return v1Api(`/api/v1/memories/${encodeURIComponent(existing.id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  }

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

export async function archiveV1Memory(v1Api, memory = {}) {
  const legacyId = numberOrNull(memory.legacyId ?? memory.rowId ?? memory.id);
  if (!legacyId) return null;

  const matches = await v1Api(
    `/api/v1/memories?legacyId=${encodeURIComponent(legacyId)}&status=all&visibility=all`,
  );
  const existing = matches?.[0];
  if (!existing) return null;

  return v1Api(`/api/v1/memories/${encodeURIComponent(existing.id)}`, {
    method: "DELETE",
  });
}
