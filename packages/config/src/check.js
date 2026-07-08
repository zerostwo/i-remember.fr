import assert from "node:assert/strict";
import { apiRoutes, roles, supportedLanguages } from "./index.js";

assert.deepEqual(supportedLanguages, ["en", "fr", "zh"]);
assert.equal(apiRoutes.memories, "/api/v1/memories");
assert.equal(apiRoutes.assets, "/api/v1/assets");
assert.equal(apiRoutes.agent, "/api/v1/agent");
assert.deepEqual(roles, ["ADMIN", "USER", "ANONYMOUS"]);

console.log("config ok");
