import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const source = await readFile(new URL("../public/js/revival-runtime.js", import.meta.url), "utf8");
// Execute the shipping functions with controlled network/viewport boundaries.
// No duplicate implementation and no DOM mutation in the browser test driver.
function runtimeFunction(name, context = {}) {
  const start = source.indexOf(`  function ${name}(`);
  const end = source.indexOf("\n  function ", start + 1);
  assert.ok(start >= 0 && end > start, `Missing runtime function ${name}`);
  return runInNewContext(`(${source.slice(start, end).trim()})`, context);
}

const page = runtimeFunction("memoryEnginePage");
const records = Array.from({ length: 405 }, (_, i) => ({ id: ((i * 83) % 405) + 1 }));
let cursor = "";
const seen = [];
do {
  const result = page(records, new URL(`http://local/?lastId=${cursor}`));
  seen.push(...result.map((record) => record.id));
  cursor = result.length === 200 ? result.at(-1).id : "";
} while (cursor);
assert.deepEqual(
  seen,
  records.map((record) => record.id),
);
assert.equal(page(records, new URL("http://local/?lastId=9999")).length, 0);

let requestedSignal;
let finishRequest;
let successCalls = 0;
const ajax = runtimeFunction("localApiAjax", {
  URL,
  AbortController,
  window: {},
  localApiUrl: (url) => url,
  appendQueryData: (url) => url,
  memoryEnginePayload: () => null,
  parseAjaxPayload: JSON.parse,
  fetch: (_url, options) => {
    requestedSignal = options.signal;
    return new Promise((resolve) => {
      finishRequest = resolve;
    });
  },
});
const xhr = ajax({
  url: "http://local/api/search-posts/rain",
  success: () => {
    successCalls += 1;
  },
});
xhr.abort();
assert.equal(requestedSignal.aborted, true, "Cancelling must reach the network layer");
assert.equal(xhr.readyState, 0);
finishRequest({ ok: true, status: 200, text: async () => '{"success":true,"data":[]}' });
await new Promise((resolve) => setImmediate(resolve));
assert.equal(successCalls, 0, "A cancelled request must not overwrite current UI results");

const classes = new Map();
const css = new Map();
const events = new Map();
const frames = [];
const visualViewport = {
  height: 844,
  offsetTop: 0,
  scale: 1,
  addEventListener: (name, handler) => events.set(name, handler),
};
const document = {
  documentElement: {
    style: { setProperty: (name, value) => css.set(name, value) },
    classList: { toggle: (name, active) => classes.set(name, active) },
  },
  activeElement: { tagName: "BODY" },
  addEventListener: (name, handler) => events.set(name, handler),
};
const window = {
  visualViewport,
  innerHeight: 844,
  I_REMEMBER_REVIVAL: {},
  requestAnimationFrame: (callback) => {
    frames.push(callback);
    return frames.length;
  },
  addEventListener: (name, handler) => events.set(name, handler),
};
runtimeFunction("installMobileViewportSupport", { window, document })();
assert.equal(classes.get("revival-keyboard-open"), false);
visualViewport.height = 440;
document.activeElement = { tagName: "DIV", isContentEditable: true };
events.get("resize")();
events.get("scroll")();
events.get("focusin")();
assert.equal(frames.length, 1, "Viewport event bursts must share one animation frame");
frames.shift()();
assert.equal(classes.get("revival-keyboard-open"), true);
assert.equal(css.get("--revival-visual-viewport-height"), "440px");
visualViewport.scale = 2;
events.get("resize")();
frames.shift()();
assert.equal(classes.get("revival-keyboard-open"), false, "Pinch zoom is not the keyboard");
assert.equal(css.get("--revival-visual-viewport-height"), "844px");
visualViewport.scale = 1;
document.activeElement = { tagName: "BODY" };
events.get("focusout")();
frames.shift()();
assert.equal(classes.get("revival-keyboard-open"), false);
console.log(
  "Public runtime passed: 405 unordered IDs, real request cancellation, keyboard/pinch distinction, and coalesced viewport updates",
);
