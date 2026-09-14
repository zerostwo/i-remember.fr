import assert from "node:assert/strict";
import { renderSeo, sitemapXml, siteOrigin, publicPosts } from "../src/server/seo.js";
const settings = {
  siteTitle: "My archive",
  canonicalUrl: "https://example.org",
  siteDescription: 'A home for <moments> & "stories"',
  ownerName: "Jane Doe",
  ownerAlternateName: "简",
};
const post = {
  public_id: "m1234567890abcdef1234",
  title_text: "Morning",
  body_markdown: "A walk </script><script>alert(1)</script>",
  image_url: "/uploads/morning.jpg",
};
const template =
  '<html><head><title>Old</title><meta name="description" content="Old"><meta property="og:url" content="old"></head><body></body></html>';
const dollarTitle = renderSeo(template, { ...settings, siteTitle: "$& $` $'" }, null, []);
assert.match(dollarTitle, /<title>\$&amp; \$` \$&#39;/);
const home = renderSeo(template, settings, null, [post]);
assert.match(home, /My archive · Jane Doe · 简/);
assert.match(home, /href="https:\/\/example.org\/"/);
assert.match(home, /A home for &lt;moments&gt; &amp; &quot;stories&quot;/);
assert.equal((home.match(/name="description"/g) || []).length, 1);
assert.ok(!home.includes("songqi.org"));
assert.ok(home.includes(`/memory/${post.public_id}`));
const memory = renderSeo(template, settings, post, [post]);
assert.match(memory, /https:\/\/example.org\/uploads\/morning.jpg/);
const structured = JSON.parse(
  memory.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1],
);
assert.equal(structured["@graph"].at(-1).text, post.body_markdown);
assert.ok(!memory.includes("<script>alert(1)</script>"));
assert.match(memory, new RegExp(`href="https://example.org/memory/${post.public_id}"`));
const cleared = renderSeo(
  template,
  { ...settings, ownerName: "", ownerAlternateName: "", siteDescription: "" },
  null,
  [],
);
assert.ok(!cleared.includes('"@type":"Person"'));
assert.deepEqual(
  publicPosts([
    post,
    post,
    { public_id: "123", body_markdown: "old" },
    { public_id: "m00000000000000000000", body_markdown: "" },
  ]),
  [post],
);
assert.equal((sitemapXml(settings, [post, post]).match(/<url>/g) || []).length, 2);
assert.equal((sitemapXml(settings, []).match(/<url>/g) || []).length, 1);
assert.equal(siteOrigin("javascript:alert(1)"), "https://songqi.org");
assert.equal(siteOrigin("https://example.org/path"), "https://example.org");
console.log("SEO metadata, alternate deployment, escaping, and sitemap checks passed");
