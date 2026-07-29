import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const htmlPaths = ["index.html", "fr.html", "legal.html", "admin.html", "apps/admin/index.html"];

for (const path of htmlPaths) {
  const html = await read(path);
  const viewport = html.match(/<meta\s+name=["']viewport["']\s+content=["']([^"']+)["']/i);

  assert(viewport, `${path}: missing viewport meta tag`);
  assert.match(viewport[1], /width=device-width/, `${path}: viewport must use the device width`);
  assert.match(
    viewport[1],
    /initial-scale=1(?:\.0)?/,
    `${path}: viewport must define initial scale`,
  );
  assert.match(
    viewport[1],
    /viewport-fit=cover/,
    `${path}: viewport must opt into iPhone safe areas`,
  );
  assert.doesNotMatch(
    viewport[1],
    /(?:maximum-scale|user-scalable)/,
    `${path}: viewport must not disable user zoom`,
  );

  assert.match(html, /name=["']theme-color["']/, `${path}: missing theme-color`);
  assert.match(html, /rel=["']manifest["']/, `${path}: missing web app manifest`);
}

const manifest = JSON.parse(await read("public/manifest.webmanifest"));
assert.equal(manifest.display, "standalone");
assert.equal(manifest.theme_color, "#08090b");
assert.equal(manifest.background_color, "#08090b");
assert.ok(manifest.name);
assert.ok(manifest.short_name);
assert.ok(
  manifest.icons.some((icon) => icon.sizes === "192x192"),
  "manifest: missing 192x192 icon",
);
assert.ok(
  manifest.icons.some((icon) => icon.sizes === "512x512"),
  "manifest: missing 512x512 icon",
);

for (const path of ["src/components/ui/input.jsx", "src/components/ui/textarea.jsx"]) {
  const source = await read(path);
  assert.match(source, /text-base/, `${path}: form controls must stay at least 16px`);
  assert.doesNotMatch(
    source,
    /(?:^|[\s"'`])(?:text-xs|text-sm)(?=$|[\s"'`])/m,
    `${path}: form controls must not use mobile text below 16px`,
  );
}

const select = await read("src/components/ui/select.jsx");
const selectTriggerClasses = select.match(
  /data-slot="select-trigger"[\s\S]*?className=\{cn\(\s*([`"])([\s\S]*?)\1/,
)?.[2];
const selectItemClasses = select.match(
  /data-slot="select-item"[\s\S]*?className=\{cn\(\s*([`"])([\s\S]*?)\1/,
)?.[2];
assert(selectTriggerClasses, "select: missing trigger classes");
assert(selectItemClasses, "select: missing item classes");
for (const [name, classes] of [
  ["trigger", selectTriggerClasses],
  ["item", selectItemClasses],
]) {
  assert.match(classes, /(?:^|\s)text-base(?:\s|$)/);
  assert.doesNotMatch(
    classes,
    /(?:^|\s)(?:text-xs|text-sm)(?:\s|$)/,
    `select: ${name} must not use mobile text below 16px`,
  );
}

const adminCss = await read("apps/admin/src/admin.css");
assert.match(adminCss, /--admin-visual-viewport-height/);
assert.match(adminCss, /env\(safe-area-inset-top/);
assert.match(adminCss, /env\(safe-area-inset-bottom/);
assert.match(adminCss, /font-size:\s*16px/);
assert.match(adminCss, /min-height:\s*44px/);
assert.match(adminCss, /-webkit-overflow-scrolling:\s*touch/);

const adminApp = await read("apps/admin/src/AdminApp.jsx");
assert.match(adminApp, /window\.visualViewport/);
assert.match(adminApp, /useBodyScrollLock/);
assert.match(adminApp, /useDialogFocusTrap/);
assert.match(adminApp, /removeEventListener/);

const publicRuntime = await read("public/js/revival-runtime.js");
assert.match(publicRuntime, /window\.visualViewport/);
assert.match(publicRuntime, /safe-area-inset-bottom/);
assert.match(publicRuntime, /min-height:\s*44px/);
assert.match(publicRuntime, /role["']?,\s*["']dialog/);
assert.match(publicRuntime, /prefers-reduced-motion/);

console.log("Mobile UX guardrails passed.");
