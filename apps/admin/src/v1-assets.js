function assetKey(asset = {}) {
  const url = String(asset.url || "");
  const fallback = String(asset.id || "asset");
  const pathname = decodeURIComponent(url.split("?")[0]);
  const uploadKey = pathname.match(/(?:^|\/)uploads\/(.+)$/)?.[1];
  if (uploadKey) return uploadKey;
  return pathname.split("/").filter(Boolean).pop() || fallback;
}

// Public uploads keep their card crop in `url`; full-size and paired media
// are stored beside it. Direct admin uploads already point at the full file.
export function v1AssetPreviewUrls(asset = {}) {
  const url = asset.url || asset.resizedUrl || "";
  const folder = url.match(/^(.*\/posts\/revival-[a-z0-9-]+)\/[^/?#]+(?:\?[^#]*)?$/i)?.[1];
  const image = /^(image\/)/.test(asset.type || asset.mimeType || "");
  return {
    preview: image && folder ? `${folder}/full.jpg` : url,
    video: asset.metadata?.videoUrl || (asset.metadata?.livePhoto && folder ? `${folder}/video.mp4` : ""),
    download: asset.metadata?.livePhoto
      ? asset.metadata.downloadUrl || (folder ? `${folder}/live-photo.zip` : url)
      : image && folder ? `${folder}/full.jpg` : url,
  };
}

function adminAttachment(asset = {}) {
  const url = String(asset.url || "");
  return {
    id: asset.id,
    url,
    type: asset.type || "application/octet-stream",
    metadata: asset.metadata || {},
    memoryIds: asset.memoryId ? [asset.memoryId] : [],
    imageKey: assetKey(asset),
    storageType: "v1",
    thumbUrl: asset.metadata?.posterUrl || url,
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
    metadata: { filename: String(file.name || "upload") },
  };
}

export function v1AssetDeletePath(attachment = {}) {
  const key =
    attachment.imageKey || assetKey({ url: attachment.resizedUrl || attachment.thumbUrl });
  return `/api/v1/assets/${encodeURIComponent(key)}`;
}

export function mergeV1Assets(payload, assets = []) {
  if (!assets?.length) return payload;
  const seen = new Set((payload.attachments || []).map((item) => item.resizedUrl || item.thumbUrl));
  const next = (payload.attachments || []).map((item) => ({
    ...item,
    memoryIds: [...(item.memoryIds || [])],
  }));
  for (const asset of assets) {
    const item = adminAttachment(asset);
    const key = item.resizedUrl || item.thumbUrl || item.imageKey;
    if (!key) continue;
    if (seen.has(key)) {
      const existing = next.find((entry) => (entry.resizedUrl || entry.thumbUrl) === key);
      if (existing && asset.memoryId)
        existing.memoryIds = [...new Set([...(existing.memoryIds || []), asset.memoryId])];
      continue;
    }
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
