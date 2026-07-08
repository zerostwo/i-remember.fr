import assert from "node:assert/strict";
import {
  deleteV1MenuItem,
  syncV1MenuItem,
  syncV1Page,
  syncV1Settings,
  v1MenuItemPayload,
  v1PagePayload,
  v1SettingsPayload,
} from "./v1-content.js";

assert.deepEqual(v1PagePayload({
  id: 7,
  slug: "about",
  title: "About",
  bodyMarkdown: "# About",
  status: "PUBLISHED",
}).metadata, { legacyId: 7, legacyUid: "" });

assert.equal(v1MenuItemPayload({ id: 2, label: "About", type: "PAGE" }).uid, "legacy-menu-2");
assert.equal(v1SettingsPayload({ defaultLanguage: "zh", tracking: { enabled: true } }).defaultLanguage, "zh");

const calls = [];
const menuItems = [{ id: "v1-menu", uid: "legacy-menu-2", metadata: { legacyId: 2 } }];
async function v1Api(path, options = {}) {
  calls.push({ path, options });
  if (path.startsWith("/api/v1/pages/")) throw new Error("not found");
  if (path.startsWith("/api/v1/menu-items?")) return menuItems;
  return { id: "ok" };
}

await syncV1Page(v1Api, { id: 7, slug: "about", title: "About" });
assert.equal(calls.at(-1).path, "/api/v1/pages");

await syncV1MenuItem(v1Api, { id: 2, label: "About", type: "PAGE" });
assert.equal(calls.at(-1).path, "/api/v1/menu-items/v1-menu");
assert.equal(calls.at(-1).options.method, "PATCH");

await deleteV1MenuItem(v1Api, { id: 2, label: "About", type: "PAGE" });
assert.equal(calls.at(-1).options.method, "DELETE");

await syncV1Settings(v1Api, { defaultLanguage: "en", anonymousSubmissions: true });
assert.equal(calls.at(-1).path, "/api/v1/settings");

console.log("admin v1 content sync ok");
