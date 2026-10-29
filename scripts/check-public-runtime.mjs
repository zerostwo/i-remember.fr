import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const source = await readFile(new URL("../public/js/revival-runtime.js", import.meta.url), "utf8");
const englishShell = await readFile(new URL("../index.html", import.meta.url), "utf8");
const frenchShell = await readFile(new URL("../fr.html", import.meta.url), "utf8");

// The legacy rejection handler must not turn denied playback into success.
const deniedPlay = Promise.reject(Object.assign(new Error("Autoplay denied"), { name: "NotAllowedError" }));
class FakeMedia { play() { return deniedPlay; } }
const mediaPatchStart = source.indexOf("  if (window.HTMLMediaElement");
const mediaPatchEnd = source.indexOf('\n  window.addEventListener("unhandledrejection"', mediaPatchStart);
runInNewContext(source.slice(mediaPatchStart, mediaPatchEnd), { window: { HTMLMediaElement: FakeMedia }, HTMLMediaElement: FakeMedia });
assert.equal(new FakeMedia().play(), deniedPlay);
await assert.rejects(new FakeMedia().play(), error => error.name === "NotAllowedError");

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

const routeDocument = { title: "A memory · Songqi Duan | 段松岐" };
const refreshHomeRoute = runtimeFunction("refreshMemoryRoute", {
  window: { SONGQI_SITE_SETTINGS: { siteTitle: "Songqi Duan | 段松岐", ownerName: "Songqi Duan", ownerAlternateName: "段松岐" } },
  document: routeDocument,
  memoryRequestSequence: 0,
  memoryRequestController: null,
  lastViewedMemory: "previous-memory",
  AbortController,
  memoryIdFromPath: () => "",
  setMemoryExplore: () => {},
});
refreshHomeRoute("/", false);
assert.equal(routeDocument.title, "Songqi Duan | 段松岐", "Returning home must preserve the exact configured site title");

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
// Direct links bypass both intro stages and the artificial startup/card delays.
assert.ok(patchedMain.includes('e.SKIP_PRELOADER=!!window.SONGQI_DIRECT_MEMORY||LANG=="zh"'));
assert.ok(patchedMain.includes('n._appInitFunc=m,u.start()},window.SONGQI_DIRECT_MEMORY?0:1e3)'));
assert.ok(patchedMain.includes('d.fromTo(g,revivalDirect?0:1'));
assert.ok(patchedMain.includes('window.SongqiPhotos.closeMemory&&window.SongqiPhotos.closeMemory()'));
// Natural completion and fast-forward share a single initialization latch, even
// if an early click arrives before assets and a later callback arrives afterward.
const startupSource = patchedMain.slice(patchedMain.indexOf("function m(){if(window.I_REMEMBER_REVIVAL.introAppInitialized)"));
assert.ok(startupSource.startsWith("function m(){if("));
let startupReady = false;
const startupCalls = [];
const mediaReadyListeners = [];
const startupWindow = { I_REMEMBER_REVIVAL: { introAppInitialized: false }, addEventListener: (name, callback) => {
  assert.equal(name, "songqi-markdown-ready"); mediaReadyListeners.push(callback);
} };
const startup = runInNewContext(`(${startupSource.slice(0, startupSource.indexOf("function g(){"))})`, {
  window: startupWindow, e: { uiAssetPath: "ui.png" },
  u: { getLoadedItemByURL: () => startupReady ? { content: {} } : null },
  n: { init: () => startupCalls.push("ui") },
  r: { init: () => startupCalls.push("posts") },
  i: { init: () => startupCalls.push("steps"), show: () => startupCalls.push("show") },
  f: { showParticles: () => startupCalls.push("particles") },
});
startup();
assert.equal(startupWindow.I_REMEMBER_REVIVAL.introAppInitialized, false);
startupReady = true;
for (let attempt = 0; attempt < 5; attempt++) startup();
assert.deepEqual(startupCalls, [], "Wait for shared media modules before initializing the gallery");
assert.equal(mediaReadyListeners.length, 1);
startupWindow.songqiMedia = {};
startupWindow.songqiLivePhotoPlayer = () => {};
mediaReadyListeners[0]();
for (let attempt = 0; attempt < 5; attempt++) startup();
assert.deepEqual(startupCalls, ["ui", "posts", "steps", "particles", "show"]);
const photoSource = await readFile(new URL("../public/js/photo-gallery.js", import.meta.url), "utf8");
const uploadStart = photoSource.indexOf("  function installUploadProgress(");
const uploadEnd = photoSource.indexOf("  function createAdjustmentStep(", uploadStart);
const installProgress = runInNewContext(`(${photoSource.slice(uploadStart, uploadEnd)})`, {
  window: { matchMedia: () => ({ matches: false }) },
});
const ring = { uniforms: {}, material: { vertexShader: "void main() { vec4 modelViewPos = vec4(1.); }" } };
installProgress(ring);
const firstShader = ring.material.vertexShader;
ring.uniforms.uploadProgress.value = 0.42;
for (let attempt = 0; attempt < 5; attempt++) installProgress(ring);
assert.equal(ring.material.vertexShader, firstShader);
assert.equal(ring.uniforms.uploadProgress.value, 0.42, "Re-initialization must not reset an upload");
assert.equal(firstShader.match(/uniform float uploadActive;/g).length, 1);

