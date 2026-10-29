import { micromark } from "micromark";
import { ApiError } from "./errors.js";
import type { AttachmentInput } from "./domain.js";

// All crops and the motion/audio components share one lifecycle with the source.
export function mediaIdentity(url: string) {
  return url.replace(/[?#].*$/, "").replace(/^(.*\/posts\/revival-[a-z0-9-]+)\/[^/]+$/i, "$1");
}

export function mediaStorageKey(identity: string) {
  const base = (process.env.STORAGE_PUBLIC_BASE_URL || "/uploads").replace(/\/+$/, "") + "/";
  if (!identity.startsWith(base)) return null;
  const key = identity.slice(base.length);
  if (key.split("/").some((part) => !part || part === "." || part === "..") || /[%\\]/.test(key))
    return null;
  return /^admin\/[a-zA-Z0-9._-]+$/.test(key) || /^posts\/revival-[a-f0-9-]{8,}$/i.test(key)
    ? key
    : null;
}

export function inlineMediaUrls(content: string) {
  const html = micromark(content);
  return [
    ...new Set(
      [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) =>
        match[1]
          .replace(/&amp;/g, "&")
          .replace(/&quot;/g, '"')
          .replace(/&#(?:x([a-f0-9]+)|(\d+));/gi, (_, hex, dec) =>
            String.fromCodePoint(parseInt(hex || dec, hex ? 16 : 10)),
          ),
      ),
    ),
  ];
}

export async function registerMedia(tx: any, input: AttachmentInput) {
  const identity = mediaIdentity(input.url);
  const asset = await tx.mediaAsset.upsert({
    where: { identity },
    create: {
      identity,
      url: input.url,
      type: input.type || "application/octet-stream",
      metadata: input.metadata as any,
    },
    // A real UPDATE holds the same row lock used by deletion until references commit.
    update: { updatedAt: new Date() },
  });
  if (asset.deletedAt)
    throw new ApiError(
      409,
      "This file was deleted. Upload it again before using it.",
      "asset_deleted",
    );
  return asset;
}

export async function syncMediaReferences(
  tx: any,
  owner: { memoryId?: string; pageId?: string },
  content: string,
  attachments: AttachmentInput[] = [],
) {
  const inputs = new Map(attachments.map((item) => [mediaIdentity(item.url), item]));
  for (const url of inlineMediaUrls(content)) {
    const identity = mediaIdentity(url);
    if (
      !inputs.has(identity) &&
      (mediaStorageKey(identity) || (await tx.mediaAsset.findUnique({ where: { identity } })))
    ) {
      inputs.set(identity, {
        url,
        type: /\.(png|jpe?g|webp|gif)$/i.test(url)
          ? "image/" + (url.endsWith(".png") ? "png" : "jpeg")
          : "application/octet-stream",
      });
    }
  }
  const assets = [];
  for (const [, input] of [...inputs].sort(([a], [b]) => a.localeCompare(b)))
    assets.push(await registerMedia(tx, input));
  await tx.mediaReference.deleteMany({ where: owner });
  if (assets.length)
    await tx.mediaReference.createMany({
      data: assets.map((asset) => ({ assetId: asset.id, ...owner })),
    });
}
