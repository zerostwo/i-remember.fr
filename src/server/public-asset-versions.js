import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";

const publicRoot = new URL("../../public/", import.meta.url);
const versions = new Map();

// A CDN may keep the stable filenames fresh for hours. Version the small set
// of archive overrides by content so a release cannot mix old JS with new HTML.
export function versionPublicAssets(html) {
  return html.replace(/(src|href)="\/?((?:js\/(?:memory-navigation|photo-gallery|revival-runtime)\.js|css\/mobile-fixes\.css))(?:\?[^"<>]*)?"/g,
    (_match, attribute, path) => {
      const file = new URL(path, publicRoot);
      const stat = statSync(file);
      const signature = `${stat.mtimeMs}:${stat.size}`;
      let cached = versions.get(path);
      if (!cached || cached.signature !== signature) {
        cached = { signature, hash: createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 16) };
        versions.set(path, cached);
      }
      return `${attribute}="/${path}?v=${cached.hash}"`;
    });
}
