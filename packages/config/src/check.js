import assert from "node:assert/strict";
import { apiRoutes, roles, supportedLanguages } from "./index.js";

assert.deepEqual(supportedLanguages, ["en", "fr", "zh"]);
assert.equal(apiRoutes.memories, "/api/v1/memories");
assert.equal(apiRoutes.assets, "/api/v1/assets");
assert.equal(apiRoutes.authLogin, "/api/v1/auth/login");
assert.equal(apiRoutes.agent, "/api/v1/agent");
assert.equal(apiRoutes.comments, "/api/v1/comments");
assert.equal(apiRoutes.pages, "/api/v1/pages");
assert.equal(apiRoutes.menuItems, "/api/v1/menu-items");
assert.equal(apiRoutes.settings, "/api/v1/settings");
assert.deepEqual(roles, ["ADMIN", "USER", "ANONYMOUS"]);

console.log("config ok");
