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

- HTML responses contain one title, description, and canonical link, plus Open
  Graph, Twitter card metadata, and JSON-LD `WebSite` / `Person` information.
- Homepage interactive content and fallback memory links use `data-nosnippet`;
  the configured description remains eligible for snippets. Links stay crawlable,
  and memory permalinks retain their own descriptions and readable content.
- Published memory pages contain content-specific descriptions and `CreativeWork`
  data. Anonymous memories are not falsely attributed to the site owner.
- Names and text are escaped in HTML, XML, and JSON-LD. Canonical origins are
  validated when saved. Clearing the alternate name removes it from public metadata.
- `/robots.txt` advertises the current domain's `/sitemap.xml`. Larger archives
  use a sitemap index and numbered files, with up to 20,000 memories per file.
- Only valid, nonempty published public memories returned by the unauthenticated
  API enter the sitemap. Unlisted/private/draft/archived content stays out.
- `/memory/<id>` uses one canonical content URL regardless of display language;
  homepage language variants canonicalize to `/`. The display language translates
  interface text, not the underlying memory collection.
- JavaScript-free visitors get a readable fallback with links to real memories.
  The normal rendered page keeps the original galaxy and its interaction model.
- Admin and API responses use `X-Robots-Tag: noindex, nofollow`. Robots exclusion
  is a crawling hint, not an access-control mechanism; authentication remains required.

Metadata is generated for everyone, without special crawler-only HTML. It does not
change the normal public layout or add keywords hidden solely for search ranking.
Private account email and credentials are never included in the identity schema.

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
Use meaningful memory titles and original stories. Avoid repeating names and keywords
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
