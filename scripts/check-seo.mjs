import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { versionPublicAssets } from "../src/server/public-asset-versions.js";
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
assert.match(home, /<title>My archive<\/title>/);
assert.match(home, /"name":"Jane Doe","alternateName":"简"/);
const personalSettings = { ...settings, siteTitle: "Songqi Duan | 段松岐", ownerName: "Songqi Duan", ownerAlternateName: "段松岐", siteDescription: "A quiet place for the moments we might one day forget." };
const personalHome = renderSeo(template, personalSettings, null, []);
assert.match(personalHome, /<title>Songqi Duan \| 段松岐<\/title>/);
assert.match(personalHome, /<meta property="og:site_name" content="Songqi Duan \| 段松岐">/);
assert.match(personalHome, /<meta name="description" content="A quiet place for the moments we might one day forget\.">/);
const personalGraph = JSON.parse(personalHome.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])["@graph"];
assert.equal(personalGraph.find(node => node["@type"] === "WebSite").name, personalSettings.siteTitle);
assert.equal(personalGraph.find(node => node["@type"] === "Person").name, personalSettings.ownerName);
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

for (const languageFile of ["index.html", "fr.html"]) {
  const html = versionPublicAssets(readFileSync(new URL(`../${languageFile}`, import.meta.url), "utf8"));
  for (const path of ["js/memory-navigation.js", "js/photo-gallery.js", "js/revival-runtime.js", "css/mobile-fixes.css"]) {
    const hash = createHash("sha256").update(readFileSync(new URL(`../public/${path}`, import.meta.url))).digest("hex").slice(0, 16);
    assert.ok(html.includes(`/${path}?v=${hash}`), `${languageFile}: ${path} must invalidate old browser/CDN copies`);
  }
  assert.equal(versionPublicAssets(html), html, "Asset versioning must be stable");
}

const shortPosts = ["ZDfRmeuj", "rainbow", "my-memory"].map(public_id => ({ ...post, public_id }));
assert.deepEqual(publicPosts([post, ...shortPosts, ...shortPosts]), [post, ...shortPosts]);
for (const entry of shortPosts) {
  assert.ok(sitemapXml(settings, [post, ...shortPosts]).includes(`/memory/${entry.public_id}`));
  assert.ok(renderSeo(template, settings, null, shortPosts).includes(`/memory/${entry.public_id}`));
}
assert.equal(publicPosts([{ ...post, public_id: "bad/id" }, { ...post, public_id: "12345678" }]).length, 0);