// Exercise native touch sequences even when the page started with mouse input.
const touchListeners = new Map();
const inputEvents = [], zoomEvents = [];
let inputClock = 1000;
const bindInput = runtimeFunction("bindLegacyInput", { Date: { now: () => inputClock }, Math });
bindInput({ addEventListener(type, handler, options) { touchListeners.set(type, { handler, options }); } },
  e => inputEvents.push(["down", e]), e => inputEvents.push(["move", e]),
  e => inputEvents.push(["up", e]), e => zoomEvents.push(e.wheelDelta), () => {});
const galaxyTarget = { closest: selector => selector === ".base-3d-container" ? {} : null };
const contact = (x, y) => ({ pageX: x, pageY: y, target: galaxyTarget });
function sendTouch(type, touches, target = galaxyTarget) {
  const event = { type, touches, changedTouches: [contact(20, 20)], target, cancelable: true, preventDefault() { this.prevented = true; } };
  touchListeners.get(type).handler(event);
  return event;
}
for (const type of ["touchstart", "touchmove", "touchend", "touchcancel"]) {
  assert.equal(touchListeners.get(type).options.passive, false, `${type} must own galaxy gestures`);
}
sendTouch("touchstart", [contact(0, 0)]);
sendTouch("touchmove", [contact(20, 20)]);
sendTouch("touchend", []);
for (const type of ["mousedown", "mousemove", "mouseup"]) touchListeners.get(type).handler({ type });
assert.deepEqual(inputEvents.map(e => e[0]), ["down", "move", "up"], "Compatibility mouse events cannot activate a tap twice");
inputClock += 900;
touchListeners.get("mousedown").handler({ type: "mousedown" });
assert.equal(inputEvents.length, 4, "Mouse remains usable on hybrid devices");
sendTouch("touchstart", [contact(0, 0)]);
sendTouch("touchstart", [contact(0, 0), contact(100, 0)]);
sendTouch("touchmove", [contact(0, 0), contact(150, 0)]);
sendTouch("touchend", []);
assert.ok(zoomEvents[0] > 0, "Pinch outward must zoom the galaxy in");
assert.equal(inputEvents.at(-1)[1].cancelled, true, "A pinch must not open a memory on release");
// Feed real pinch callbacks through the shipping legacy wheel dispatcher and
// camera handler. A zero wheelDelta used to fall back to undefined detail,
// making targetZoom NaN and blanking both WebGL scenes permanently.
function wheelPipeline(main) {
  const camera = { hasControl: true, zoom: 0, targetZoom: 0 };
  const wheelCamera = runInNewContext(`(${main.match(/function Pt\(t\)\{if\(!e.hasControl[\s\S]*?(?=function Ht\()/)[0]})`, {
    e: camera, tt: 0, wt: 0, F: 195, y: (value, min, max) => Math.max(min, Math.min(max, value)),
  });
  const dispatch = runInNewContext(`(${main.match(/function L\(e\)\{e=e\|\|o.event;[\s\S]*?(?=function A\(e\))/)[0]})`, {
    l: { currentBubbleHistory: [{ __wheel: wheelCamera }] },
  });
  return { camera, dispatch };
}
const brokenZoom = wheelPipeline(originalMain);
brokenZoom.dispatch({ wheelDelta: 0 });
assert.ok(Number.isNaN(brokenZoom.camera.targetZoom), "Reproduce the old stationary-pinch blank sky");
const safeZoom = wheelPipeline(patchedMain);
for (const event of [{ wheelDelta: 0 }, {}, { wheelDelta: NaN }, { wheelDelta: Infinity }, { detail: 0 }, { wheelDelta: 120 }, { detail: 3 }]) {
  safeZoom.dispatch(event);
  assert.ok(Number.isFinite(safeZoom.camera.targetZoom));
}
const pinchHandlers = new Map();
let pinchReleases = 0, pinchStarts = 0;
bindInput({ addEventListener(type, handler) { pinchHandlers.set(type, handler); } },
  () => pinchStarts++, () => {}, e => { assert.equal(e.cancelled, true); pinchReleases++; }, safeZoom.dispatch, () => {});
