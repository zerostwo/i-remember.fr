import assert from "node:assert/strict";
import { markdownToHtml, memoryPreview, memoryBody, memoryReaderTitle } from "./markdown.js";
import { publicCardDocument } from "./public-card-document.js";
const html = markdownToHtml(
  "# Heading\n\n- **Bold**\n- [Link](https://example.test)\n\n> Quote\n\n```js\nconst x = 1;\n```",
);
for (const pattern of [
  /<h1>Heading<\/h1>/,
  /<ul>/,
  /<strong>Bold<\/strong>/,
  /<blockquote>/,
  /<pre><code class="language-js">/,
])
  assert.match(html, pattern);
assert.doesNotMatch(
  markdownToHtml(
    "<script>alert(1)</script>\n\n[click](javascript:alert(1))\n\n![photo](javascript:alert(1))",
  ),
  /<script>|href="javascript:|src="javascript:/,
);
const preview = memoryPreview({
  title: "Hello",
  bodyMarkdown: "new ".repeat(100),
  excerpt: "stale",
});
assert.equal(preview.truncated, true);
assert.equal(preview.longForm, true);
assert.doesNotMatch(preview.text, /stale/);
console.log("Shared CommonMark safety and current-content previews passed");

assert.equal(memoryBody({ title: "Heading", content: "# Heading\n\nBody" }), "Body");
assert.equal(memoryPreview({ title: "Heading", content: "# Heading\n\nBody" }).text, "Body");

const card = publicCardDocument({
  title: "Heading",
  bodyMarkdown: "# Heading\n\nCurrent body",
  excerpt: "Stale excerpt",
  author: '<script>alert("author")</script>',
  attachments: [
    { url: "/a.pdf", type: "application/pdf" },
    { url: '/photo.png" onerror="alert(1)', type: "image/png" },
  ],
});
assert.match(card, /href="\/css\/main.css"/);
assert.match(card, /href="\/css\/mobile-fixes.css"/);
assert.match(card, /post-2d-message-prefix">I remember, /);
assert.match(card, /Current body/);
assert.doesNotMatch(card, /Stale excerpt|songqi-card-copy|src="\/a.pdf"|<script>| onerror="/);
assert.match(card, /&lt;script&gt;/);
assert.match(card, /photo.png&quot; onerror=&quot;/);
assert.match(publicCardDocument(), /src="\/uploads\/posts\/revival-upload\/resized.jpg"/);
assert.match(publicCardDocument(), /post-2d-name">I Remember</);
console.log("Original public card styles, current draft content and escaped preview markup passed");

const detailPreview = publicCardDocument({ createdAt: "2026-10-17T12:00:00Z", locationName: "<Groningen>" }, { timezone: "Europe/Amsterdam", memorySharing: true });
assert.doesNotMatch(detailPreview, /17 Oct 2026|memory-details/);
assert.doesNotMatch(detailPreview, /&lt;Groningen&gt;/);
assert.match(detailPreview, /data-memory-sharing="true"/);
assert.doesNotMatch(publicCardDocument({ locationName: "", metadata: { locationName: "Old" } }), /memory-location/);

const chinese = memoryPreview({ content: "那天我们沿着河边慢慢走，记住了黄昏的光。".repeat(20) });
assert.ok(chinese.text.length <= 120 && chinese.truncated);
assert.equal(memoryPreview({ content: "A small memory." }).truncated, false);
assert.equal(memoryReaderTitle({ title: 'I saw "the moon"', content: 'I saw "the moon" rising over the water.' }), "");
assert.equal(memoryReaderTitle({ title: "About", content: "# About\n\nA place for memories." }), "About");
const longCard = publicCardDocument({ content: "A memory worth keeping. ".repeat(30) });
assert.match(longCard, /…<\/div><span class="revival-memory-explore">Read more<\/span>/);
assert.doesNotMatch(longCard, /Explore this memory/);
