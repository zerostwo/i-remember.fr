(function () {
  "use strict";

  // Version 1 is a world-coordinate contract. Never seed it with array order,
  // collection size, public URL, camera position or Math.random(). The API's
  // immutable mapId is carried by the archive Post.id, including after a rename.
  function identity(post) {
    return String(post.map_id || post.mapId || post.id || post.uid || post.public_id || "");
  }
  function hash(text) {
    var value = 2166136261;
    for (var i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
    value ^= value >>> 16;
    value = Math.imul(value, 2246822507);
    value ^= value >>> 13;
    value = Math.imul(value, 3266489909);
    return (value ^ value >>> 16) >>> 0;
  }
  function locationFor(post) {
    var key = identity(post);
    var unit = function (salt) { return (hash("galaxy-v1:" + salt + ":" + key) + .5) / 4294967296; };
    var cluster = Math.floor(unit("cluster") * 12);
    // Three loose spiral arms, with progressively rarer outer groups. As the
    // archive grows it reaches more of this fixed world without moving old stars.
    var tier = Math.min(5, Math.floor(-Math.log(1 - unit("tier")) * .55));
    var turn = Math.floor(cluster / 3);
    var angle = cluster % 3 * Math.PI * 2 / 3 + turn * .58 + tier * .36;
    var radius = 240 + turn * 180 + tier * 900;
    var spread = 100 + tier * 35;
    var offsetAngle = unit("angle") * Math.PI * 2;
    var offsetRadius = Math.sqrt(unit("radius")) * spread;
    return {
      key: key, cluster: cluster + tier * 12,
      x: Math.cos(angle) * radius + Math.cos(offsetAngle) * offsetRadius,
      z: Math.sin(angle) * radius + Math.sin(offsetAngle) * offsetRadius,
      phase: unit("phase") * Math.PI * 2
    };
  }
  function createIndex(getPosts) {
    var previous, length = -1, entries = [], cells = new Map();
    function sync() {
      var posts = getPosts() || [];
      if (posts === previous && posts.length === length) return;
      previous = posts; length = posts.length;
      var unique = window.__REVIVAL_UNIQUE_MAP_POSTS__(posts), seen = new Set();
      entries = []; cells = new Map();
      unique.forEach(function (post) {
        var key = identity(post);
        if (!key || seen.has(key)) return;
        seen.add(key);
        var entry = Object.assign(locationFor(post), { post: post });
        entries.push(entry);
        var cell = Math.floor(entry.x / 250) + ":" + Math.floor(entry.z / 250);
        if (!cells.has(cell)) cells.set(cell, []);
        cells.get(cell).push(entry);
      });
    }
    return {
      all: function () { sync(); return entries; },
      near: function (x, z, radius, limit) {
        sync();
        var found = [], radiusSquared = radius * radius;
        for (var gx = Math.floor((x - radius) / 250); gx <= Math.floor((x + radius) / 250); gx++) {
          for (var gz = Math.floor((z - radius) / 250); gz <= Math.floor((z + radius) / 250); gz++) {
            (cells.get(gx + ":" + gz) || []).forEach(function (entry) {
              if ((entry.x - x) ** 2 + (entry.z - z) ** 2 <= radiusSquared) found.push(entry);
            });
          }
        }
        return found.sort(function (a, b) {
          return (a.x - x) ** 2 + (a.z - z) ** 2 - (b.x - x) ** 2 - (b.z - z) ** 2 || a.key.localeCompare(b.key);
        }).slice(0, limit);
      }
    };
  }
  function homeFrame(entries, aspect) {
    if (!entries.length) return null;
    aspect = aspect || 1;
    var anchor = nearest(entries, { x: 0, z: 0 }, new Set());
    var nearby = entries.slice().sort(function (a, b) {
      return (a.x - anchor.x) ** 2 + (a.z - anchor.z) ** 2 - (b.x - anchor.x) ** 2 - (b.z - anchor.z) ** 2 || a.key.localeCompare(b.key);
    }).filter(function (entry) {
      // A sparse archive may have only one record in a region. Frame that real
      // record comfortably instead of cropping two distant ones at phone edges.
      return Math.hypot(entry.x - anchor.x, entry.z - anchor.z) < 900 * Math.min(1, Math.max(.3, aspect));
    }).slice(0, aspect < .8 ? 2 : 3);
    var x = 0, z = 0;
    nearby.forEach(function (entry) { x += entry.x / nearby.length; z += entry.z / nearby.length; });
    var radius = Math.max.apply(null, nearby.map(function (entry) { return Math.hypot(entry.x - x, entry.z - z); }));
    return { x: x, z: z, zoom: Math.max(.08, Math.min(.65, .72 - radius / (850 * Math.max(.35, Math.min(1, aspect))))) };
  }
  function nearest(entries, point, excluded) {
    var result = null, distance = Infinity;
    entries.forEach(function (entry) {
      if (excluded.has(entry.key)) return;
      var next = (entry.x - point.x) ** 2 + (entry.z - point.z) ** 2;
      if (next < distance || next === distance && entry.key < result.key) { result = entry; distance = next; }
    });
    return result;
  }

  var navigation, exploring = false, cardOpen = false, homeShown = false;
  var viewed = new Set(), guided = new Set(), selected = null, moving = false;
  var guide, findButton, openButton, status, pending = null, lastUi = 0;
  function copy(en, fr, zh) { return window.LANG === "fr" ? fr : window.LANG === "zh" ? zh : en; }
  function reducedMotion() { return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
  function searchable() {
    return (document.documentElement && (document.documentElement.classList.contains("revival-search-open") || document.documentElement.classList.contains("revival-modal-open"))) ||
      (window.__REVIVAL_MEMORY_SEARCH_VISIBLE__ && window.__REVIVAL_MEMORY_SEARCH_VISIBLE__());
  }
  function ensureGuide() {
    if (guide || !document.body) return;
    guide = document.createElement("div"); guide.className = "galaxy-discovery-guide"; guide.hidden = true;
    openButton = document.createElement("button"); openButton.type = "button"; openButton.className = "galaxy-discovery-open"; openButton.hidden = true;
    openButton.addEventListener("click", function () {
      if (!selected || !navigation || !navigation.scene.hasControl || cardOpen || searchable()) return;
      var particle = navigation.particles.find(function (item) { return item.visible && item.mapKey === selected.key; });
      if (particle) particle.onClick();
    });
    findButton = document.createElement("button"); findButton.type = "button";
    findButton.className = "galaxy-discovery-find";
    findButton.addEventListener("click", findMemory);
    status = document.createElement("span"); status.className = "galaxy-discovery-status";
    status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
    guide.appendChild(openButton); guide.appendChild(findButton); guide.appendChild(status);
    document.body.appendChild(guide);
    // Yield immediately to real exploration. An unrequested camera animation
    // never follows the visitor or pulls them back into a populated region.
    document.addEventListener("pointerdown", interrupt, true);
    document.addEventListener("touchstart", interrupt, { capture: true, passive: true });
    document.addEventListener("wheel", interrupt, { capture: true, passive: true });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" || /^(w|a|s|d|ArrowUp|ArrowDown|ArrowLeft|ArrowRight)$/.test(event.key)) interrupt(event);
    }, true);
  }
  function interrupt(event) {
    if (!navigation || !exploring || cardOpen || searchable()) return;
    if (event.type !== "keydown" && !(event.target.closest && event.target.closest(".base-3d-container,.nav-map-btn,.nav-map-wrapper"))) return;
    if (moving) navigation.scene.enableControl();
    moving = false; selected = null; pending = null;
    if (status) status.textContent = "";
  }
  function moveTo(frame, entry) {
    var scene = navigation.scene, config = navigation.config;
    var angle = scene.lookAtHorizontalAngle || 0, zoom = frame.zoom;
    var horizontal = (1 - zoom) * (config.SCENE_CAMERA_HORIZONTAL_DISTANCE - 5) + 5;
    var base = config.SCENE_CAMERA_VERTICAL_BASE_DISTANCE;
    moving = true; selected = entry || null;
    scene.disableControl();
    scene.moveTo({
      duration: reducedMotion() ? 0 : 1.8, lockControl: true, hasControl: true,
      controller: { zoom: zoom, targetZoom: zoom, blurBlendRatio: 1, cameraSwingRadius: .6 },
      camera: { x: frame.x - Math.sin(angle) * horizontal,
        y: base + Math.pow(zoom, .15) * config.SCENE_CAMERA_VERTICAL_UP_DISTANCE - Math.pow(zoom, 40) * config.SCENE_CAMERA_VERTICAL_DOWN_DISTANCE,
        z: frame.z + Math.cos(angle) * horizontal },
      lookAt: { x: frame.x, y: (1 - zoom) * base, z: frame.z },
      cb: function () { moving = false; if (status) status.textContent = ""; }
    });
  }
  function focusEntry(entry) {
    if (!entry) return;
    guided.add(entry.key);
    moveTo({ x: entry.x, z: entry.z, zoom: .72 }, entry);
  }
  function findMemory() {
    if (!navigation || moving || pending || cardOpen || searchable()) return;
    var entries = navigation.index.all(), point = navigation.scene.lookAtPosition;
    var excluded = new Set(Array.from(viewed).concat(Array.from(guided)));
    var entry = nearest(entries, point, excluded);
    if (entry) { focusEntry(entry); return; }
    if (!navigation.posts.isTagNamePostsRetrievedAll[""]) {
      pending = { count: entries.length, time: Date.now() };
      navigation.posts.loadMorePosts();
      if (status) status.textContent = copy("Looking a little further…", "Un peu plus loin…", "再向远处找一找…");
      return;
    }
    guided.clear();
    entry = nearest(entries, point, viewed) || nearest(entries, point, new Set(selected ? [selected.key] : [])) || entries[0];
    if (entry) focusEntry(entry);
  }
  function updateUi() {
    if (!navigation || Date.now() - lastUi < 200) return;
    lastUi = Date.now();
    ensureGuide();
    if (!guide) return;
    var entries = navigation.index.all(), scene = navigation.scene;
    var active = exploring && !cardOpen && !searchable();
    guide.hidden = !active || !entries.length;
    if (!active) { pending = null; moving = false; selected = null; return; }
    if (!homeShown && entries.length) { homeShown = true; moveTo(homeFrame(entries, window.innerWidth / window.innerHeight)); }
    if (pending) {
      if (entries.length > pending.count || navigation.posts.isTagNamePostsRetrievedAll[""]) { pending = null; findMemory(); }
      else if (Date.now() - pending.time > 8000) {
        pending = null;
        status.textContent = copy("Could not look further. Try again.", "Réessayez dans un instant.", "暂时无法加载更多，请重试。");
      }
    }
    var footer = document.querySelector(".footer");
    guide.style.bottom = ((footer ? footer.getBoundingClientRect().height : 140) + 12) + "px";
    findButton.textContent = copy("Find a memory", "Trouver un souvenir", "找一段回忆");
    findButton.disabled = moving || !!pending || !scene.hasControl;
    openButton.textContent = copy("Open this memory", "Ouvrir ce souvenir", "打开这段回忆");
    openButton.hidden = !selected || moving || !scene.hasControl;
    if (selected) openButton.setAttribute("data-memory-id", selected.post.public_id || "");
  }

  function createNavigation(exports, config, PostParticle, posts, scene, noise) {
    var index = createIndex(function () { return posts.tagNamedPosts[""] || []; });
    var particles = exports.particles = [], lastEntries, candidates = [], cameraCell = "";
    exports.index = index;
    exports.init = function (world) {
      for (var i = 0; i < config.NAV_SEARCH_ITEMS_MAX; i++) {
        var particle = new PostParticle({ type: "nav", visible: false, interactive: false });
        particle.uniforms.discovery = { type: "f", value: 1 };
        particle.uniforms.popScale.value = 2.4;
        particles.push(particle); world.add(particle);
      }
      navigation = { index: index, particles: particles, scene: scene, config: config, posts: posts };
    };
    exports.update = function () {
      updateUi();
      var entries = index.all(), camera = scene.cameraPosition, center = scene.lookAtPosition;
      var active = exploring && !cardOpen && !searchable();
      var radius = scene.zoom < .25 ? 2200 : scene.zoom < .65 ? 1600 : 1000;
      var cell = Math.floor(center.x / 100) + ":" + Math.floor(center.z / 100) + ":" + radius;
      if (entries !== lastEntries || cell !== cameraCell) {
        candidates = index.near(center.x, center.z, radius, particles.length);
        cameraCell = cell; lastEntries = entries;
      }
      var wanted = new Set(active ? candidates.map(function (entry) { return entry.key; }) : []);
      var slots = new Map(), free = [], result = [], quiet = reducedMotion();
      particles.forEach(function (particle) {
        if (wanted.has(particle.mapKey)) slots.set(particle.mapKey, particle);
        else { particle.visible = particle.interactive = false; particle.uniforms.fade.value = 0; free.push(particle); }
      });
      if (!active) return result;
      candidates.forEach(function (entry) {
        var particle = slots.get(entry.key) || free.pop();
        if (!particle) return;
        if (particle.mapKey !== entry.key || particle.post !== entry.post) {
          particle.mapKey = entry.key;
          particle.changePost(entry.post);
          particle.uniforms.pop.value = 0;
          particle.uniforms.u_time.value = entry.phase;
        }
        particle.position.x = entry.x; particle.position.z = entry.z;
        particle.position.y = noise.snoise2D(entry.x * .0013 + 4, entry.z * .0013 + 4) * -40 +
          noise.snoise2D(entry.x * .0006 + 32, entry.z * .0006 + 32) * -90;
        var distance = Math.hypot(entry.x - camera.x, particle.position.y - camera.y, entry.z - camera.z);
        // A 44px plane is a forgiving tap target. Its fine halo occupies only
        // part of that plane; the original thumbnail bloom remains on hover.
        var pixels = window.innerWidth <= 760 ? 48 : 42;
        var diameter = 2 * distance * Math.tan((scene.cameraFov || 60) * Math.PI / 360) * pixels / Math.max(320, window.innerHeight || 720);
        particle.scale.x = particle.scale.y = particle.scale.z = diameter / config.POST_CANVAS_SIZE;
        particle.visible = particle.interactive = true;
        particle.uniforms.fade.value += (1 - particle.uniforms.fade.value) * (quiet ? 1 : .12);
        particle.uniforms.alpha.value = 1;
        particle.lookAt(camera);
        var time = particle.uniforms.u_time.value;
        particle.update();
        if (quiet) particle.uniforms.u_time.value = time;
        particle.renderDepth = distance;
        result.push(particle);
      });
      return result.sort(function (a, b) { return a.renderDepth - b.renderDepth; });
    };
    return exports;
  }

  window.SongqiGalaxy = {
    locationFor: locationFor, createIndex: createIndex, homeFrame: homeFrame, nearest: nearest,
    createNavigation: createNavigation,
    enter: function () { exploring = true; },
    leave: function () { exploring = false; selected = null; pending = null; moving = false; if (guide) guide.hidden = true; },
    opened: function (post) { viewed.add(identity(post)); cardOpen = true; selected = null; if (guide) guide.hidden = true; },
    closed: function () { cardOpen = false; }
  };
}());
