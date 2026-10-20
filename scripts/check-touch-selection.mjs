import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const runtime = await readFile(new URL("../public/js/revival-runtime.js", import.meta.url), "utf8");
const original = await readFile(new URL("../public/js/main.js", import.meta.url), "utf8");
function runtimeFunction(name, context = {}) {
  const start = runtime.indexOf(`  function ${name}(`);
  const end = runtime.indexOf("\n  function ", start + 1);
  return runInNewContext(`(${runtime.slice(start, end).trim()})`, context);
}
const patched = runtimeFunction("patchLegacyMainSource")(original);

// Execute the shipping input controller, scene callbacks and touch picker together.
// No render frame or mousemove is allowed between touchstart and touchend.
function harness(main) {
  let clock = 1000;
  class Clock extends Date { constructor() { super(clock); } static now() { return clock; } }
  class Signal { listeners = []; add(fn) { this.listeners.push(fn); } dispatch(e) { this.listeners.forEach(fn => fn(e)); } }
  class Vector3 { constructor(x, y, z) { Object.assign(this, { x, y, z }); } sub() { return this; } normalize() { return this; } }
  const listeners = new Map(), opened = [], zooms = [], picks = [];
  const document = { documentElement: {}, addEventListener(type, fn) { listeners.set(type, fn); } };
  const window = { ontouchstart: null, addEventListener() {}, __REVIVAL_BIND_INPUT__: runtimeFunction("bindLegacyInput", { Date: Clock, Math }), __REVIVAL_PICK_TOUCH_MEMORY__: runtimeFunction("pickTouchMemory") };
  let inputFactory;
  const start = main.indexOf('define("inputController",');
  const end = main.indexOf(',define(', start + 1);
  runInNewContext(main.slice(start, end), { window, document, Date: Clock, Math, define(_name, _deps, factory) { inputFactory = factory; } });
  const input = inputFactory({}, { Signal }, (items, fn) => items.forEach(fn), (items, fn) => items.every(fn), (items, item) => items.includes(item));
  function particle(id, x, y) {
    return { visible: true, interactive: true, post: { public_id: id }, x, y,
      uniforms: { fade: { value: 1 }, alpha: { value: 1 } },
      onOut() {}, onClick() { opened.push(id); } };
  }
  const stale = particle("stale-hover", 20, 20), target = particle("tapped-memory", 150, 250);
  let ray;
  const scene = { e: { hasControl: true, canInteractiveWithPost: true, zoom: 0, targetZoom: 0 },
    window, K: false, B: 390, j: 844, F: 195, wt: 0, Et: 0, tt: 0, nt: 0,
    bt: stale, revivalTouchPosts: [stale, target], b: { Vector3 }, it: { position: {} },
    at: { unprojectVector() {} }, ft: { set(_origin, point) { ray = point; }, intersectObject(p) {
      picks.push(p.post.public_id);
      return Math.abs((ray.x + 1) * 195 - p.x) < 10 && Math.abs((1 - ray.y) * 422 - p.y) < 10 ? [{ object: p, distance: 1 }] : [];
    } }, y: (n, lo, hi) => Math.max(lo, Math.min(hi, n)) };
  const sceneSource = main.slice(main.indexOf('define("scene3dController",'));
  const callback = (name, next) => runInNewContext(`(${sceneSource.slice(sceneSource.indexOf(`function ${name}(`), sceneSource.indexOf(`function ${next}(`, sceneSource.indexOf(`function ${name}(`)))})`, scene);
  const root = { nodeName: "DIV", closest: selector => selector === ".base-3d-container" ? root : null };
  input.add(root, "down", callback("Mt", "_t"));
  input.onMove.add(callback("_t", "Dt"));
  input.onUp.add(callback("Dt", "Pt"));
  root.__wheel = value => zooms.push(value);
  const contact = (x, y) => ({ pageX: x, pageY: y, target: root });
  function send(type, points, changed = [150, 250], elapsed = 0) {
    clock += elapsed;
    listeners.get(type)({ type, target: root, touches: points.map(p => contact(...p)), changedTouches: [contact(...changed)], cancelable: true, preventDefault() {} });
  }
  function tap(x = 150, y = 250, duration = 70) { send("touchstart", [[x, y]]); send("touchend", [], [x, y], duration); }
  return { input, scene, target, stale, opened, picks, zooms, send, tap, listeners };
}
const broken = harness(original);
broken.tap();
assert.deepEqual(broken.opened, ["stale-hover"], "Reproduce the original stale-hover touch selection");
const fresh = harness(patched);
fresh.tap();
assert.deepEqual(fresh.opened, ["tapped-memory"], "A fast first tap opens its own memory without hover or a render frame");
assert.equal(fresh.scene.bt, null);
const empty = harness(patched);
empty.tap(300, 400);
assert.deepEqual(empty.opened, [], "An empty-sky tap cannot open the previous hovered memory");
for (const property of ["visible", "interactive"]) {
  const h = harness(patched); h.target[property] = false; h.tap();
  assert.deepEqual(h.opened, [], `${property}=false excludes recycled particles`);
}
for (const uniform of ["fade", "alpha"]) {
  const h = harness(patched); h.target.uniforms[uniform].value = 0; h.tap();
  assert.deepEqual(h.opened, [], "Invisible particles cannot capture a tap");
}
const jitter = harness(patched);
jitter.send("touchstart", [[150, 250]]);
jitter.send("touchmove", [[154, 254]], [154, 254], 30);
jitter.send("touchend", [], [154, 254], 40);
assert.deepEqual(jitter.opened, ["tapped-memory"], "Small finger jitter remains a tap");
const drag = harness(patched);
drag.send("touchstart", [[150, 250]]);
drag.send("touchmove", [[220, 300]], [220, 300], 50);
drag.send("touchmove", [[150, 250]], [150, 250], 50);
drag.send("touchend", [], [150, 250], 50);
assert.deepEqual(drag.opened, [], "Dragging back to the start must not become a tap");
assert.equal(drag.input.lastUpTime, 0);
drag.tap();
assert.deepEqual(drag.opened, ["tapped-memory"], "A fresh tap works immediately after a drag");
const pinch = harness(patched);
pinch.send("touchstart", [[150, 250]]);
pinch.send("touchstart", [[150, 250], [250, 250]], [250, 250], 10);
pinch.send("touchmove", [[130, 250], [280, 250]], [280, 250], 30);
pinch.send("touchend", [[130, 250]], [280, 250], 30);
pinch.send("touchend", [], [130, 250], 30);
assert.deepEqual(pinch.opened, []);
assert.ok(pinch.zooms.length);
pinch.tap();
assert.deepEqual(pinch.opened, ["tapped-memory"], "Lifting pinch fingers separately does not poison the next tap");
const cancelled = harness(patched);
cancelled.send("touchstart", [[150, 250]]);
cancelled.send("touchcancel", [], [150, 250], 50);
assert.deepEqual(cancelled.opened, []);
const backgroundDouble = harness(patched);
backgroundDouble.tap(300, 400); backgroundDouble.tap(300, 400);
assert.equal(backgroundDouble.scene.e.targetZoom, 0.2, "Double-tapping empty sky still zooms");
const separated = harness(patched);
separated.tap(300, 400); separated.tap(250, 500);
assert.equal(separated.scene.e.targetZoom, 0, "Two quick taps far apart are not a double tap");
const desktop = harness(patched);
const mouse = { target: { nodeName: "CANVAS" }, pageX: 10, pageY: 10, preventDefault() {} };
desktop.listeners.get("mousedown")({ ...mouse, type: "mousedown" });
desktop.listeners.get("mouseup")({ ...mouse, type: "mouseup" });
assert.deepEqual(desktop.opened, ["stale-hover"], "Desktop keeps the established hover selection path");
console.log("Touch selection passed: immediate hit testing, stale/hidden targets, jitter, drag-return, pinch, cancellation, double-tap and mouse behavior");
