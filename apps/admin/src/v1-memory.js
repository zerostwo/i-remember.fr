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
      ...(memory.locationName !== undefined ? { locationName: String(memory.locationName).trim().slice(0, 160) } : {}),
      language: metadata.language || defaultLanguage,
      source: memory.source || metadata.source || "admin",
      isLongForm: content.length > 220,
    },
  };
  // Omit unchanged relations on PATCH: replacing a partial array destroys the others.
  if ((!publicId || memory.attachmentsDirty) && Array.isArray(memory.attachments)) {
    payload.attachments = memory.attachments.map(({ id, url, type, metadata }) => ({
      ...(id ? { id } : {}),
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
  const language = memory.defaultLanguage || (await v1Api("/api/v1/settings")).defaultLanguage;
  const payload = v1MemoryPayload(memory, language);
  const id = String(memory.publicId || "").trim();
  delete payload.publicId;
  const requestedId = memory.linkId === undefined ? id : String(memory.linkId).trim();
  if (requestedId !== id && (id || requestedId)) payload.publicId = requestedId;
  if (id) {
    return v1Api(`/api/v1/memories/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ ...payload, expectedUpdatedAt: memory.expectedUpdatedAt }),
    });
  }
  try {
    return await v1Api("/api/v1/memories", {
      method: "POST", body: JSON.stringify({ ...payload, draftKey: memory.draftKey }),
    });
  } catch (error) {
    if (error.code !== "draft_already_saved" || !memory.draftKey) throw error;
  }

  // The original POST committed but its response was lost. Only the editor that
  // supplied this key can reach this branch. A public ID collision never qualifies.
  const original = await v1Api(`/api/v1/memories/draft_${encodeURIComponent(memory.draftKey)}`);
  if (original.status === "NORMAL" && payload.status !== "NORMAL") {
    const error = new Error("This memory was already published. Reopen it before changing its publication status.");
    error.code = "memory_changed";
    error.recordId = original.id;
    throw error;
  }
  if (payload.attachments) {
    const owned = new Map(original.attachments.map(item => [item.url, item.id]));
    payload.attachments = payload.attachments.map(item => ({ ...item, id: owned.get(item.url) }));
  }
  try {
    return await v1Api(`/api/v1/memories/${encodeURIComponent(original.id)}`, {
      method: "PATCH",
      // The create revision protects subsequent edits in other sessions, including status changes.
      body: JSON.stringify({ ...payload, expectedUpdatedAt: original.createdAt }),
    });
  } catch (error) {
    error.recordId = original.id;
    throw error;
  }
}

export function appendV1Attachment(attachments = [], attachment) {
  const order = Math.max(-1, ...attachments.map((item, index) =>
    Number.isFinite(item.metadata?.order) ? item.metadata.order : index)) + 1;
  return [...attachments, { ...attachment, metadata: { ...attachment.metadata, order } }];
}