function pinch(type, points) {
  pinchHandlers.get(type)({ type, target: galaxyTarget, touches: points.map(x => contact(x, 0)), changedTouches: [contact(0, 0)], preventDefault() {} });
}
for (let repeat = 0; repeat < 20; repeat++) {
  pinch("touchstart", [0, 100]);
  for (const width of [100, 150, 150, 80, 80, 1, 1, 200, 200]) {
    pinch("touchmove", [0, width]);
    assert.ok(Number.isFinite(safeZoom.camera.targetZoom) && safeZoom.camera.targetZoom >= 0 && safeZoom.camera.targetZoom <= 1);
  }
  pinch("touchend", [0]);
  pinch("touchmove", [10]);
  pinch("touchend", []);
}
assert.equal(pinchStarts, 20, "Two simultaneous contacts initialize the galaxy input target");
assert.equal(pinchReleases, 20, "Lifting fingers separately must cancel click/double-click activation");
sendTouch("touchstart", [contact(0, 0)]);
sendTouch("touchcancel", []);
assert.equal(inputEvents.at(-1)[1].cancelled, true);
const beforeNative = inputEvents.length;
const nativeField = { closest: selector => selector.includes("input") ? {} : null };
sendTouch("touchstart", [contact(0, 0)], nativeField);
sendTouch("touchend", [], nativeField);
assert.equal(inputEvents.length, beforeNative, "Native fields and buttons retain browser focus and click behavior");
const memoryPhoto = { closest: selector => selector.includes(",.post-2d,") ? {} : null };
sendTouch("touchstart", [contact(0, 0)], memoryPhoto);
sendTouch("touchend", [], memoryPhoto);
assert.equal(inputEvents.length, beforeNative, "Photo taps remain native for gallery opening");
const memoryClose = { closest: selector => selector === ".post-2d-close-btn" || selector.includes(",.post-2d,") ? {} : null };
sendTouch("touchstart", [contact(0, 0)], memoryClose);
sendTouch("touchend", [], memoryClose);
assert.deepEqual(inputEvents.slice(beforeNative).map(e => e[0]), ["down", "up"], "Touch closing a memory must reach its archive button handler");
for (const type of ["mousedown", "mouseup"]) touchListeners.get(type).handler({ type, target: memoryClose });
assert.equal(inputEvents.length, beforeNative + 2, "Closing by touch must not replay through compatibility mouse events");

