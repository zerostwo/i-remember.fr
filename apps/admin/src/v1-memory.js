function v1Status(value) {
  return (
    {
      published: "NORMAL",
      normal: "NORMAL",
      pending: "PENDING",
      draft: "PENDING",
      archived: "ARCHIVED",
      rejected: "REJECTED",
    }[String(value || "").toLowerCase()] || "NORMAL"
  );
}

function objectMetadata(memory) {
  const raw = memory.metadataJson ?? memory.metadata ?? {};
  if (typeof raw === "object" && raw && !Array.isArray(raw)) return raw;
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Invalid memory metadata");
  }
}

export function v1MemoryPayload(memory = {}, defaultLanguage = memory.defaultLanguage || "en") {
  const publicId = String(memory.publicId || "").trim();
  const content = String(memory.bodyMarkdown ?? memory.content ?? "").trim();
  const metadata = objectMetadata(memory);
  const payload = {
    ...(publicId ? { publicId } : {}),
    title: String(memory.title || "").trim(),
    content,
    authorName: String(memory.author ?? memory.authorName ?? "Songqi"),
    status: v1Status(memory.status || memory.dbStatus),
    ...(!publicId || memory.visibility ? { visibility: memory.visibility || "PUBLIC" } : {}),
    metadata: {
      ...metadata,
      language: metadata.language || defaultLanguage,
      source: memory.source || metadata.source || "admin",
      isLongForm: content.length > 220,
    },
  };
  // Omit unchanged relations on PATCH: replacing a partial array destroys the others.
  if ((!publicId || memory.attachmentsDirty) && Array.isArray(memory.attachments)) {
    payload.attachments = memory.attachments.map(({ url, type, metadata }) => ({
      url,
      type,
      metadata,
    }));
  }
  if (memory.tags !== undefined) {
    const tags = Array.isArray(memory.tags) ? memory.tags : String(memory.tags).split(",");
    payload.tags = tags
      .map((tag) => (typeof tag === "string" ? tag.trim() : tag.name))
      .filter(Boolean);
  }
  return payload;
}

export async function syncV1Memory(v1Api, memory) {
  const settings = await v1Api("/api/v1/settings");
  const payload = v1MemoryPayload(memory, settings.defaultLanguage);
  if (payload.publicId) {
    const id = payload.publicId;
    delete payload.publicId;
    return v1Api(`/api/v1/memories/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  }
  return v1Api("/api/v1/memories", { method: "POST", body: JSON.stringify(payload) });
}

export function archiveV1Memory(v1Api, memory) {
  if (!memory.publicId) throw new Error("No memory selected");
  return v1Api(`/api/v1/memories/${encodeURIComponent(memory.publicId)}`, { method: "DELETE" });
}
