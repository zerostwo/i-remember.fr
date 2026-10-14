import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const source = await readFile(new URL("../public/js/revival-runtime.js", import.meta.url), "utf8");
const englishShell = await readFile(new URL("../index.html", import.meta.url), "utf8");
const frenchShell = await readFile(new URL("../fr.html", import.meta.url), "utf8");

assert.match(englishShell, /Let's keep the moments we never want to lose\./);
assert.match(englishShell, /Your memory now has a place to stay\./);
assert.match(frenchShell, /Gardons les moments que nous ne voulons jamais perdre\./);
assert.doesNotMatch(`${englishShell}\n${frenchShell}\n${source}`, /fight Alzheimer|lutter contre (?:la maladie d[’']Alzheimer|Alzheimer)/i);
// Execute the shipping functions with controlled network/viewport boundaries.
// No duplicate implementation and no DOM mutation in the browser test driver.
function runtimeFunction(name, context = {}) {
  const start = source.indexOf(`  function ${name}(`);
  const end = source.indexOf("\n  function ", start + 1);
  assert.ok(start >= 0 && end > start, `Missing runtime function ${name}`);
  return runInNewContext(`(${source.slice(start, end).trim()})`, context);
}

const page = runtimeFunction("memoryEnginePage");
const cardLayout = runtimeFunction("desktopCardLayout");
for (const [width, height, header, footer] of [[1512, 861, 166, 166], [1280, 720, 140, 140], [768, 900, 140, 140]]) {
  const layout = cardLayout(width, height, header, footer);
  assert.ok(layout.top >= header + 16);
  assert.ok(layout.top + layout.imageHeight <= height - footer - 16);
  assert.ok(layout.imageWidth + 348 <= width - 48);
}
assert.equal(cardLayout(1920, 1200, 140, 140).imageHeight, 600, "Large desktops keep the original image size");
assert.equal(cardLayout(1024, 180, 100, 100), null);
for (const ratio of [7840 / 5184, 2 / 3, 1, 3]) {
  const layout = cardLayout(1280, 720, 140, 140, ratio);
  assert.ok(Math.abs(layout.imageWidth / layout.imageHeight - ratio) < 0.00001, "Photo bounds must preserve natural aspect ratio");
  assert.ok(layout.imageWidth + 348 <= 1280 - 48);
  assert.ok(layout.top + layout.imageHeight <= 720 - 140 - 16);
}
assert.doesNotMatch(source, /revival-photo-hint|photo\.setAttribute\("title"/, "Photos enlarge without a visible label or tooltip");
const shareWindow = {
  SONGQI_SITE_SETTINGS: { canonicalUrl: "https://songqi.org" },
  location: { origin: "http://localhost:7890" },
};
const shareUrl = runtimeFunction("publicShareUrl", { window: shareWindow, URL });
assert.equal(
  shareUrl("/memory/m11111111111111111111"),
  "https://songqi.org/memory/m11111111111111111111",
);
assert.equal(shareUrl(""), "https://songqi.org/");
delete shareWindow.SONGQI_SITE_SETTINGS;
assert.equal(
  shareUrl("/memory/m11111111111111111111"),
  "http://localhost:7890/memory/m11111111111111111111",
);
assert.ok(source.includes("s=window.__REVIVAL_PUBLIC_SHARE_URL__(s),"));
const originalMain = await readFile(new URL("../public/js/main.js", import.meta.url), "utf8");
const patchedMain = runtimeFunction("patchLegacyMainSource")(originalMain);
assert.ok(patchedMain.includes("s=window.__REVIVAL_PUBLIC_SHARE_URL__(s),"));
assert.ok(
  !patchedMain.includes("s=n.SITE_URL+s,"),
  "Sharing must use the configured canonical origin",
);
assert.ok(patchedMain.includes("window.SongqiPhotos.uploadFiles(this.files,false)"));
assert.ok(!patchedMain.includes("r.width>5e3||r.height>5e3"), "Camera photos must reach server pixel validation");
assert.ok(patchedMain.includes("window.SongqiPhotos.showMemory(e)"), "All memory entry paths must initialize the gallery");
assert.ok(patchedMain.includes("JSON.stringify(r.data.photos)"), "Submission must persist every crop");
assert.ok(patchedMain.includes("window.SongqiPhotos.createAdjustmentStep"), "The old drag-only editor must be replaced");
const backgroundHandler = patchedMain.match(/function _\(e\)\{e.target===this&&w&&[^}]+\}/)[0];
for (const id of ["upload-methods", "adjustment", "message"]) {
  let exits = 0;
  const container = {};
  const handler = runInNewContext(`(${backgroundHandler})`, { w: { id }, j: () => exits++ });
  handler.call(container, { target: container });
  assert.equal(exits, 0, `${id} must retain the draft on an outside click`);
}
new Function(patchedMain);
assert.ok(patchedMain.includes('window.SongqiMemoryNavigation.opened(e)'));
assert.ok(patchedMain.includes('window.SongqiMemoryNavigation.closed()'));
assert.ok(patchedMain.includes('e.replace=function(t){U(t);O=t;'));
const navigationSource = await readFile(new URL("../public/js/memory-navigation.js", import.meta.url), "utf8");
const navigationWindow = {}, viewRequests = [];
runInNewContext(navigationSource, {
  window: navigationWindow,
  document: { querySelector: () => null },
  fetch: (url) => { viewRequests.push(url); return Promise.resolve({ ok: true }); },
});
const navigation = navigationWindow.SongqiMemoryNavigation;
const firstMemory = { public_id: "m11111111111111111111" };
navigation.opened(firstMemory);
navigation.opened(firstMemory);
assert.equal(viewRequests.length, 1, "Repeated renders must not add views");
navigation.opened({ public_id: "m22222222222222222222" });
assert.equal(viewRequests.length, 2, "Switching memories counts the new open");
navigation.closed();
navigation.opened(firstMemory);
assert.equal(viewRequests.length, 3, "Reopening counts a new visit");
navigation.opened({ public_id: "123" });
assert.equal(viewRequests.length, 3, "Placeholder identities must not count");
assert.equal(navigation.swipeDirection(10, -100, 200), 1);
assert.equal(navigation.swipeDirection(10, 100, 200), -1);
assert.equal(navigation.swipeDirection(100, 10, 200), 0, "Horizontal photo swipe must not change memory");
assert.equal(navigation.swipeDirection(10, 20, 200), 0, "A tap must not change memory");
assert.equal(navigation.swipeDirection(10, 100, 2000), 0, "Slow scrolling must not change memory");
const gallerySource = await readFile(new URL("../public/js/photo-gallery.js", import.meta.url), "utf8");
const galleryWindow = {};
runInNewContext(gallerySource, { window: galleryWindow, Map });
const cropBounds = galleryWindow.SongqiPhotos.cropBounds;
for (const [width, height] of [[2400, 1587], [600, 900], [600, 600]]) {
  for (const zoom of [1, 2, 4]) {
    for (const [x, y] of [[0, 0], [0.5, 0.5], [1, 1]]) {
      const crop = cropBounds(width, height, { x, y, zoom });
      assert.equal(crop.size, Math.min(width, height) / zoom);
      assert.ok(crop.left >= 0 && crop.left + crop.size <= width);
      assert.ok(crop.top >= 0 && crop.top + crop.size <= height);
    }
  }
}
const validateUpload = runtimeFunction("uploadFileError", {
  window: { SONGQI_UPLOAD_LIMITS: { maxBytes: 8388608 } }, siteLanguage: () => "en",
});
assert.equal(validateUpload({ size: 2117493 }), "");
assert.equal(validateUpload({ size: 8388608 }), "");
assert.match(validateUpload({ size: 8388609 }), /8 MB/);
// Execute URL changes through the actual history wrapper, including existing
// links, in-place language switching, memory open/close, and back navigation.
const languageEvents = new Map();
const historyCalls = [];
const languageWindow = {
  LANG: "en",
  SONGQI_SITE_SETTINGS: { defaultLanguage: "en" },
  location: new URL("https://songqi.org/?ln=en&campaign=hello%20world#intro"),
  addEventListener: (name, callback) => languageEvents.set(name, callback),
  sessionStorage: { getItem: () => "fr" },
};
languageWindow.history = {
  state: { preserved: true },
  pushState(state, _title, path) {
    historyCalls.push(["push", state, path]);
    languageWindow.location = new URL(path, languageWindow.location);
  },
  replaceState(state, _title, path) {
    historyCalls.push(["replace", state, path]);
    languageWindow.location = new URL(path, languageWindow.location);
  },
};
const languageContext = {
  URL,
  window: languageWindow,
  refreshMemoryRoute: () => {},
  applyLanguagePreference: () => {},
};
for (const name of ["normalizedLanguage", "defaultRouteLanguage", "languageFromLocation", "siteLanguage", "languageUrl", "setPreferredLanguage"]) {
  languageContext[name] = runtimeFunction(name, languageContext);
}
assert.equal(languageContext.siteLanguage(), "en", "A stale saved preference must not override the rendered default");
runtimeFunction("installMemoryRouteObserver", languageContext)();
assert.equal(languageWindow.location.searchParams.has("ln"), false);
assert.equal(languageWindow.location.searchParams.get("campaign"), "hello world");
assert.equal(languageWindow.location.hash, "#intro");
assert.deepEqual(historyCalls[0][1], { preserved: true });
languageWindow.history.pushState(null, "", "/memory/m11111111111111111111");
assert.equal(languageWindow.location.pathname, "/memory/m11111111111111111111");
assert.equal(languageWindow.location.search, "");
languageContext.setPreferredLanguage("fr");
assert.equal(languageWindow.location.pathname, "/memory/m11111111111111111111");
assert.equal(languageWindow.location.search, "?ln=fr");
languageWindow.history.pushState(null, "", "/");
assert.equal(languageWindow.location.search, "?ln=fr");
languageContext.setPreferredLanguage("en");
assert.equal(languageWindow.location.href, "https://songqi.org/");
languageWindow.location = new URL("https://songqi.org/memory/m11111111111111111111?ln=fr");
languageEvents.get("popstate")();
assert.equal(languageWindow.LANG, "fr");
assert.equal(languageContext.languageUrl("/fr?ln=fr#chapter", "fr"), "/fr#chapter");
assert.equal(languageContext.languageUrl("/fr", "en"), "/fr?ln=en", "A legacy language path must retain an explicit language override");
assert.equal(languageContext.languageUrl("https://elsewhere.example/?ln=en", "en"), "https://elsewhere.example/?ln=en");
languageWindow.SONGQI_SITE_SETTINGS.defaultLanguage = "fr";
assert.equal(languageContext.languageUrl("/?ln=fr&source=menu#footer", "fr"), "/?source=menu#footer");
assert.equal(languageContext.languageUrl("/memory/m11111111111111111111", "en"), "/memory/m11111111111111111111?ln=en");

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

let uploadFailure;
const failedUpload = runtimeFunction("localApiAjax", {
  URL, AbortController, window: {}, uploadImageInFlight: 0,
  localApiUrl: (url) => url, memoryEnginePayload: () => null,
  parseAjaxPayload: JSON.parse,
  fetch: async () => ({ ok: false, status: 400, text: async () => JSON.stringify({ errorMsg: "Please choose a valid image." }) }),
});
failedUpload({ url: "http://local/api/upload-image", type: "POST", error: (xhr) => { uploadFailure = xhr; } });
await new Promise((resolve) => setImmediate(resolve));
assert.equal(uploadFailure.errorMsg, "Please choose a valid image.", "Upload validation must survive the legacy AJAX error adapter");

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
  "Public runtime passed: clean language URLs/history, 405 unordered IDs, real request cancellation, keyboard/pinch distinction, and coalesced viewport updates",
);
