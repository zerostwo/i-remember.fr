import { memoryPreview } from "./markdown.js";

function escapeHtml(value = "") {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );
}

export function publicCardDocument(memory = {}, settings = {}) {
  const preview = memoryPreview(memory);
  const location = String(memory.locationName ?? memory.metadata?.locationName ?? "").trim();
  const date = memory.createdAt ? new Date(memory.createdAt) : null;
  let dateText = "";
  if (date && !Number.isNaN(date.getTime())) {
    const options = { year: "numeric", month: "short", day: "numeric", timeZone: settings.timezone || "UTC" };
    try { dateText = date.toLocaleDateString("en-GB", options); }
    catch { options.timeZone = "UTC"; dateText = date.toLocaleDateString("en-GB", options); }
  }
  const details = (dateText ? `<time datetime="${date.toISOString()}">${escapeHtml(dateText)}</time>` : "") +
    (location ? `<span class="memory-location">${escapeHtml(location)}</span>` : "");
  const image = memory.attachments?.find((item) => /^(image|video)\//.test(item.type));
  const imageUrl =
    (image?.type?.startsWith("video/") ? image?.metadata?.posterUrl : image?.url) ||
    `/uploads/posts/${encodeURIComponent(memory.metadata?.imageKey || "revival-upload")}/resized.jpg`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/css/main.css">
<link rel="stylesheet" href="/css/mobile-fixes.css">
<style>
/* Only the preview host position changes; the card uses its public layout. */
html,body{margin:0;width:100%;height:100%;overflow:auto;background:#000}
html body .post-2d{display:block;position:relative;height:100%}
html body .post-2d .post-2d-center-wrapper{opacity:1;top:0!important;max-height:100%!important}
html body .post-2d .post-2d-close-btn{position:absolute!important;top:6px!important;right:6px!important}
.post-2d-img img{display:block;width:100%;height:100%;object-fit:contain}
.post-2d-center-wrapper{width:948px;height:600px;left:0;transform:none}
.post-2d-img{width:600px}
.post-2d-content{position:relative}
.revival-memory-explore{display:block;margin:18px 0 4px;border:1px solid rgba(255,255,255,.3);border-radius:999px;background:transparent;color:#fff;font:11px Helvetica,Arial,sans-serif;letter-spacing:.04em;padding:9px 14px;text-transform:uppercase;min-height:44px}
</style></head><body${settings.memorySharing ? ' data-memory-sharing="true"' : ""}>
<article class="post-2d" aria-label="Memory card">
<div class="post-2d-center-wrapper">
<div class="post-2d-img">${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="">` : ""}</div>
<div class="post-2d-content-wrapper scroll-wrapper">
<div class="post-2d-content scroll-move-container">
<div class="post-2d-message-wrapper"><div class="post-2d-message-prefix">I remember, </div><div class="post-2d-message">${escapeHtml(preview.text)}${preview.truncated ? "…" : ""}</div>${preview.longForm ? '<span class="revival-memory-explore">Explore this memory</span>' : ""}</div>
<div class="post-2d-name">${escapeHtml(memory.author || memory.authorName || "I Remember")}</div>
${details ? `<div class="memory-details">${details}</div>` : ""}
<div class="post-2d-share-container"><span class="post-2d-share-text">Share on:</span>
<span class="post-2d-share-btn post-2d-share-btn-facebook ui-asset"></span><span class="post-2d-share-btn post-2d-share-btn-twitter ui-asset"></span><span class="post-2d-share-btn post-2d-share-btn-gplus ui-asset"></span></div>
</div>
<div class="post-2d-content-top"><span class="post-2d-close-btn circle-btn circle-btn-symbol-close" aria-hidden="true"><span class="circle-btn-icon-wrapper"><span class="circle-btn-icon"></span></span></span></div>
</div></div></article></body></html>`;
}