assert.ok(patchedMain.includes("window.__REVIVAL_BIND_INPUT__(u,O,M,_,L,A)"));
assert.ok(patchedMain.includes("s=e.isClick=!e.originalEvent.cancelled"));
assert.ok(!patchedMain.includes('l.hasTouch?(u.addEventListener("touchstart"'));
let searchExits = 0;
const mapClick = patchedMain.match(/function _\(e\)\{if\(document.documentElement.classList.contains\("revival-search-open"\)[\s\S]*?(?=function D\(\))/)[0];
runInNewContext(`(${mapClick})`, { document: { documentElement: { classList: { contains: () => true } } }, window: { __REVIVAL_EXIT_SEARCH__: () => searchExits++ } })({});
assert.equal(searchExits, 1, "The visible globe exits search without relying on shadowed legacy locals");
const backgroundHandler = patchedMain.match(/function _\(e\)\{e.target===this&&w&&[^}]+\}/)[0];
for (const id of ["upload-methods", "adjustment", "message"]) {
  let exits = 0;
  const container = {};
  const handler = runInNewContext(`(${backgroundHandler})`, { w: { id }, j: () => exits++ });
  handler.call(container, { target: container });
  assert.equal(exits, 0, `${id} must retain the draft on an outside click`);
}
new Function(patchedMain);
const closeDraft = patchedMain.match(/function j\(\)\{y.removeClass\("photo-drafting"\)[\s\S]*?(?=function F\(e\))/)[0];
let removedDraftClass = "";
runInNewContext(`(${closeDraft})`, {
  y: { removeClass: value => { removedDraftClass = value; } },
  l: { resetCamera() {} }, I() {}, z() {}, w: null,
  E: { removeClass() {} }, m: { to() {} },
  a: { uniforms: { opacity: {} } }, f: { uniforms: { fade: {} } },
  o: { show() {} }, i: { showNav() {} },
})();
assert.equal(removedDraftClass, "photo-drafting", "Cancel must restore the normal header");
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
for (const public_id of ["ZDfRmeuj", "new-memory", "m11111111111111111111"]) {
  navigation.opened({ public_id });
  assert.equal(viewRequests.at(-1), `/api/v1/memories/${public_id}/view`);
}
assert.equal(viewRequests.length, 6, "Short, custom and original IDs all count real opens");
assert.equal(navigation.swipeDirection(10, -100, 200), 1);
assert.equal(navigation.swipeDirection(10, 100, 200), -1);
assert.equal(navigation.swipeDirection(100, 10, 200), 0, "Horizontal photo swipe must not change memory");
assert.equal(navigation.swipeDirection(10, 20, 200), 0, "A tap must not change memory");
assert.equal(navigation.swipeDirection(10, 100, 2000), 0, "Slow scrolling must not change memory");
// Mobile reading owns the footer, including the globe drawn in WebGL. Verify
// direct entry, replacement, close and rotating through the desktop breakpoint.
{
  const classes = new Map();
  let breakpointChanged, controlsParent;
  const mobile = { matches: true, addEventListener(_type, handler) { breakpointChanged = handler; } };
  const element = () => ({ appendChild() { controlsParent = this; }, setAttribute() {}, addEventListener() {} });
  const root = element(), panel = element(), testWindow = { SONGQI_SITE_SETTINGS: { memoryNavigation: true }, matchMedia: () => mobile };
  runInNewContext(navigationSource, {
    window: testWindow,
    document: { documentElement: { classList: { toggle(name, value) { classes.set(name, value); } } }, createElement: element,
      querySelector: selector => selector === ".post-2d" ? root : selector === ".post-2d-center-wrapper" ? panel : null },
    fetch: async () => ({ ok: true }),
  });
  const nav = testWindow.SongqiMemoryNavigation;
  nav.opened(firstMemory);
  assert.equal(classes.get("revival-memory-mobile-open"), true);
  assert.equal(controlsParent, root, "Mobile arrows stay outside the scrollable text");
  nav.opened({ public_id: "next-memory" });
  assert.equal(classes.get("revival-memory-mobile-open"), true);
  mobile.matches = false; breakpointChanged();
  assert.equal(classes.get("revival-memory-mobile-open"), false);
  assert.equal(controlsParent, panel, "Desktop arrows stay at the card edges");
  mobile.matches = true; breakpointChanged();
  assert.equal(classes.get("revival-memory-mobile-open"), true);
  nav.closed();
  assert.equal(classes.get("revival-memory-mobile-open"), false, "Closing restores the footer and globe");
  assert.ok(patchedMain.includes('r.particles.visible=!document.documentElement.classList.contains("revival-memory-mobile-open")'));
}
// Exercise the actual transition path, including directional and reduced-motion behavior.
for (const [direction, axis, reduced, outgoing, incoming, memoryNavigation = true] of [
  [1, undefined, false, "-48px 0", "48px 0"],
  [-1, undefined, false, "48px 0", "-48px 0"],
  [1, "vertical", false, "0 -48px", "0 48px"],
  [-1, "vertical", false, "0 48px", "0 -48px"],
  [1, undefined, true, null, null],
  [1, undefined, false, null, null, false],
  [-1, "vertical", false, null, null, false],
  [1, undefined, false, null, null, null],
]) {
  const frames = [], replacements = [], requests = [], attached = [];
  const element = () => ({ appendChild(child) { attached.push(child); }, setAttribute() {}, addEventListener() {}, getBoundingClientRect: () => ({ height: 400 }) });
  const root = element(), panel = element();
  panel.animate = (keyframes) => { frames.push(keyframes); return { finished: Promise.resolve(), cancel() {} }; };
  const testWindow = {
    setTimeout, clearTimeout,
    SONGQI_SITE_SETTINGS: memoryNavigation === null ? undefined : { memoryNavigation },
    matchMedia: (query) => ({ matches: query.includes("reduced-motion") && reduced, addEventListener() {} }),
    __REVIVAL_REPLACE_MEMORY__: (post) => replacements.push(post.public_id),
  };
  runInNewContext(navigationSource, {
    window: testWindow,
    document: { documentElement: { classList: { toggle() {} } }, hidden: false, createElement: element, querySelector: (selector) => selector === ".post-2d" ? root : selector === ".post-2d-center-wrapper" ? panel : null },
    getComputedStyle: () => ({ display: "block" }), AbortController,
    fetch: async (url) => { requests.push(url); return { ok: true, json: async () => ({ data: { post: { public_id: "second-memory" } } }) }; },
  });
  testWindow.SongqiMemoryNavigation.opened({ public_id: "first-memory" });
  await testWindow.SongqiMemoryNavigation.next(direction, axis);
  if (!memoryNavigation) {
    assert.deepEqual(replacements, [], "Disabled or absent setting must prevent memory replacement");
    assert.deepEqual(requests, ["/api/v1/memories/first-memory/view"], "Views still count without random requests");
    assert.ok(!attached.some(child => child.className === "memory-navigation"), "Disabled navigation has no visible controls");
    assert.equal(frames.length, 0);
    continue;
  }
  assert.deepEqual(replacements, ["second-memory"]);
  assert.equal(frames.length, reduced ? 0 : 2);
  if (!reduced) {
    assert.equal(frames[0][1].translate, outgoing);
    assert.equal(frames[1][0].translate, incoming);
  }
}
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
assert.equal(validateUpload({ name: "Memory.livp", size: 104857600 }), "");
assert.match(validateUpload({ name: "Memory.livp", size: 104857601 }), /100 MB/);
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

let requestedSignal;
let finishRequest;
let successCalls = 0;
const ajax = runtimeFunction("localApiAjax", {
  searchFeedbackSequence: 0, showSearchFeedback: () => {},
  URL,
  AbortController,
  window: {},
  localApiUrl: (url) => url,
  appendQueryData: (url) => url,
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

// All live GET flows must reach the server without an optional dataset adapter.
for (const endpoint of ["search-posts/rain", "auto-complete-tags/rai", "related-post-count/42"]) {
  const payload = { success: true, data: { posts: [{ id: "real-memory" }] } };
  let fetchedUrl, returned;
  const liveAjax = runtimeFunction("localApiAjax", {
  searchFeedbackSequence: 0, showSearchFeedback: () => {},
    URL, AbortController, window: {},
    localApiUrl: (url) => url,
    appendQueryData: (url) => url + "?ln=en",
    parseAjaxPayload: JSON.parse,
    fetch: async (url) => {
      fetchedUrl = url;
      return { ok: true, status: 200, text: async () => JSON.stringify(payload) };
    },
  });
  const request = liveAjax({ url: "http://local/api/" + endpoint, success: (value) => { returned = value; } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fetchedUrl, "http://local/api/" + endpoint + "?ln=en");
  assert.deepEqual(returned, payload);
  assert.equal(request.status, 200);
}

let uploadFailure;
const failedUpload = runtimeFunction("localApiAjax", {
  searchFeedbackSequence: 0, showSearchFeedback: () => {},
  URL, AbortController, window: {}, uploadImageInFlight: 0,
  localApiUrl: (url) => url,
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
  "Public runtime passed: clean language URLs/history, live search/autocomplete/count requests, real request cancellation, keyboard/pinch distinction, and coalesced viewport updates",
);

// A slower previous query must not replace the newest search result.
const pendingSearches = [], shownSearches = [];
const racingSearch = runtimeFunction("localApiAjax", {
  URL, AbortController, window: {}, searchFeedbackSequence: 0,
  showSearchFeedback: () => {}, localApiUrl: url => url,
  appendQueryData: url => url, parseAjaxPayload: JSON.parse,
  fetch: () => new Promise(resolve => pendingSearches.push(resolve)),
});
racingSearch({ url: "http://local/api/search-posts/earlier", success: () => shownSearches.push("earlier") });
racingSearch({ url: "http://local/api/search-posts/latest", success: () => shownSearches.push("latest") });
pendingSearches[1]({ ok: true, status: 200, text: async () => '{"success":true,"data":{"posts":[]}}' });
await new Promise(resolve => setImmediate(resolve));
pendingSearches[0]({ ok: true, status: 200, text: async () => '{"success":true,"data":{"posts":[]}}' });
await new Promise(resolve => setImmediate(resolve));
assert.deepEqual(shownSearches, ["latest"]);
