(function () {
  "use strict";
  var current = "", recent = [], busy = false, sequence = 0, controller, animation;
  var root, panel, buttons = [], status;
  function copy(en, fr, zh) { return window.LANG === "fr" ? fr : window.LANG === "zh" ? zh : en; }
  function swipeDirection(dx, dy, elapsed) {
    return elapsed < 1200 && Math.abs(dy) >= 65 && Math.abs(dy) > Math.abs(dx) * 1.5 ? (dy < 0 ? 1 : -1) : 0;
  }
  function available() {
    return current && root && root.getBoundingClientRect().height && getComputedStyle(root).display !== "none" &&
      !document.querySelector("dialog[open],.revival-menu-memory.is-visible") && !document.hidden;
  }
  function setBusy(value) { busy = value; buttons.forEach(function (button) { button.disabled = value; }); }
  function cancel() {
    sequence++;
    if (controller) controller.abort();
    if (animation) animation.cancel();
    setBusy(false);
  }
  async function transition(frames, duration) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !panel.animate) return;
    animation = panel.animate(frames, { duration: duration, easing: "ease-out", fill: "forwards" });
    await animation.finished;
  }
  async function next(direction) {
    if (busy || !available()) return;
    setBusy(true);
    status.textContent = "";
    var request = ++sequence, from = current;
    controller = new AbortController();
    var timeout = window.setTimeout(function () { controller.abort(); }, 10000);
    try {
      var response = await fetch("/api/random-memory?current=" + encodeURIComponent(from) + "&seen=" + encodeURIComponent(recent.join(",")), { signal: controller.signal, cache: "no-store" });
      if (!response.ok) throw new Error("request failed");
      var payload = await response.json();
      var post = payload.data && payload.data.post;
      if (request !== sequence || current !== from || !available()) return;
      if (!post) { status.textContent = copy("No other memories yet.", "Aucun autre souvenir pour le moment.", "暂时没有其他回忆。"); return; }
      if (post.public_id === from) return;
      // Load the next preview before fading the current card away.
      if (post.image_url) await new Promise(function (resolve) {
        var image = new Image(), timer = window.setTimeout(resolve, 3000);
        image.onload = image.onerror = function () { window.clearTimeout(timer); resolve(); };
        image.src = post.image_url;
      });
      if (request !== sequence || current !== from || !available()) return;
      await transition([{ opacity: 1, translate: "0 0" }, { opacity: 0, translate: "0 " + (-direction * 35) + "px" }], 170);
      if (request !== sequence || current !== from || !available()) return;
      if (animation) animation.cancel();
      window.__REVIVAL_REPLACE_MEMORY__(post);
      panel.scrollTop = 0;
      await transition([{ opacity: 0, translate: "0 " + (direction * 35) + "px" }, { opacity: 1, translate: "0 0" }], 260);
    } catch (error) {
      if (request === sequence && error.name !== "AbortError") status.textContent = copy("Could not load another memory. Try again.", "Impossible de charger un autre souvenir. Réessayez.", "无法加载其他回忆，请重试。");
      else if (request === sequence && busy) status.textContent = copy("Loading timed out. Try again.", "Le chargement a expiré. Réessayez.", "加载超时，请重试。");
    } finally {
      window.clearTimeout(timeout);
      if (request === sequence) { if (animation) animation.cancel(); setBusy(false); }
    }
  }
  function install() {
    if (root) return;
    root = document.querySelector(".post-2d");
    panel = document.querySelector(".post-2d-center-wrapper");
    if (!root || !panel) { root = null; return; }
    var controls = document.createElement("div"); controls.className = "memory-navigation";
    [-1, 1].forEach(function (direction) {
      var button = document.createElement("button"); button.type = "button";
      button.className = direction < 0 ? "memory-navigation-prev" : "memory-navigation-next";
      button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + (direction < 0 ? 'M14 6l-6 6 6 6' : 'M10 6l6 6-6 6') + '"/></svg>';
      button.setAttribute("aria-label", direction < 0 ? copy("Previous random memory", "Souvenir aléatoire précédent", "上一条随机回忆") : copy("Next random memory", "Souvenir aléatoire suivant", "下一条随机回忆"));
      button.__skipPreventDefault = true;
      button.addEventListener("click", function (event) { event.stopPropagation(); next(direction); });
      buttons.push(button); controls.appendChild(button);
    });
    status = document.createElement("span"); status.className = "memory-navigation-status"; status.setAttribute("role", "status");
    controls.appendChild(status); panel.appendChild(controls);
    var start, suppressClickUntil = 0;
    function begin(x, y, target) {
      if (!available() || busy || target.closest("button,a,input,[contenteditable=true],.circle-btn,.revival-memory-explore")) return null;
      // Let longer text scroll normally; swipe on the photo or card background.
      if (target.closest(".post-2d-content-wrapper")) return null;
      return { x: x, y: y, time: Date.now() };
    }
    function finish(x, y, event) {
      if (!start) return;
      var direction = swipeDirection(x - start.x, y - start.y, Date.now() - start.time); start = null;
      if (direction) { event.preventDefault(); event.stopPropagation(); suppressClickUntil = Date.now() + 500; next(direction); }
    }
    root.addEventListener("touchstart", function (event) { start = event.touches.length === 1 ? begin(event.touches[0].clientX, event.touches[0].clientY, event.target) : null; }, { passive: true });
    root.addEventListener("touchmove", function (event) { if (event.touches.length !== 1) { start = null; return; } if (start && swipeDirection(event.touches[0].clientX - start.x, event.touches[0].clientY - start.y, Date.now() - start.time)) event.preventDefault(); }, { passive: false });
    root.addEventListener("touchend", function (event) { if (event.changedTouches.length) finish(event.changedTouches[0].clientX, event.changedTouches[0].clientY, event); }, { passive: false });
    root.addEventListener("touchcancel", function () { start = null; });
    root.addEventListener("pointerdown", function (event) { if (event.pointerType === "mouse" && event.button === 0) start = begin(event.clientX, event.clientY, event.target); });
    root.addEventListener("pointerup", function (event) { if (event.pointerType === "mouse") finish(event.clientX, event.clientY, event); });
    root.addEventListener("pointercancel", function () { start = null; });
    root.addEventListener("click", function (event) { if (Date.now() < suppressClickUntil) { event.preventDefault(); event.stopImmediatePropagation(); } }, true);
    root.addEventListener("keydown", function (event) {
      if (!available() || event.target.closest("input,textarea,[contenteditable=true]")) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); next(event.key === "ArrowDown" ? 1 : -1); }
    });
  }
  function opened(post) {
    var id = post.public_id || post.publicId;
    if (!/^[A-Za-z][A-Za-z0-9-]{3,31}$/.test(id || "")) return;
    install();
    if (id === current) return;
    current = id;
    recent = recent.filter(function (value) { return value !== id; }).concat(id).slice(-50);
    if (status) status.textContent = "";
    // Count displayed memory opens, never prefetches or individual photo changes.
    fetch("/api/v1/memories/" + encodeURIComponent(id) + "/view", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", keepalive: true }).catch(function () {});
  }
  function closed() { cancel(); current = ""; if (status) status.textContent = ""; }
  window.SongqiMemoryNavigation = { opened: opened, closed: closed, next: next, swipeDirection: swipeDirection };
}());
