// Search metadata is rendered for every visitor, without user-agent detection.
const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);
const json = (value) => JSON.stringify(value).replace(/</g, "\\u003c");

export function siteOrigin(value) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error();
    return url.origin;
  } catch {
    return "https://songqi.org";
  }
}

export function publicPosts(posts) {
  return [...new Map(posts.filter((post) => /^m[a-f0-9]{20}$/i.test(post.public_id || "") &&
    String(post.body_markdown || "").trim()).map((post) => [post.public_id, post])).values()];
}

export function renderSeo(html, settings, post, posts) {
  const origin = siteOrigin(settings.canonicalUrl);
  const canonical = origin + (post ? `/memory/${post.public_id}` : "/");
  const identity = [settings.ownerName, settings.ownerAlternateName].filter(Boolean).join(" · ");
  // The configured site name is the complete homepage title. Owner identity
  // belongs in Person data, not in a second suffix appended to the site name.
  const title = post ? `${post.title_text} · ${settings.siteTitle}` : settings.siteTitle;
  const description = post ? String(post.body_markdown || "").replace(/[#*_`>\[\]]/g, "").replace(/\s+/g, " ").trim().slice(0, 300) : settings.siteDescription;
  let image;
  try {
    const candidate = new URL(post?.image_url || "/img/thumbnail.png", origin);
    if (["http:", "https:"].includes(candidate.protocol)) image = candidate.href;
  } catch { /* An invalid attachment must not break the public page. */ }
  const graph = [{ "@type": "WebSite", "@id": `${origin}/#website`, url: `${origin}/`, name: settings.siteTitle,
    description: settings.siteDescription, ...(identity ? { about: { "@id": `${origin}/#owner` } } : {}) }];
  if (identity) graph.push({ "@type": "Person", "@id": `${origin}/#owner`, name: settings.ownerName || settings.ownerAlternateName,
    ...(settings.ownerName && settings.ownerAlternateName ? { alternateName: settings.ownerAlternateName } : {}), url: `${origin}/` });
  if (post) graph.push({ "@type": "CreativeWork", "@id": canonical, url: canonical,
    name: post.title_text, text: post.body_markdown, isPartOf: { "@id": `${origin}/#website` }, ...(image ? { image } : {}) });
  // Remove template metadata so each tag has a single authoritative value.
  html = html.replace(/<title>[\s\S]*?<\/title>/gi, "")
    .replace(/<meta\s+(?:name="(?:description|twitter:[^"]+)"|property="og:[^"]+")[^>]*>/gi, "")
    .replace(/<link\s+rel="canonical"[^>]*>/gi, "");
  const metadata = `<title>${escape(title)}</title>
<meta name="description" content="${escape(description)}">
<link rel="canonical" href="${escape(canonical)}">
<meta property="og:title" content="${escape(title)}">
<meta property="og:description" content="${escape(description)}">
<meta property="og:site_name" content="${escape(settings.siteTitle)}">
<meta property="og:url" content="${escape(canonical)}">
<meta property="og:type" content="website">
${image ? `<meta property="og:image" content="${escape(image)}">` : ""}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escape(title)}">
<meta name="twitter:description" content="${escape(description)}">
${image ? `<meta name="twitter:image" content="${escape(image)}">` : ""}
<script type="application/ld+json">${json({ "@context": "https://schema.org", "@graph": graph })}</script>`;
  const content = post ? `<article><h1>${escape(post.title_text)}</h1><p style="white-space:pre-wrap">${escape(post.body_markdown)}</p><a href="/">All memories</a></article>` :
    `<h1>${escape(title)}</h1><p>${escape(description)}</p><ul>${publicPosts(posts).map((entry) => `<li><a href="/memory/${entry.public_id}">${escape(entry.title_text)}</a></li>`).join("")}</ul>`;
  return html.replace("</head>", () => `${metadata}</head>`).replace(/<body([^>]*)>/, (_match, attributes) => `<body${attributes}><noscript><main style="position:fixed;inset:0;z-index:99999;overflow:auto;background:#101010;color:#eee;padding:2rem;font:18px/1.6 Georgia,serif">${content}<p>Enable JavaScript to explore the interactive memory galaxy.</p></main></noscript>`);
}

export function sitemapXml(settings, posts) {
  const origin = siteOrigin(settings.canonicalUrl);
  const urls = [`${origin}/`, ...publicPosts(posts).map((post) => `${origin}/memory/${post.public_id}`)];
  // Sitemap protocol limit: callers serve chunks through an index for larger archives.
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((url) => `<url><loc>${escape(url)}</loc></url>`).join("")}</urlset>`;
}
