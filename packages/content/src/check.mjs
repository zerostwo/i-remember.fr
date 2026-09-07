import assert from "node:assert/strict";
import { markdownToHtml, memoryPreview, memoryBody } from "./markdown.js";
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
