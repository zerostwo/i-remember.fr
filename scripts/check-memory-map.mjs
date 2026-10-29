import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const runtime = await readFile(new URL("../public/js/revival-runtime.js", import.meta.url), "utf8");
const legacy = await readFile(new URL("../public/js/main.js", import.meta.url), "utf8");
const discovery = await readFile(new URL("../public/js/galaxy-discovery.js", import.meta.url), "utf8");
const helpers = {};
for (const match of runtime.matchAll(/^  function (\w+)\(/gm)) {
  const end = runtime.indexOf("\n  }", match.index) + 4;
  helpers[match[1]] = runInNewContext(`(${runtime.slice(match.index, end)})`, helpers);
}
const patched = helpers.patchLegacyMainSource(legacy);
function moduleFactory(name, browserWindow) {
  const start = patched.indexOf(`define("${name}",`), end = patched.indexOf(",define(", start + 1);
  assert.ok(start >= 0 && end > start, `Missing shipping AMD module ${name}`);
  let factory;
  runInNewContext(patched.slice(start, end), {
    window: browserWindow, define(_name, _dependencies, implementation) { factory = implementation; },
  });
  return factory;
}
class Vector3 {
  constructor(x = 0, y = 0, z = 0) { Object.assign(this, { x, y, z }); }
  copy(other) { Object.assign(this, { x: other.x, y: other.y, z: other.z }); return this; }
  sub(other) { this.x -= other.x; this.y -= other.y; this.z -= other.z; return this; }
  length() { return Math.hypot(this.x, this.y, this.z); }
  clone() { return new Vector3(this.x, this.y, this.z); }
  multiplyScalar(value) { this.x *= value; this.y *= value; this.z *= value; return this; }
  normalize() { return this.multiplyScalar(1 / (this.length() || 1)); }
}
class Signal { listeners = []; add(fn) { this.listeners.push(fn); } dispatch(event) { this.listeners.forEach(fn => fn(event)); } }
class Post { constructor(record) { Object.assign(this, record); } preloadThumb() {} }
const record = (id) => ({ id: String(id), public_id: `m${String(id).padStart(19, "0")}`, text: `A real public memory ${id}`, status: "PUBLISHED", visibility: "PUBLIC", tags: {} });
const plain = value => JSON.parse(JSON.stringify(value));
function createMap(records, withUi = false) {
  const network = [], opened = [], moves = [], nodes = [], handlers = new Map();
  let clock = 1000;
  function element() {
    const node = { children: [], style: {}, hidden: false, attributes: {},
      appendChild(child) { this.children.push(child); },
      addEventListener(type, fn) { this[type] = fn; },
      setAttribute(name, value) { this.attributes[name] = value; },
      getBoundingClientRect() { return { height: 100 }; }
    };
    nodes.push(node); return node;
  }
  const document = { body: withUi ? element() : null, createElement: element,
    querySelector: () => null, addEventListener(type, fn) { handlers.set(type, fn); } };
  const browserWindow = { devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720,
    matchMedia: () => ({ matches: browserWindow.quiet || false }),
    DEFAULT_POSTS: { success: true, input: { tagName: "" }, data: { tagName: "", posts: records } },
    __REVIVAL_UNIQUE_MAP_POSTS__: helpers.uniqueMapPosts,
    __REVIVAL_MEMORY_SEARCH_VISIBLE__: () => browserWindow.searchVisible,
  };
  runInNewContext(discovery, { window: browserWindow, document, Date: { now: () => clock }, Math });
  const galaxy = browserWindow.SongqiGalaxy;
  class Particle {
    constructor(options) {
      Object.assign(this, options); this.position = new Vector3(); this.scale = new Vector3(1, 1, 1);
      this.uniforms = Object.fromEntries(["fade", "popScale", "showScale", "pop", "u_time", "alpha"].map(key => [key, { value: key === "alpha" ? 1 : 0 }]));
    }
    changePost(post) { this.post = post; }
    lookAt() {}
    update() { this.uniforms.u_time.value += .01; }
    onClick() { opened.push(this.post.public_id); galaxy.opened(this.post); }
  }
  const posts = {};
  moduleFactory("postController", browserWindow)(posts, { POST_SEARCH_RESULT_MAX: 200 }, { ajax: options => network.push(options) }, { Signal }, {}, {}, Post, {}, text => text.trim());
  posts.init();
  const scene = { cameraPosition: new Vector3(0, 300, 500), lookAtPosition: new Vector3(), cameraVector: new Vector3(0, 300, 500),
    lookAtHorizontalAngle: 0, zoom: .6, cameraFov: 55, hasControl: true,
    disableControl() { this.hasControl = false; }, enableControl() { this.hasControl = true; },
    moveTo(options) { moves.push(options); Object.assign(this, options.controller); this.lookAtPosition.copy(options.lookAt); this.cameraPosition.copy(options.camera); if (!this.holdMove) { this.hasControl = true; options.cb(); } }
  };
  const nav = {};
  moduleFactory("scene3d/navPostParticles", browserWindow)(nav, {
    SCENE_CAMERA_HORIZONTAL_DISTANCE: 750, SCENE_CAMERA_VERTICAL_BASE_DISTANCE: 110,
    SCENE_CAMERA_VERTICAL_UP_DISTANCE: 200, SCENE_CAMERA_VERTICAL_DOWN_DISTANCE: 60,
    NAV_SEARCH_ITEMS_MAX: 200, POST_CANVAS_SIZE: 512,
  }, Particle, posts, scene, moduleFactory("utils/noiseUtils", browserWindow)());
  nav.init({ add() {} }); galaxy.enter();
  return { nav, galaxy, posts, scene, browserWindow, network, opened, moves, nodes, handlers, Particle,
    tick() { clock += 250; return nav.update(); } };
}

// Fixed vectors make an unintended placement/version change a deliberate review.
const sample = createMap([]);
const expected = { key: "42", cluster: 2, x: -134.98588883782176, z: -185.9943061906294, phase: 2.8780115166631646 };
assert.deepEqual(plain(sample.galaxy.locationFor(record(42))), expected);
assert.equal(sample.galaxy.locationFor({ ...record(42), public_id: "custom-link" }).x, expected.x);
// A completed search hides its input overlay while its 3D result scene remains
// active. The globe must still be able to restore exploration from that state.
const navModule = patched.slice(patched.indexOf('define("ui/nav",'), patched.indexOf(',define("ui/search",'));
const globeHandler = navModule.slice(navModule.indexOf("function _(e){"), navModule.indexOf("function D(){"));
let exits = 0;
runInNewContext(`(${globeHandler})`, {
  window: { __REVIVAL_MEMORY_SEARCH_VISIBLE__: () => true, __REVIVAL_EXIT_SEARCH__: () => exits++ },
  document: { documentElement: { classList: { contains: () => false } } }, r: { hasControl: false }
})({});
assert.equal(exits, 1);
const initial = Array.from({ length: 24 }, (_, i) => record(i + 1));
const map = createMap([...initial, { ...initial[1], id: "99999" }, { ...initial[0] },
  { ...record(80), visibility: "UNLISTED" }, { ...record(81), visibility: "PRIVATE" }, { ...record(82), text: "" }, { ...record(83), status: "DRAFT" }]);
assert.equal(map.nav.index.all().length, 24);
const locations = new Map(map.nav.index.all().map(({ key, x, z }) => [key, { x, z }]));
assert.ok(new Set(map.nav.index.all().map(entry => entry.cluster)).size > 4, "Memories occupy several loose clusters");
const reloaded = createMap(initial.slice().reverse());
for (const { key, x, z } of reloaded.nav.index.all()) assert.deepEqual({ x, z }, locations.get(key), "Reload and reversed pagination cannot rearrange stars");
for (const added of [record(99), record(100)]) map.posts.parseSubmittedPost(added);
for (const { key, x, z } of map.nav.index.all()) if (locations.has(key)) assert.deepEqual({ x, z }, locations.get(key));
const target = map.nav.index.all()[0];
map.scene.lookAtPosition.copy({ x: target.x, y: 0, z: target.z });
map.scene.cameraPosition.copy({ x: target.x, y: 300, z: target.z + 200 });
const positions = new Map();
function inspect() {
  const active = map.tick(), seen = new Set();
  for (const particle of active) {
    assert.ok(particle.visible && particle.interactive && particle.post.text);
    assert.ok(!seen.has(particle.mapKey)); seen.add(particle.mapKey);
    const position = plain(particle.position);
    if (positions.has(particle.mapKey)) assert.deepEqual(position, positions.get(particle.mapKey));
    else positions.set(particle.mapKey, position);
  }
  for (const particle of map.nav.particles) if (!particle.visible) assert.equal(particle.interactive, false);
  return active;
}
for (let frame = 0; frame < 5; frame++) inspect();
assert.ok(positions.size > 0);
const home = plain(map.scene.lookAtPosition);
map.scene.lookAtPosition.x = map.scene.lookAtPosition.z = 10000;
assert.equal(inspect().length, 0, "Empty space cannot recycle real memories or emit phantom targets");
map.scene.lookAtPosition.copy(home);
assert.ok(inspect().length > 0, "Returning restores the same coordinates");
map.browserWindow.searchVisible = true;
assert.equal(inspect().length, 0, "Search temporarily replaces the background memory targets");
assert.ok(map.nav.particles.every(particle => !particle.visible && !particle.interactive));
map.browserWindow.searchVisible = false;
assert.ok(inspect().length > 0);

// Execute the original 3D search renderer with the explicit exit hook. Exiting
// during an unfinished animation must release every pooled search target.
const search = {}, searchBackground = { time: 0, uniforms: { posOffset: { value: new Vector3() }, cameraVector: { value: new Vector3() } } };
class Object3D { position = new Vector3(); rotation = new Vector3(); }
moduleFactory("scene3d/searchPostParticles", map.browserWindow)(
  search, { SCENE_CAMERA_HORIZONTAL_DISTANCE: 750, SCENE_CAMERA_VERTICAL_BASE_DISTANCE: 110, POST_SEARCH_WITH_TAG_RESULT_MAX: 200 },
  map.Particle, {}, searchBackground,
  { ...map.scene, lookAtTargetPosition: map.scene.lookAtPosition, resetCamera() {} }, { onHidden: new Signal() },
  (ratio, from, to) => from + ratio * (to - from), (value, min, max) => Math.max(min, Math.min(max, value)),
  (value, min, max) => (value - min) / (max - min), { Vector3, Object3D },
  { killTweensOf() {}, to(target, _duration, values) { Object.assign(target, values); } },
);
search.init({ add() {} });
map.browserWindow.__REVIVAL_MEMORY_SEARCH_VISIBLE__ = () => search.visible;
search.show(initial.slice(0, 3));
assert.equal(search.visible, true); assert.equal(inspect().length, 0);
search.exit();
assert.equal(search.visible, false); assert.equal(searchBackground.time, 0);
assert.ok(search.particvl.every(particle => !particle.visible));
assert.ok(inspect().length > 0, "An explicit search exit restores the fixed map immediately");
search.show(initial.slice(3, 5));
assert.equal(search.particvl.filter(particle => particle.visible).length, 2, "The search pool remains reusable after exit");
search.exit(); inspect();
const beforeQuiet = map.nav.particles.filter(particle => particle.visible).map(particle => particle.uniforms.u_time.value);
map.browserWindow.quiet = true; inspect();
assert.deepEqual(map.nav.particles.filter(particle => particle.visible).map(particle => particle.uniforms.u_time.value), beforeQuiet, "Reduced motion stops beacon breathing");
assert.equal(map.network.length, 0, "Panning alone must not crawl the full archive");

// Pagination changes available records only. Arrival order cannot choose locations.
const paginated = createMap(Array.from({ length: 200 }, (_, i) => record(i + 100)));
const firstLocations = new Map(paginated.nav.index.all().map(entry => [entry.key, plain(entry)]));
paginated.posts.loadMorePosts(); paginated.posts.loadMorePosts();
assert.equal(paginated.network.length, 1, "One bounded request may be in flight");
paginated.network[0].success({ success: true, input: { tagName: "" }, data: { tagName: "", posts: [record(299), record(300), record(301)] } });
assert.equal(paginated.nav.index.all().length, 202);
for (const entry of paginated.nav.index.all()) {
  if (firstLocations.has(entry.key)) assert.deepEqual(plain(entry), firstLocations.get(entry.key));
  else assert.deepEqual(plain(paginated.galaxy.locationFor(entry.post)), plain(sample.galaxy.locationFor(entry.post)));
}
const empty = createMap([]); for (let i = 0; i < 3; i++) assert.equal(empty.tick().length, 0);

// The UI guide moves the existing camera, then waits for an actual user open.
const guided = createMap(initial.slice(0, 6), true);
guided.tick();
assert.equal(guided.moves.length, 1, "Entry frames a few memories once");
assert.deepEqual(guided.opened, []);
const find = guided.nodes.find(node => node.className === "galaxy-discovery-find");
const open = guided.nodes.find(node => node.className === "galaxy-discovery-open");
guided.tick(); find.click(); guided.tick();
assert.equal(guided.moves.length, 2);
assert.equal(open.hidden, false);
assert.deepEqual(guided.opened, [], "Guiding must not open/count a memory");
const selected = open.attributes["data-memory-id"];
open.click(); guided.tick();
assert.deepEqual(guided.opened, [selected]);
assert.ok(guided.nav.particles.every(particle => !particle.visible));
guided.galaxy.closed(); guided.tick(); find.click(); guided.tick();
assert.notEqual(open.attributes["data-memory-id"], selected, "Prefer a nearby unread memory");
guided.browserWindow.quiet = true; find.click(); guided.tick();
assert.equal(guided.moves.at(-1).duration, 0, "Reduced motion jumps directly to the coordinate");
const movesBefore = guided.moves.length;
guided.handlers.get("pointerdown")({ type: "pointerdown", target: { closest: () => ({}) } }); guided.tick();
assert.equal(open.hidden, true, "Manual exploration dismisses the highlighted-memory action");
assert.equal(guided.moves.length, movesBefore, "The camera never pulls the visitor back");
guided.scene.holdMove = true;
find.click(); guided.tick();
assert.equal(find.disabled, true);
guided.handlers.get("pointerdown")({ type: "pointerdown", target: { closest: () => ({}) } }); guided.tick();
assert.equal(guided.scene.hasControl, true, "A pointer-down immediately interrupts a flight");
assert.equal(find.disabled, false);
find.click(); guided.tick();
guided.browserWindow.searchVisible = true; guided.tick();
guided.scene.enableControl(); guided.browserWindow.searchVisible = false; guided.tick();
assert.equal(find.disabled, false, "Search must not leave a cancelled flight stuck busy");
find.click(); guided.tick(); guided.galaxy.leave(); guided.scene.enableControl(); guided.galaxy.enter(); guided.tick();
assert.equal(find.disabled, false, "Returning from submission must restore guidance even if it interrupted a flight");

// Ten thousand independent identities remain unique without order-dependent collision resolution.
const many = Array.from({ length: 10000 }, (_, i) => sample.galaxy.locationFor(record(i + 10000)));
assert.equal(new Set(many.map(entry => `${entry.x}:${entry.z}`)).size, many.length);
assert.ok(many.every(entry => Number.isFinite(entry.x) && Number.isFinite(entry.z)));
console.log("Galaxy passed: stable world positions, rename/reload/pagination invariance, clusters, unique targets, search, bounded loading, guidance, touch-sized markers and reduced motion");
