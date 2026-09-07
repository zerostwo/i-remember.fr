import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const runtime = await readFile(new URL("../public/js/revival-runtime.js", import.meta.url), "utf8");
const legacy = await readFile(new URL("../public/js/main.js", import.meta.url), "utf8");
const runtimeContext = { window: {} };

// Execute the shipping patch and helpers, rather than reproducing the allocator.
for (const match of runtime.matchAll(/^  function (\w+)\(/gm)) {
  const end = runtime.indexOf("\n  }", match.index) + 4;
  runtimeContext[match[1]] = runInNewContext(`(${runtime.slice(match.index, end)})`, runtimeContext);
}
const patched = runtimeContext.patchLegacyMainSource(legacy);
assert.equal(typeof runtimeContext.createMemoryMapIndex, "function");
assert.equal(typeof runtimeContext.uniqueMapPosts, "function");

function moduleFactory(name, browserWindow) {
  const start = patched.indexOf(`define("${name}",`);
  const end = patched.indexOf(",define(", start + 1);
  assert.ok(start >= 0 && end > start, `Missing shipping AMD module ${name}`);
  let factory;
  runInNewContext(patched.slice(start, end), {
    window: browserWindow,
    define(_name, _dependencies, implementation) { factory = implementation; },
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

class Signal {
  listeners = [];
  add(listener) { this.listeners.push(listener); }
  dispatch(event) { for (const listener of this.listeners) listener(event); }
}

class Post {
  constructor(record) { Object.assign(this, record); }
  preloadThumb() {}
}

class Particle {
  constructor(options) {
    Object.assign(this, options);
    this.position = new Vector3();
    this.up = new Vector3();
    this.scale = new Vector3(1, 1, 1);
    this.uniforms = { fade: { value: 0 }, popScale: { value: 1 }, showScale: { value: 1 } };
  }
  changePost(post) { this.post = post; }
  lookAt() {}
  update() {}
}

const record = (id) => ({
  id,
  public_id: `m${String(id).padStart(19, "0")}`,
  text: `A real public memory ${id}`,
  status: "PUBLISHED",
  visibility: "PUBLIC",
  tags: {},
});

function createMap(records) {
  const network = [];
  const browserWindow = {
    devicePixelRatio: 1,
    DEFAULT_POSTS: { success: true, input: { tagName: "" }, data: { tagName: "", posts: records } },
    __REVIVAL_CREATE_MEMORY_MAP_INDEX__: runtimeContext.createMemoryMapIndex,
    __REVIVAL_UNIQUE_MAP_POSTS__: runtimeContext.uniqueMapPosts,
    __REVIVAL_MEMORY_SEARCH_VISIBLE__: () => browserWindow.searchVisible,
  };
  const posts = {};
  moduleFactory("postController", browserWindow)(
    posts, { POST_SEARCH_RESULT_MAX: 200 }, { ajax: (options) => network.push(options) },
    { Signal }, {}, {}, Post, {}, (text) => text.trim(),
  );
  posts.init();
  const scene = {
    cameraPosition: new Vector3(0, 100, 250),
    lookAtPosition: new Vector3(),
    cameraVector: new Vector3(0, 100, 250),
    zoom: 1,
  };
  const nav = {};
  moduleFactory("scene3d/navPostParticles", browserWindow)(
    nav,
    {
      PARTICLE_FIELD_GRID_SIZE: 1000,
      PARTICLE_FIELD_SEGMENT_SIZE: 100,
      NAV_SEARCH_ZOOM_THRESHOLD: 0.7,
      NAV_SEARCH_SIZE_MIN: 50,
      NAV_SEARCH_SIZE_MAX: 100,
      NAV_SEARCH_ITEMS_MAX: 200,
      POST_CANVAS_SIZE: 512,
    },
    Particle, posts, scene,
    // Make every candidate a valid wave point to stress a 200-slot pool with
    // only a few memories. This controls geometry, not identity assignment.
    { snoise2D: () => -0.4 },
    (ratio, from, to) => from + ratio * (to - from), { Vector3 },
  );
  nav.init({ add() {} });
  return { nav, posts, scene, network, browserWindow };
}

const initial = Array.from({ length: 4 }, (_, index) => record(index + 1));
const map = createMap([...initial, { ...initial[1], id: 99999 }, { ...initial[0] }]);
const coordinates = new Map();
function inspectFrame(expectedMaximum) {
  const active = map.nav.update();
  const visible = map.nav.particles.filter((particle) => particle.visible);
  assert.ok(active.length <= expectedMaximum, "Interactive slots must not recycle a small memory dataset");
  assert.ok(visible.length <= expectedMaximum, "Unmatched pooled meshes must not remain visibly duplicated");
  for (const particle of map.nav.particles) {
    if (!particle.visible) assert.equal(particle.interactive, false, "A hidden pooled slot must not remain interactive");
  }
  const identities = new Set();
  for (const particle of [...active, ...visible]) {
    assert.ok(particle.post?.public_id && particle.post.text);
    const id = particle.post.public_id;
    const coordinate = `${particle.gridX},${particle.gridY}`;
    if (coordinates.has(id)) assert.equal(coordinate, coordinates.get(id), "One identity must retain its original map coordinate");
    else coordinates.set(id, coordinate);
  }
  for (const particle of active) {
    assert.equal(identities.has(particle.post.public_id), false, "A memory must have only one raycast target");
    identities.add(particle.post.public_id);
    assert.equal(particle.visible, true);
  }
  return active;
}

for (let frame = 0; frame < 12; frame += 1) inspectFrame(4);
assert.equal(coordinates.size, 4, "Every available memory should be discoverable");
const homeCoordinates = new Map(coordinates);

map.scene.lookAtPosition.x = map.scene.lookAtPosition.z = 10000;
map.scene.cameraPosition.x = 10000;
map.scene.cameraPosition.z = 10250;
for (let frame = 0; frame < 5; frame += 1) {
  assert.equal(inspectFrame(4).length, 0, "Panning away must not assign the same memories to new cells");
  assert.equal(map.nav.particles.some((particle) => particle.visible), false);
}
map.scene.lookAtPosition.x = map.scene.lookAtPosition.z = map.scene.cameraPosition.x = 0;
map.scene.cameraPosition.z = 250;
for (let frame = 0; frame < 5; frame += 1) inspectFrame(4);
assert.equal(inspectFrame(4).length, 4, "Returning must restore the memories at their existing coordinates");
assert.deepEqual(coordinates, homeCoordinates);

map.posts.parseSubmittedPost(record(5));
for (let frame = 0; frame < 5; frame += 1) inspectFrame(5);
assert.equal(coordinates.size, 5, "A new submission must gain one unoccupied coordinate");
for (const [id, coordinate] of homeCoordinates) assert.equal(coordinates.get(id), coordinate);

// Run the actual search renderer as well: a search card is another presentation
// of the same memory, and must temporarily replace its map target, not clone it.
const search = {};
const finishAnimations = [];
const searchScene = {
  ...map.scene,
  lookAtTargetPosition: map.scene.lookAtPosition,
  lookAtHorizontalAngle: 0,
  resetCamera() {},
};
class Object3D {
  position = new Vector3();
  rotation = new Vector3();
}
moduleFactory("scene3d/searchPostParticles", map.browserWindow)(
  search,
  { SCENE_CAMERA_HORIZONTAL_DISTANCE: 250, SCENE_CAMERA_VERTICAL_BASE_DISTANCE: 100, POST_SEARCH_WITH_TAG_RESULT_MAX: 200 },
  Particle, {}, { uniforms: { posOffset: { value: new Vector3() }, cameraVector: { value: new Vector3() } } },
  searchScene, { onHidden: new Signal() },
  (ratio, from, to) => from + ratio * (to - from),
  (value, min, max) => Math.max(min, Math.min(max, value)),
  (value, min, max) => (value - min) / (max - min),
  { Vector3, Object3D },
  {
    killTweensOf() {},
    to(target, _duration, values) {
      Object.assign(target, values);
      if (values.onComplete) finishAnimations.push(() => values.onComplete.call({ _appliedTarget: target }));
    },
  },
);
search.init({ add() {} });
map.browserWindow.__REVIVAL_MEMORY_SEARCH_VISIBLE__ = () => search.visible;
search.show([...initial, { ...initial[1] }, { ...record(9), visibility: "PRIVATE" }, { ...record(10), text: "" }]);
assert.equal(search.particvl.filter((particle) => particle.visible).length, 4);
assert.equal(map.nav.update().length, 0, "Search must exclude duplicate background map targets");
assert.equal(map.nav.particles.some((particle) => particle.visible || particle.interactive), false);
search.hide();
while (finishAnimations.length) finishAnimations.shift()();
assert.equal(search.visible, false);
for (let frame = 0; frame < 5; frame += 1) inspectFrame(5);
for (const [id, coordinate] of homeCoordinates) assert.equal(coordinates.get(id), coordinate);

// Exercise the real controller's asynchronous pagination boundary. No response
// is resolved until navigation has completely exhausted the first unique page.
const paginated = createMap(Array.from({ length: 200 }, (_, index) => record(index + 100)));
for (let frame = 0; frame < 12; frame += 1) paginated.nav.update();
paginated.scene.lookAtPosition.x = paginated.scene.lookAtPosition.z = 10000;
paginated.scene.cameraPosition.x = 10000;
paginated.scene.cameraPosition.z = 10250;
assert.equal(paginated.nav.update().length, 0);
assert.equal(paginated.network.length, 1, "Empty cells must share the controller's in-flight request");
assert.equal(new URL(paginated.network[0].url, "http://local").searchParams.get("lastId"), "299");
paginated.network[0].success({
  success: true, input: { tagName: "" },
  data: { tagName: "", posts: [record(299), record(300), record(301)] },
});
for (let frame = 0; frame < 3; frame += 1) paginated.nav.update();
const nextPageTargets = paginated.nav.update();
assert.equal(nextPageTargets.length, 2, "Previously empty cells must accept only new identities from the next page");
assert.deepEqual(new Set(nextPageTargets.map((particle) => particle.post.id)), new Set([300, 301]));

const empty = createMap([]);
for (let frame = 0; frame < 3; frame += 1) {
  assert.equal(empty.nav.update().length, 0);
  assert.equal(empty.nav.particles.some((particle) => particle.visible), false, "Empty datasets must not render blank interactive memories");
}

console.log("Memory-map identity, pooled visibility, panning, revisit, search, pagination, and submission checks passed");
