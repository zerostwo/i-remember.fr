function assetKey(asset = {}) {
  const url = String(asset.url || "");
  const fallback = String(asset.id || "asset");
  const pathname = decodeURIComponent(url.split("?")[0]);
  const uploadKey = pathname.match(/(?:^|\/)uploads\/(.+)$/)?.[1];
  if (uploadKey) return uploadKey;
  return pathname.split("/").filter(Boolean).pop() || fallback;
}

function adminAttachment(asset = {}) {
  const url = String(asset.url || "");
  return {
    imageKey: assetKey(asset),
    storageType: "v1",
    thumbUrl: url,
    resizedUrl: url,
    mimeType: asset.type || "application/octet-stream",
    updatedAt: asset.createdAt,
    memoryId: asset.memoryId,
  };
}

export function v1AssetKey(file = {}, stamp = Date.now()) {
  const name =
    String(file.name || "upload.bin")
      .replace(/\\/g, "/")
      .split("/")
      .pop()
      ?.replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "upload.bin";
  return `admin/${stamp}-${name}`;
}

export function v1AssetUploadPayload(file = {}, contentBase64 = "", memoryId, stamp) {
  return {
    key: v1AssetKey(file, stamp),
    memoryId,
    contentBase64,
    contentType: file.type || "application/octet-stream",
  };
}

export function v1AssetDeletePath(attachment = {}) {
  const key = attachment.imageKey || assetKey({ url: attachment.resizedUrl || attachment.thumbUrl });
  return `/api/v1/assets/${encodeURIComponent(key)}`;
}

export function mergeV1Assets(payload, assets = []) {
  if (!assets?.length) return payload;
  const seen = new Set((payload.attachments || []).map((item) => item.resizedUrl || item.thumbUrl));
  const next = [...(payload.attachments || [])];
  for (const asset of assets) {
    const item = adminAttachment(asset);
    const key = item.resizedUrl || item.thumbUrl || item.imageKey;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    next.push(item);
  }
  return {
    ...payload,
    attachments: next,
    counts: {
      ...(payload.counts || {}),
      attachments: next.length,
    },
  };
}
