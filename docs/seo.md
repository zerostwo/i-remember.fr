# Search engine setup

The default identity is Songqi Duan / 段松岐 at https://songqi.org. Every deployment
should review **Settings → Site** before launch. Save its own site name, homepage title, public
origin, description, owner name, and optional alternate name. These are public
identity fields, not the private account email or login credentials.

The preferred search site name is **I remember,** (`siteName`), separate from the
homepage title **Songqi Duan | 段松岐** (`siteTitle`). The homepage description is
**A quiet place for the moments we might one day forget.** `WebSite.name` and
`og:site_name` use the site name; browser/search titles retain the homepage title.
Existing installations initialize the new name without replacing saved titles,
descriptions, owner identity, or tracking settings.

## Implemented behavior

- Only the homepage and configured site identity are eligible for search indexing.
  Homepage language variants canonicalize to `/`.
- Public pages use `noimageindex`; memory permalinks additionally use `noindex,
  nofollow` in both HTML metadata and `X-Robots-Tag` response headers.
- Uploaded files receive `X-Robots-Tag: noindex, nofollow, noimageindex`, including
  originals, crops, thumbnails, GIFs, video and audio. This applies to the public
  upload routes and the API's configurable local storage path, including HEAD
  requests and partial responses where supported.
- Metadata retains the configured site description, static site thumbnail and
  JSON-LD `WebSite` / `Person` identity. It no longer publishes memory text,
  `CreativeWork` data or uploaded media as search/share metadata.
- `/sitemap.xml` lists only the homepage. Previous numbered sitemaps return 404.
  The homepage's no-JavaScript fallback contains no memory directory. Direct
  memory pages keep readable fallback text, excluded from snippets and indexing.
- Admin/API responses remain `noindex, nofollow`. `/robots.txt` advertises the
  homepage sitemap and blocks admin/API crawling. Do not disallow `/memory/` or
  `/uploads/`: crawlers need access to their noindex headers to remove old results.
- Public viewing, memory links, albums and the galaxy remain available. No
  user-agent-specific content is served. These directives are not authentication
  and cannot stop noncompliant scrapers or people opening public image URLs.

If storage is served by an external CDN or object store, configure the same
`X-Robots-Tag` on that origin and invalidate cached responses. Application headers
cannot protect a URL served directly by another origin.

## Remove previously indexed content

Deploy first, then verify actual memory and image response headers. In Google
Search Console, inspect a memory URL and request recrawling as appropriate. For
faster removal, use **Removals → New request → Remove all URLs with this prefix**
for `https://songqi.org/uploads/` and separately `https://songqi.org/memory/`.
Include any other storage prefixes or origins actually used. Never request removal
of the whole domain or `/`, since the homepage should remain discoverable.
Temporary removal is not permanent: retain noindex after it expires. Search
Console access is needed to submit these requests; deploying does not submit them.
Results disappear only after Google processes the removal or recrawls the content.

## Launch on songqi.org

1. Set DNS and HTTPS for `songqi.org`. Redirect HTTP and any alternate public host
   to the preferred HTTPS domain at your reverse proxy.
2. Complete owner setup while the origin is private. Review Site settings, then
   publish an introduction and the memories you want visitors to find.
3. Confirm the live domain is reachable without authentication or a bot challenge.
4. Verify the domain in Google Search Console using DNS. Submit
   `https://songqi.org/sitemap.xml` and inspect the homepage and a memory URL.
5. Repeat sitemap submission in Bing Webmaster Tools if desired. Connect your
   public profiles to the same canonical domain and use consistent public names.

```bash
curl --fail https://songqi.org/readyz
curl --fail https://songqi.org/robots.txt
curl --fail https://songqi.org/sitemap.xml
curl --fail https://songqi.org/ > homepage.html
# Inspect <title>, description, canonical, and application/ld+json in homepage.html.
```

For another installation, replace the domain and owner identity in Site settings
and in the verification commands. Persisted settings take priority over deployment
environment defaults. A settings update reaches public HTML within about five
seconds; search engines refresh on their own crawl schedule.

Use the URL Inspection tool to distinguish discovery, crawling, indexing, and ranking.
A `site:songqi.org` query alone is not a complete indexing report. Docker publication
only makes the image available; it does not change DNS, deploy the owner's server,
verify a Search Console property, or submit a sitemap on the owner's behalf.

## Content and indexing

Write a useful published introduction that names the owner and explains the site.
Keep memory content out of search results. Avoid repeating names and keywords
unnaturally. A public homepage is a shared archive, so the schema describes a `WebSite`
about a `Person`; it does not claim a special Google profile-page rich result.

Search engines may rewrite titles/snippets and choose different canonical URLs.
Valid metadata and sitemap submission do not guarantee indexing, a rich result, or
ranking for Songqi Duan / 段松岐. New domains may take time to be discovered and indexed.

## References

- [Google: JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)
- [Google: SEO for developers](https://developers.google.com/search/docs/fundamentals/get-started-developers)
- [Google: canonical URLs](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [Google Search Console](https://search.google.com/search-console/about)
- [Bing Webmaster Tools](https://www.bing.com/webmasters/about)

- [Google: remove your images from search](https://developers.google.com/search/docs/crawling-indexing/prevent-images-on-your-page)
- [Google: block indexing with noindex](https://developers.google.com/search/docs/crawling-indexing/block-indexing)
- [Google: Removals tool](https://support.google.com/webmasters/answer/9689846)
