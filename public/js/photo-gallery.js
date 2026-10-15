(function () {
  "use strict";
  var MAX_PHOTOS = 10;
  var state = { steps: null, input: null, photos: [], selected: 0, busy: false, images: new Map(), editor: null };
  var currentMemory = [];
  var memoryIndex = 0;
  var viewer;
  var card;
  var clamp = function (value, low, high) { return Math.max(low, Math.min(high, value)); };
  function label(en, fr, zh) {
    var language = window.LANG || "en";
    return language === "fr" ? fr : language === "zh" ? zh : en;
  }
  function button(text, name, action) {
    var element = document.createElement("button");
    element.type = "button";
    element.__skipPreventDefault = true;
    element.textContent = text;
    element.setAttribute("aria-label", name);
    element.addEventListener("click", function (event) { event.stopPropagation(); action(); });
    return element;
  }
  function fullUrl(fileId) { return "/uploads/posts/" + encodeURIComponent(fileId) + "/full.jpg"; }
  function loadImage(url) {
    if (!state.images.has(url)) state.images.set(url, new Promise(function (resolve, reject) {
      var image = new Image();
      image.onload = function () { resolve(image); };
      image.onerror = function () { state.images.delete(url); reject(new Error(label("Photo could not be loaded. Please try again.", "La photo n’a pas pu être chargée.", "照片加载失败，请重试。"))); };
      image.src = url;
    }));
    return state.images.get(url);
  }
  function cropBounds(width, height, crop) {
    var size = Math.min(width, height) / crop.zoom;
    return { size: size, left: clamp(crop.x * width - size / 2, 0, width - size), top: clamp(crop.y * height - size / 2, 0, height - size) };
  }
  function error(message) {
    if (state.input) state.input.showErrorMsgs(message);
  }
  function sync() {
    state.steps.data.photos = state.photos.map(function (photo) { return { fileId: photo.fileId, crop: Object.assign({}, photo.crop) }; });
    state.steps.data.fileId = state.photos[0] && state.photos[0].fileId;
  }
  async function uploadFiles(files, append) {
    var list = Array.from(files || []);
    if (!list.length || state.busy || !state.steps) return;
    var existing = append ? state.photos.slice() : [];
    var previousCount = existing.length;
    if (existing.length + list.length > MAX_PHOTOS) return error(label("Choose up to 10 photos per memory.", "Choisissez jusqu’à 10 photos par souvenir.", "每条回忆最多添加 10 张照片。"));
    for (var file of list) {
      var problem = window.__REVIVAL_UPLOAD_ERROR__(file);
      if (problem) return error(problem);
    }
    state.busy = true;
    state.photos = existing;
    var status = document.createElement("div");
    status.className = "photo-upload-status";
    status.setAttribute("role", "status");
    document.querySelector(".add-steps").appendChild(status);
    if (state.editor) state.editor.setBusy(true);
    state.input.lock("upload-image");
    var failure;
    try {
      for (var index = 0; index < list.length; index++) {
        status.textContent = label("Uploading", "Envoi", "正在上传") + " " + (index + 1) + " / " + list.length;
        var form = new FormData();
        form.set("local", list[index]);
        var response = await fetch("/api/upload-image", { method: "POST", body: form, credentials: "same-origin" });
        var payload = await response.json();
        if (!response.ok || !payload.success) throw new Error(payload.errorMsg || "Upload failed. Please try again.");
        state.photos.push({ fileId: payload.data.fileId, crop: { x: 0.5, y: 0.5, zoom: 1 } });
      }
    } catch (err) { failure = err.message; }
    finally {
      state.busy = false;
      status.remove();
      state.input.unlock("upload-image");
      if (state.editor) state.editor.setBusy(false);
    }
    if (state.photos.length) {
      state.selected = Math.min(previousCount, state.photos.length - 1);
      sync();
      state.steps.goToStep("adjustment");
      if (state.editor) state.editor.refresh();
    }
    if (failure) error(failure);
  }
  function createAdjustmentStep(steps, input, circle, tween) {
    state.steps = steps;
    state.input = input;
    var root, viewport, preview, range, strip, count, remove, add, picker, reset, activeImage;
    var active = false;
    var confirming = false;
    var pointers = new Map();
    var sorting = null, suppressThumbClickUntil = 0;
    function reorder(from, to) {
      if (state.busy || from === to || to < 0 || to >= state.photos.length) return;
      var selectedPhoto = selected();
      state.photos.splice(to, 0, state.photos.splice(from, 1)[0]);
      state.selected = state.photos.indexOf(selectedPhoto);
      sync();
      refresh();
      strip.children[to].focus({ preventScroll: true });
    }
    function endSort(event) {
      if (!sorting || (event && event.pointerId !== sorting.pointerId)) return;
      var drag = sorting;
      sorting = null;
      strip.classList.remove("is-sorting");
      drag.thumb.style.transform = "";
      drag.thumb.classList.remove("is-dragging");
      strip.querySelectorAll(".is-drop-target").forEach(function (element) { element.classList.remove("is-drop-target"); });
      if (drag.thumb.hasPointerCapture(drag.pointerId)) drag.thumb.releasePointerCapture(drag.pointerId);
      if (drag.moved) {
        suppressThumbClickUntil = Date.now() + 500;
        if (event && event.type === "pointerup") reorder(drag.from, drag.to);
      }
    }
    function selected() { return state.photos[state.selected]; }
    function normalize() {
      if (!activeImage || !selected()) return;
      var crop = selected().crop;
      var bounds = cropBounds(activeImage.naturalWidth, activeImage.naturalHeight, crop);
      crop.x = (bounds.left + bounds.size / 2) / activeImage.naturalWidth;
      crop.y = (bounds.top + bounds.size / 2) / activeImage.naturalHeight;
    }
    function draw() {
      if (!activeImage || !selected()) return;
      normalize();
      var bounds = cropBounds(activeImage.naturalWidth, activeImage.naturalHeight, selected().crop);
      preview.style.width = (activeImage.naturalWidth / bounds.size * 100) + "%";
      preview.style.height = (activeImage.naturalHeight / bounds.size * 100) + "%";
      preview.style.left = (-bounds.left / bounds.size * 100) + "%";
      preview.style.top = (-bounds.top / bounds.size * 100) + "%";
      range.value = selected().crop.zoom;
      range.setAttribute("aria-valuetext", Number(selected().crop.zoom).toFixed(1) + "×");
      sync();
    }
    function zoom(value) {
      if (!selected() || !activeImage || state.busy) return;
      selected().crop.zoom = clamp(value, 1, 4);
      draw();
    }
    async function refresh() {
      if (!active || !selected()) return;
      var photo = selected();
      activeImage = null;
      preview.removeAttribute("src");
      strip.replaceChildren();
      state.photos.forEach(function (entry, index) {
        var thumb = button("", label("Edit photo", "Modifier la photo", "编辑照片") + " " + (index + 1), function () { if (Date.now() < suppressThumbClickUntil || state.busy) return; state.selected = index; refresh(); });
        thumb.dataset.index = index;
        thumb.title = label("Drag to reorder · Alt + arrow keys", "Glisser pour réordonner · Alt + flèches", "拖拽排序 · Alt + 方向键");
        thumb.disabled = state.busy;
        thumb.addEventListener("keydown", function (event) {
          if (event.altKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
            event.preventDefault(); reorder(index, index + (event.key === "ArrowLeft" ? -1 : 1));
          }
        });
        var image = document.createElement("img");
        image.src = fullUrl(entry.fileId);
        image.alt = "";
        thumb.setAttribute("aria-pressed", String(index === state.selected));
        thumb.appendChild(image);
        strip.appendChild(thumb);
      });
      count.textContent = (state.selected + 1) + " / " + state.photos.length;
      remove.disabled = state.photos.length <= 1 || state.busy;
      add.disabled = state.photos.length >= MAX_PHOTOS || state.busy;
      try {
        var image = await loadImage(fullUrl(photo.fileId));
        if (selected() !== photo || !active) return;
        activeImage = image;
        preview.src = image.src;
        draw();
      } catch (err) { error(err.message); }
    }
    function setBusy(busy) {
      if (!root) return;
      root.querySelectorAll("button,input").forEach(function (element) { element.disabled = busy; });
      if (busy) steps.disableValidateBtn(); else { steps.enableValidateBtn(); if (active) refresh(); }
    }
    async function confirm() {
      if (state.busy || confirming || !state.photos.length) return;
      confirming = true;
      sync();
      steps.disableValidateBtn();
      try {
        var first = state.photos[0];
        var image = await loadImage(fullUrl(first.fileId));
        var bounds = cropBounds(image.naturalWidth, image.naturalHeight, first.crop);
        circle.ctx.clearRect(0, 0, circle.SIZE, circle.SIZE);
        circle.ctx.drawImage(image, bounds.left, bounds.top, bounds.size, bounds.size, 0, 0, circle.SIZE, circle.SIZE);
        circle.uniforms.texture.value.needsUpdate = true;
        tween.to(circle.uniforms.fade, 0, { value: 1 });
        tween.fromTo(circle.uniforms.animation, 0.35, { value: 0 }, { value: 1, ease: "linear" });
        steps.goToStep("message");
      } catch (err) { error(err.message); steps.enableValidateBtn(); }
      finally { confirming = false; }
    }
    function init() {
      root = document.querySelector(".add-steps-adjustment");
      root.classList.add("photo-editor");
      viewport = document.createElement("div");
      viewport.className = "photo-crop-viewport";
      preview = document.createElement("img"); preview.alt = ""; preview.draggable = false;
      viewport.appendChild(preview);
      viewport.tabIndex = 0;
      viewport.setAttribute("aria-label", label("Photo crop. Drag to move; use arrow keys to adjust.", "Cadrage. Faites glisser ou utilisez les flèches.", "照片裁切。拖拽或使用方向键调整。"));
      root.appendChild(viewport);
      var controls = document.createElement("div"); controls.className = "photo-zoom-controls";
      range = document.createElement("input"); range.type = "range"; range.min = "1"; range.max = "4"; range.step = "0.01"; range.value = "1";
      range.setAttribute("aria-label", label("Photo zoom", "Zoom photo", "照片缩放"));
      range.addEventListener("input", function () { zoom(Number(range.value)); });
      controls.append(button("−", label("Zoom out", "Réduire", "缩小"), function () { zoom(selected().crop.zoom - 0.1); }), range,
        button("+", label("Zoom in", "Agrandir", "放大"), function () { zoom(selected().crop.zoom + 0.1); }));
      root.appendChild(controls);
      strip = document.createElement("div"); strip.className = "photo-edit-strip"; root.appendChild(strip);
      strip.setAttribute("aria-label", label("Photos. Drag to reorder, or use Alt and arrow keys.", "Photos. Glissez ou utilisez Alt et les flèches pour réordonner.", "照片。拖拽或使用 Alt 加方向键排序。"));
      strip.addEventListener("pointerdown", function (event) {
        var thumb = event.target.closest("button[data-index]");
        if (!thumb || state.busy || event.button !== 0) return;
        endSort();
        sorting = { pointerId: event.pointerId, from: Number(thumb.dataset.index), to: Number(thumb.dataset.index), x: event.clientX, y: event.clientY, thumb: thumb, moved: false };
        thumb.setPointerCapture(event.pointerId);
      });
      strip.addEventListener("pointermove", function (event) {
        if (!sorting || sorting.pointerId !== event.pointerId) return;
        var dx = event.clientX - sorting.x, dy = event.clientY - sorting.y;
        if (!sorting.moved && Math.hypot(dx, dy) < 6) return;
        sorting.moved = true;
        event.preventDefault();
        strip.classList.add("is-sorting");
        sorting.thumb.classList.add("is-dragging");
        sorting.thumb.style.transform = "translate(" + dx + "px," + dy + "px)";
        var closest = sorting.from, distance = Infinity;
        Array.from(strip.children).forEach(function (thumb, index) {
          // Offset boxes are unaffected by the dragged thumbnail's transform.
          var bounds = strip.getBoundingClientRect();
          var delta = Math.hypot(event.clientX - bounds.left - thumb.offsetLeft - thumb.offsetWidth / 2,
            event.clientY - bounds.top - thumb.offsetTop - thumb.offsetHeight / 2);
          if (delta < distance) { closest = index; distance = delta; }
        });
        sorting.to = closest;
        Array.from(strip.children).forEach(function (thumb, index) { thumb.classList.toggle("is-drop-target", index === closest && index !== sorting.from); });
      });
      ["pointerup", "pointercancel", "lostpointercapture"].forEach(function (type) { strip.addEventListener(type, endSort); });
      var actions = document.createElement("div"); actions.className = "photo-edit-actions";
      count = document.createElement("span"); count.setAttribute("aria-live", "polite");
      picker = document.createElement("input"); picker.type = "file"; picker.multiple = true; picker.accept = "image/jpeg,image/png,image/webp,image/gif"; picker.hidden = true;
      picker.addEventListener("change", function () { uploadFiles(picker.files, true); picker.value = ""; });
      add = button("+", label("Add photos", "Ajouter des photos", "添加照片"), function () { picker.click(); });
      remove = button("×", label("Remove photo", "Retirer la photo", "移除照片"), function () { if (state.photos.length <= 1) return; state.photos.splice(state.selected, 1); state.selected = Math.min(state.selected, state.photos.length - 1); sync(); refresh(); });
      reset = button("↺", label("Reset crop", "Réinitialiser le cadrage", "重置裁切"), function () { selected().crop = { x: 0.5, y: 0.5, zoom: 1 }; draw(); });
      actions.append(count, add, remove, reset, picker); root.appendChild(actions);
      ["mousedown", "touchstart", "touchmove", "touchend"].forEach(function (type) { root.addEventListener(type, function (event) { event.stopPropagation(); }, { passive: true }); });
      root.addEventListener("keydown", function (event) { event.stopPropagation(); });
      viewport.addEventListener("pointerdown", function (event) { if (!activeImage || state.busy) return; event.preventDefault(); event.stopPropagation(); viewport.setPointerCapture(event.pointerId); pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); });
      viewport.addEventListener("pointermove", function (event) {
        if (!pointers.has(event.pointerId) || !activeImage || !selected()) return;
        event.preventDefault(); event.stopPropagation();
        var before = Array.from(pointers.values());
        var old = pointers.get(event.pointerId);
        var crop = selected().crop;
        if (pointers.size === 1) {
          var size = cropBounds(activeImage.naturalWidth, activeImage.naturalHeight, crop).size;
          var scale = size / viewport.getBoundingClientRect().width;
          crop.x -= (event.clientX - old.x) * scale / activeImage.naturalWidth;
          crop.y -= (event.clientY - old.y) * scale / activeImage.naturalHeight;
        }
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pointers.size === 2) {
          var after = Array.from(pointers.values());
          var oldDistance = Math.hypot(before[0].x - before[1].x, before[0].y - before[1].y);
          var newDistance = Math.hypot(after[0].x - after[1].x, after[0].y - after[1].y);
          if (oldDistance > 1) crop.zoom = clamp(crop.zoom * newDistance / oldDistance, 1, 4);
        }
        draw();
      });
      ["pointerup", "pointercancel", "lostpointercapture"].forEach(function (type) { viewport.addEventListener(type, function (event) { pointers.delete(event.pointerId); }); });
      viewport.addEventListener("wheel", function (event) { event.preventDefault(); event.stopPropagation(); zoom(selected().crop.zoom * Math.exp(-event.deltaY * 0.002)); }, { passive: false });
      viewport.addEventListener("keydown", function (event) {
        if (!selected() || !activeImage) return;
        if (/^Arrow/.test(event.key)) { event.preventDefault(); var crop = selected().crop; var delta = 0.025 / crop.zoom; if (event.key === "ArrowLeft") crop.x -= delta; if (event.key === "ArrowRight") crop.x += delta; if (event.key === "ArrowUp") crop.y -= delta; if (event.key === "ArrowDown") crop.y += delta; draw(); }
        if (event.key === "+" || event.key === "=") { event.preventDefault(); zoom(selected().crop.zoom + 0.1); }
        if (event.key === "-") { event.preventDefault(); zoom(selected().crop.zoom - 0.1); }
      });
      function bindStepAction(selector, action) {
        var element = document.querySelector(selector);
        var startedInEditor = false;
        element.addEventListener("pointerdown", function () { startedInEditor = active; }, true);
        element.addEventListener("click", function (event) {
          if (!active || state.busy || (event.detail !== 0 && !startedInEditor)) return;
          startedInEditor = false;
          event.preventDefault(); event.stopImmediatePropagation(); action();
        }, true);
      }
      bindStepAction(".add-steps-validate-btn", confirm);
      bindStepAction(".add-steps-back-btn", function () { steps.goToStep("upload-methods"); });
      var cancel = button("×", label("Cancel memory", "Annuler le souvenir", "取消添加回忆"), function () { if (!state.busy && !confirming) steps.hide(); });
      cancel.className = "photo-draft-cancel";
      document.querySelector(".add-steps").appendChild(cancel);
      var originalShow = steps.show;
      steps.show = function () { state.photos = []; state.selected = 0; state.steps.data.photos = []; state.steps.data.fileId = null; state.images.clear(); return originalShow.apply(this, arguments); };
      state.editor = { refresh: refresh, setBusy: setBusy };
    }
    function show() {
      // Remote-provider single uploads still enter the same crop editor.
      if (!state.photos.length && steps.data.fileId) state.photos = [{ fileId: steps.data.fileId, crop: { x: 0.5, y: 0.5, zoom: 1 } }];
      active = true; root.style.display = "block"; root.style.opacity = "1";
      document.querySelector(".add-steps").classList.add("photo-adjusting");
      steps.enableBackBtn(); steps.enableValidateBtn();
      steps.showBackBtn(function () { steps.goToStep("upload-methods"); });
      steps.showValidateBtn(confirm); refresh();
    }
    function hide() { active = false; endSort(); pointers.clear(); root.style.display = "none"; document.querySelector(".add-steps").classList.remove("photo-adjusting"); }
    return { id: "adjustment", animationIndex: 3, indicatorIndex: 0, init: init, show: show, hide: hide, render: function () {} };
  }
  function safeImageUrl(value) {
    try { var url = new URL(value, location.origin); return /^(https?:)$/.test(url.protocol) ? url.href : ""; } catch (_) { return ""; }
  }
  function installViewer() {
    if (card) return;
    card = document.querySelector(".post-2d-img"); if (!card) return;
    card.setAttribute("role", "button"); card.tabIndex = 0;
    card.__skipPreventDefault = true;
    card.setAttribute("aria-label", label("Open photo", "Ouvrir la photo", "打开照片"));
    var count = document.createElement("span"); count.className = "photo-gallery-count";
    var previous = button("‹", label("Previous photo", "Photo précédente", "上一张照片"), function () { move(-1); });
    var next = button("›", label("Next photo", "Photo suivante", "下一张照片"), function () { move(1); });
    previous.className = "photo-gallery-prev"; next.className = "photo-gallery-next";
    // Controls are siblings of the photo button, not nested interactive elements.
    var controls = document.createElement("div"); controls.className = "photo-gallery-controls"; controls.append(previous, count, next); card.parentNode.appendChild(controls);
    viewer = document.createElement("dialog"); viewer.className = "revival-photo-viewer";
    viewer.tabIndex = -1;
    viewer.setAttribute("aria-label", label("Memory photos", "Photos du souvenir", "回忆照片"));
    var image = document.createElement("img");
    var close = button("×", label("Close photo", "Fermer la photo", "关闭照片"), function () { viewer.close(); });
    close.className = "photo-viewer-close";
    var fullPrevious = button("‹", previous.getAttribute("aria-label"), function () { move(-1); });
    var fullNext = button("›", next.getAttribute("aria-label"), function () { move(1); });
    fullPrevious.className = "photo-gallery-prev"; fullNext.className = "photo-gallery-next";
    viewer.append(close, image, fullPrevious, fullNext); document.body.appendChild(viewer);
    // Keep native touch clicks and photo gestures out of the galaxy input controller.
    ["touchstart", "touchmove", "touchend", "mousedown", "mouseup", "wheel"].forEach(function (type) {
      viewer.addEventListener(type, function (event) { event.stopPropagation(); }, { passive: true });
    });
    function render() {
      var photo = currentMemory[memoryIndex];
      controls.hidden = currentMemory.length < 2;
      fullPrevious.hidden = fullNext.hidden = currentMemory.length < 2;
      if (!photo) return;
      card.style.backgroundImage = 'url("' + photo.image_url.replace(/"/g, "%22") + '")';
      count.textContent = (memoryIndex + 1) + " / " + currentMemory.length;
      count.setAttribute("aria-label", label("Photo", "Photo", "照片") + " " + count.textContent);
      if (viewer.open) { image.src = photo.full_image_url; image.alt = label("Memory photo", "Photo du souvenir", "回忆照片") + " " + (memoryIndex + 1); }
    }
    function move(delta) { if (currentMemory.length < 2) return; memoryIndex = (memoryIndex + delta + currentMemory.length) % currentMemory.length; render(); }
    function open(event) {
      if (event.type === "keydown" && event.key !== "Enter" && event.key !== " ") return;
      if (!currentMemory.length) return;
      event.preventDefault(); event.stopPropagation(); viewer.showModal(); render(); viewer.focus({ preventScroll: true });
    }
    card.addEventListener("click", open); card.addEventListener("keydown", open);
    viewer.addEventListener("keydown", function (event) { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); move(event.key === "ArrowLeft" ? -1 : 1); } event.stopPropagation(); });
    viewer.addEventListener("close", function () { image.removeAttribute("src"); card.focus({ preventScroll: true }); });
    viewer.addEventListener("click", function (event) { if (event.target === viewer) viewer.close(); });
    function swipe(element) {
      var start;
      element.addEventListener("touchstart", function (event) { start = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null; }, { passive: true });
      element.addEventListener("touchend", function (event) { if (!start || !event.changedTouches.length) return; var point = event.changedTouches[0]; var dx = point.clientX - start.x; var dy = point.clientY - start.y; start = null; if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) { event.preventDefault(); move(dx > 0 ? -1 : 1); } }, { passive: false });
    }
    swipe(card); swipe(image);
    window.SongqiPhotos.renderMemory = render;
  }
  function showMemory(post) {
    installViewer();
    var photos = post.photos && post.photos.length ? post.photos : [{ image_url: post.image_url, full_image_url: post.full_image_url || post.image_url }];
    currentMemory = photos.slice(0, MAX_PHOTOS).map(function (photo) { return { image_url: safeImageUrl(photo.image_url), full_image_url: safeImageUrl(photo.full_image_url || photo.image_url) }; }).filter(function (photo) { return photo.image_url && photo.full_image_url; });
    memoryIndex = 0;
    if (window.SongqiPhotos.renderMemory) window.SongqiPhotos.renderMemory();
  }
  window.SongqiPhotos = { uploadFiles: uploadFiles, createAdjustmentStep: createAdjustmentStep, installViewer: installViewer, showMemory: showMemory, cropBounds: cropBounds };
}());
