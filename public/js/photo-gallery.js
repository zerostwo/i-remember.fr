(function () {
  "use strict";
  var MAX_UPLOAD_PHOTOS = 6;
  var MAX_VIEW_PHOTOS = 10;
  var state = { steps: null, input: null, photos: [], selected: 0, busy: false, images: new Map(), editor: null, ring: null };
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
    if (existing.length + list.length > MAX_UPLOAD_PHOTOS) return error(label("Choose up to 6 photos, videos or audio files per memory.", "Choisissez jusqu’à 6 photos, vidéos ou fichiers audio par souvenir.", "每条回忆最多添加 6 项照片、视频或音频。"));
    for (var file of list) {
      var problem = window.__REVIVAL_UPLOAD_ERROR__(file);
      if (problem) return error(problem);
    }
    state.busy = true;
    state.photos = existing;
    state.steps.goToStep("upload-methods");
    var status = document.createElement("div");
    status.className = "photo-upload-status";
    var caption = document.createElement("div");
    caption.className = "photo-upload-caption";
    var track = document.createElement("progress");
    track.max = 100;
    track.setAttribute("aria-label", label("Upload progress", "Progression", "上传进度"));
    var percentage = document.createElement("div");
    percentage.className = "photo-upload-percent";
    var detail = document.createElement("div");
    detail.className = "photo-upload-detail";
    caption.setAttribute("role", "status");
    status.append(percentage, caption, track, detail);
    function showProgress(progress) {
      var uploading = progress.phase === "uploading";
      var phase = uploading ? label("Uploading", "Envoi", "正在上传")
        : progress.phase === "complete" ? label("Ready", "Prêt", "已就绪")
        : progress.stage === "transcoding" ? label("Processing media", "Traitement du fichier", "正在转码")
        : progress.stage === "finishing" ? label("Finishing…", "Finalisation…", "正在完成…")
        : label("Preparing…", "Préparation…", "正在处理…");
      caption.textContent = phase;
      percentage.textContent = progress.percent == null ? "…" : progress.percent + "%";
      if (state.ring) {
        state.ring.uniforms.uploadActive.value = 1;
        state.ring.uniforms.uploadProgress.value = progress.percent == null ? -1 : progress.percent / 100;
      }
      if (progress.percent == null) track.removeAttribute("value");
      else track.value = progress.percent;
      track.setAttribute("aria-label", phase);
      detail.textContent = (index + 1) + " / " + list.length + " · " + (uploading && progress.total
        ? (progress.loaded / 1048576).toFixed(1) + " / " + (progress.total / 1048576).toFixed(1) + " MB"
        : progress.phase === "processing" ? label("Upload complete", "Envoi terminé", "上传完成") : label("Ready", "Prêt", "已就绪"));
    }
    document.querySelector(".add-steps").appendChild(status);
    if (state.editor) state.editor.setBusy(true);
    state.input.lock("upload-image");
    var failure;
    try {
      for (var index = 0; index < list.length; index++) {
        var file = list[index];
        showProgress({ phase: "uploading", percent: 0, loaded: 0, total: file.size });
        var form = new FormData();
        form.set("local", file);
        var isVideo = /^video\//.test(file.type) || /\.(mp4|mov|webm|m4v)$/i.test(file.name);
        var payload;
        if (isVideo || window.songqiMedia.isAudioFile(file)) {
          payload = { data: await window.songqiVideoUpload(file, { onProgress: showProgress }) };
        } else {
          payload = await window.songqiUploadRequest("/api/upload-image", {
            body: form,
            onProgress: function (fraction) { showProgress({ phase: "uploading", percent: Math.floor(fraction * 100), loaded: fraction * file.size, total: file.size }); },
            onUploaded: function () { showProgress({ phase: "processing", percent: null }); }
          });
        }
        state.photos.push({ fileId: payload.data.fileId, type: payload.data.type || "image/jpeg", crop: { x: 0.5, y: 0.5, zoom: 1 } });
      }
    } catch (err) { failure = err.message; }
    finally {
      state.busy = false;
      status.remove();
      if (state.ring) state.ring.uniforms.uploadActive.value = 0;
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
  function createAdjustmentStep(steps, input, circle, tween, ring) {
    state.steps = steps;
    state.input = input;
    var root, viewport, preview, range, strip, controls, add, picker, activeImage;
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
      strip.children[to].querySelector("button[data-index]").focus({ preventScroll: true });
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
      if (!selected() || /^audio\//.test(selected().type) || !activeImage || state.busy) return;
      selected().crop.zoom = clamp(value, 1, 4);
      draw();
    }
    async function refresh() {
      if (!active) return;
      var photo = selected();
      activeImage = null;
      preview.removeAttribute("src");
      preview.hidden = !photo;
      controls.hidden = !photo || /^audio\//.test(photo.type);
      viewport.classList.toggle("is-empty", !photo);
      viewport.tabIndex = photo && /^audio\//.test(photo.type) ? -1 : 0;
      viewport.setAttribute("aria-label", photo && /^audio\//.test(photo.type) ? label("Audio cover", "Couverture audio", "音频封面") : label("Photo crop. Drag to move; use arrow keys to adjust.", "Cadrage. Faites glisser ou utilisez les flèches.", "照片裁切。拖拽或使用方向键调整。"));
      if (photo && !state.busy) steps.enableValidateBtn(); else steps.disableValidateBtn();
      strip.replaceChildren();
      state.photos.forEach(function (entry, index) {
        var item = document.createElement("div"); item.className = "photo-thumb";
        var thumb = button("", label("Edit cover", "Modifier la couverture", "编辑封面") + " " + (index + 1), function () { if (Date.now() < suppressThumbClickUntil || state.busy) return; state.selected = index; refresh(); });
        thumb.className = "photo-thumb-select";
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
        image.alt = ""; image.draggable = false;
        thumb.setAttribute("aria-pressed", String(index === state.selected));
        thumb.appendChild(image);
        if (/^video\//.test(entry.type)) { var badge = document.createElement("span"); badge.className = "media-video-badge"; badge.textContent = "▶"; thumb.appendChild(badge); }
        var remove = button("×", label("Remove item", "Retirer cet élément", "移除项目") + " " + (index + 1), function () {
          if (state.busy) return;
          var current = selected();
          state.photos.splice(index, 1);
          state.selected = current === entry ? Math.min(index, state.photos.length - 1) : state.photos.indexOf(current);
          state.selected = Math.max(0, state.selected);
          sync(); refresh();
          var next = strip.querySelector("button[data-index='" + state.selected + "']") || add;
          next.focus({ preventScroll: true });
        });
        remove.className = "photo-thumb-remove"; remove.disabled = state.busy;
        item.append(thumb, remove); strip.appendChild(item);
      });
      add.disabled = state.busy;
      if (state.photos.length < MAX_UPLOAD_PHOTOS) strip.appendChild(add);
      if (!photo) return;
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
      if (busy || !state.photos.length) steps.disableValidateBtn();
      if (!busy && active) refresh();
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
      // Keep the original particle geometry and movement; illuminate its existing
      // circumference clockwise using measured transfer / transcode progress.
      state.ring = ring;
      ring.uniforms.uploadActive = { type: "f", value: 0 };
      ring.uniforms.uploadProgress = { type: "f", value: 0 };
      ring.uniforms.uploadReducedMotion = { type: "f", value: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 1 : 0 };
      ring.material.vertexShader = "uniform float uploadActive;\nuniform float uploadProgress;\nuniform float uploadReducedMotion;\n" + ring.material.vertexShader.replace("vec4 modelViewPos =", [
        "float uploadAngle = mod(atan(pos.x, pos.y) + PI * 2.0, PI * 2.0) / (PI * 2.0);",
        // Measure distance around the circle so both arc ends feather through
        // twelve o'clock without a straight seam or changing the particles.
        "float uploadArc = uploadProgress < 0.0 ? .16 : clamp(uploadProgress, 0.0, 1.0);",
        "float uploadCenter = uploadArc * .5 + (uploadProgress < 0.0 ? time * .15 * (1.0 - uploadReducedMotion) : 0.0);",
        "float uploadDistance = abs(fract(uploadAngle - uploadCenter + .5) - .5);",
        "float uploadFeather = .035;",
        "float uploadLit = 1.0 - smoothstep(uploadArc * .5 - uploadFeather, uploadArc * .5 + uploadFeather, uploadDistance);",
        "if (uploadProgress == 0.0) uploadLit = 0.0;",
        "if (uploadProgress >= 1.0) uploadLit = 1.0;",
        "pAlpha *= mix(1.0, .14 + uploadLit * 1.06, uploadActive);",
        "vec4 modelViewPos ="
      ].join("\n"));
      ring.material.needsUpdate = true;
      root = document.querySelector(".add-steps-adjustment");
      root.classList.add("photo-editor");
      viewport = document.createElement("div");
      viewport.className = "photo-crop-viewport";
      preview = document.createElement("img"); preview.alt = ""; preview.draggable = false;
      viewport.appendChild(preview);
      viewport.tabIndex = 0;
      viewport.setAttribute("aria-label", label("Photo crop. Drag to move; use arrow keys to adjust.", "Cadrage. Faites glisser ou utilisez les flèches.", "照片裁切。拖拽或使用方向键调整。"));
      root.appendChild(viewport);
      controls = document.createElement("div"); controls.className = "photo-zoom-controls";
      range = document.createElement("input"); range.type = "range"; range.min = "1"; range.max = "4"; range.step = "0.01"; range.value = "1";
      range.setAttribute("aria-label", label("Photo zoom", "Zoom photo", "照片缩放"));
      range.addEventListener("input", function () { zoom(Number(range.value)); });
      controls.append(button("−", label("Zoom out", "Réduire", "缩小"), function () { if (selected()) zoom(selected().crop.zoom - 0.1); }), range,
        button("+", label("Zoom in", "Agrandir", "放大"), function () { if (selected()) zoom(selected().crop.zoom + 0.1); }));
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
        Array.from(strip.querySelectorAll(".photo-thumb")).forEach(function (thumb, index) {
          // Offset boxes are unaffected by the dragged thumbnail's transform.
          var bounds = strip.getBoundingClientRect();
          var delta = Math.hypot(event.clientX - bounds.left - thumb.offsetLeft - thumb.offsetWidth / 2,
            event.clientY - bounds.top - thumb.offsetTop - thumb.offsetHeight / 2);
          if (delta < distance) { closest = index; distance = delta; }
        });
        sorting.to = closest;
        Array.from(strip.querySelectorAll(".photo-thumb")).forEach(function (thumb, index) { thumb.classList.toggle("is-drop-target", index === closest && index !== sorting.from); });
      });
      ["pointerup", "pointercancel", "lostpointercapture"].forEach(function (type) { strip.addEventListener(type, endSort); });
      picker = document.createElement("input"); picker.type = "file"; picker.multiple = true; picker.accept = window.songqiMedia.accept; picker.hidden = true;
      picker.addEventListener("change", function () { uploadFiles(picker.files, true); picker.value = ""; });
      add = button("+", label("Add photos, videos or audio", "Ajouter des photos, vidéos ou audio", "添加照片、视频或音频"), function () { picker.click(); });
      add.className = "photo-add";
      root.appendChild(picker);
      ["mousedown", "touchstart", "touchmove", "touchend"].forEach(function (type) { root.addEventListener(type, function (event) { event.stopPropagation(); }, { passive: true }); });
      root.addEventListener("keydown", function (event) { event.stopPropagation(); });
      viewport.addEventListener("pointerdown", function (event) { if (!activeImage || state.busy || /^audio\//.test(selected()?.type)) return; event.preventDefault(); event.stopPropagation(); viewport.setPointerCapture(event.pointerId); pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); });
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
      viewport.addEventListener("wheel", function (event) { event.preventDefault(); event.stopPropagation(); if (selected()) zoom(selected().crop.zoom * Math.exp(-event.deltaY * 0.002)); }, { passive: false });
      viewport.addEventListener("keydown", function (event) {
        if (!selected() || !activeImage) return;
        if (/^Arrow/.test(event.key)) { event.preventDefault(); var crop = selected().crop; var delta = 0.025 / crop.zoom; if (event.key === "ArrowLeft") crop.x -= delta; if (event.key === "ArrowRight") crop.x += delta; if (event.key === "ArrowUp") crop.y -= delta; if (event.key === "ArrowDown") crop.y += delta; draw(); }
        if (event.key === "+" || event.key === "=") { event.preventDefault(); if (selected()) zoom(selected().crop.zoom + 0.1); }
        if (event.key === "-") { event.preventDefault(); if (selected()) zoom(selected().crop.zoom - 0.1); }
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
  function icon(element, path) {
    // Only fixed, local icon paths enter this markup.
    element.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + path + '"/></svg>';
  }
  function createVideoPlayer(video) {
    var isAudio = video.tagName === "AUDIO";
    var root = document.createElement("div"); root.className = "memory-player"; root.hidden = true;
    var controls = document.createElement("div"); controls.className = "memory-player-controls";
    controls.setAttribute("role", "group"); controls.setAttribute("aria-label", label("Playback controls", "Commandes de lecture", "播放控制"));
    var seek = document.createElement("input"); seek.type = "range"; seek.min = "0"; seek.max = "0"; seek.step = "0.1"; seek.value = "0"; seek.disabled = true; seek.className = "memory-player-seek";
    seek.setAttribute("aria-label", label("Seek", "Position de lecture", "播放进度"));
    seek.__skipPreventDefault = true;
    var row = document.createElement("div"); row.className = "memory-player-row";
    function toggle() { if (video.paused) { if (video.preparePlayback) video.preparePlayback(); video.play().catch(function () {}); } else video.pause(); }
    var toggleButton = button("", "", toggle);
    var time = document.createElement("span"); time.className = "memory-player-time";
    var mute = button("", "", function () { video.muted = !video.muted; });
    var volume = document.createElement("input"); volume.type = "range"; volume.min = "0"; volume.max = "1"; volume.step = "0.05"; volume.value = "1"; volume.className = "memory-player-volume"; volume.__skipPreventDefault = true;
    volume.setAttribute("aria-label", label("Volume", "Volume", "音量"));
    volume.addEventListener("input", function () { video.volume = Number(volume.value); video.muted = video.volume === 0; });
    var fullscreen = button("", label("Full screen", "Plein écran", "全屏"), function () {
      if (document.fullscreenElement === root) document.exitFullscreen().catch(function () {});
      else if (document.fullscreenEnabled && root.requestFullscreen) root.requestFullscreen().catch(function () {});
      else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
    });
    fullscreen.hidden = isAudio || !(document.fullscreenEnabled && root.requestFullscreen) && !video.webkitEnterFullscreen;
    function fullscreenState() {
      var full = document.fullscreenElement === root;
      fullscreen.setAttribute("aria-label", full ? label("Exit full screen", "Quitter le plein écran", "退出全屏") : label("Full screen", "Plein écran", "全屏"));
      icon(fullscreen, full ? "M9 3v6H3m12-6v6h6M3 15h6v6m12-6h-6v6" : "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5");
    }
    document.addEventListener("fullscreenchange", fullscreenState); fullscreenState();
    if (isAudio) { toggleButton.className = "memory-audio-toggle"; row.append(toggleButton, time, mute, volume); }
    else row.append(toggleButton, time, mute, volume, fullscreen);
    controls.append(seek, row); root.append(video, controls);
    video.controls = false;
    var loading = document.createElement("span"); loading.className = "memory-player-loading"; loading.hidden = true; loading.setAttribute("role", "status");
    loading.textContent = label("Loading…", "Chargement…", "正在加载…"); root.appendChild(loading);
    ["waiting", "seeking"].forEach(function (type) { video.addEventListener(type, function () { loading.hidden = false; }); });
    ["playing", "canplay", "seeked", "pause", "ended", "emptied", "error"].forEach(function (type) { video.addEventListener(type, function () { loading.hidden = true; }); });
    var idleTimer;
    function reveal() {
      clearTimeout(idleTimer); root.classList.remove("controls-hidden");
      if (!isAudio && !video.paused && !video.ended) idleTimer = setTimeout(function () {
        if (!controls.querySelector(":focus-visible") && !root.classList.contains("is-seeking")) root.classList.add("controls-hidden");
      }, 2400);
    }
    function format(seconds) { seconds = Math.max(0, Math.floor(seconds || 0)); return Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0"); }
    function sync() {
      var duration = Number.isFinite(video.duration) ? video.duration : 0;
      var current = video.currentTime || 0;
      if (video.videoWidth && video.videoHeight) root.style.setProperty("--video-aspect", video.videoWidth / video.videoHeight);
      seek.max = String(duration); seek.value = String(current); seek.disabled = !duration;
      seek.setAttribute("aria-valuetext", format(current) + " / " + format(duration));
      time.textContent = format(current) + " / " + format(duration);
      seek.style.setProperty("--played", (duration ? current / duration * 100 : 0) + "%");
      var buffered = 0;
      for (var i = 0; i < video.buffered.length; i++) if (video.buffered.start(i) <= current && video.buffered.end(i) >= current) buffered = video.buffered.end(i);
      seek.style.setProperty("--buffered", (duration ? buffered / duration * 100 : 0) + "%");
      var paused = video.paused || video.ended;
      toggleButton.setAttribute("aria-label", paused ? label("Play", "Lire", "播放") : label("Pause", "Pause", "暂停"));
      icon(toggleButton, paused ? "M8 5l11 7-11 7Z" : "M8 5v14M16 5v14");
      var muted = video.muted || video.volume === 0;
      mute.setAttribute("aria-label", muted ? label("Unmute", "Activer le son", "开启声音") : label("Mute", "Couper le son", "静音"));
      icon(mute, "M11 4L6 8H3v8h3l5 4Z" + (muted ? "m5 5 5 10m0-10-5 10" : "M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"));
      volume.value = muted ? "0" : String(video.volume);
    }
    ["loadedmetadata", "durationchange", "timeupdate", "progress", "volumechange", "emptied"].forEach(function (type) { video.addEventListener(type, sync); });
    ["play", "pause", "ended", "error"].forEach(function (type) { video.addEventListener(type, function () { sync(); reveal(); }); });
    seek.addEventListener("input", function () { if (Number.isFinite(video.duration)) video.currentTime = Number(seek.value); sync(); reveal(); });
    seek.addEventListener("pointerdown", function () { root.classList.add("is-seeking"); });
    ["pointerup", "pointercancel", "lostpointercapture"].forEach(function (type) { seek.addEventListener(type, function () { root.classList.remove("is-seeking"); reveal(); }); });
    root.addEventListener("pointermove", reveal); root.addEventListener("focusin", reveal); root.addEventListener("focusout", reveal);
    // Touch wakes the controls without unexpectedly pausing the film.
    video.addEventListener("pointerup", function (event) { if (event.pointerType === "mouse") toggle(); reveal(); });
    root.addEventListener("keydown", function (event) {
      event.stopPropagation();
      if (event.target.tagName === "INPUT" || event.target.tagName === "BUTTON") return;
      if (event.key === " " || event.key.toLowerCase() === "k") { event.preventDefault(); toggle(); }
      if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && Number.isFinite(video.duration)) { event.preventDefault(); video.currentTime = clamp(video.currentTime + (event.key === "ArrowLeft" ? -5 : 5), 0, video.duration); }
      reveal();
    });
    root.tabIndex = 0; root.setAttribute("role", "group"); root.setAttribute("aria-label", isAudio ? label("Audio player", "Lecteur audio", "音频播放器") : label("Video player", "Lecteur vidéo", "视频播放器"));
    sync();
    return { element: root, reset: function () { clearTimeout(idleTimer); root.classList.remove("controls-hidden", "is-seeking"); if (document.fullscreenElement === root) document.exitFullscreen().catch(function () {}); }, focus: function () { root.focus({ preventScroll: true }); } };
  }
  function galleryContrast(card, controls) {
    var source, sequence = 0;
    var canvas = document.createElement("canvas"); canvas.width = canvas.height = 64;
    var context = canvas.getContext("2d", { willReadFrequently: true });
    function update() {
      if (!source || !context || controls.hidden) return;
      var bounds = card.getBoundingClientRect(); if (!bounds.width || !bounds.height) return;
      // Match the centered background-size: cover crop, then sample each control's own area.
      var scale = Math.max(bounds.width / source.naturalWidth, bounds.height / source.naturalHeight);
      var width = bounds.width / scale, height = bounds.height / scale;
      try {
        context.fillStyle = "#000"; context.fillRect(0, 0, 64, 64);
        context.drawImage(source, (source.naturalWidth - width) / 2, (source.naturalHeight - height) / 2, width, height, 0, 0, 64, 64);
        controls.querySelectorAll("button").forEach(function (control) {
          var rect = control.getBoundingClientRect();
          var x = clamp(Math.round(((rect.left + rect.width / 2 - bounds.left) / bounds.width) * 64) - 1, 0, 61);
          var y = clamp(Math.round(((rect.top + rect.height / 2 - bounds.top) / bounds.height) * 64) - 1, 0, 61);
          var pixels = context.getImageData(x, y, 3, 3).data, luminance = 0;
          for (var i = 0; i < pixels.length; i += 4) luminance += .2126 * pixels[i] + .7152 * pixels[i + 1] + .0722 * pixels[i + 2];
          var light = luminance / 9 > 145;
          control.style.setProperty("--gallery-ink", light ? "#111" : "#fff");
          control.style.setProperty("--gallery-shadow", light ? "#ffffff99" : "#0009");
        });
      } catch (_) { /* Cross-origin images keep the legible outlined fallback. */ }
    }
    if (window.ResizeObserver) new ResizeObserver(update).observe(card);
    return function (url) {
      var request = ++sequence; source = null;
      if (controls.hidden) return;
      controls.querySelectorAll("button").forEach(function (control) { control.style.removeProperty("--gallery-ink"); control.style.removeProperty("--gallery-shadow"); });
      var image = new Image(); image.crossOrigin = "anonymous";
      image.onload = function () { if (request === sequence) { source = image; update(); } };
      image.src = url;
    };
  }
  function installViewer() {
    if (card) return;
    card = document.querySelector(".post-2d-img"); if (!card) return;
    card.setAttribute("role", "button"); card.tabIndex = 0;
    card.__skipPreventDefault = true;
    card.setAttribute("aria-label", label("Open photo", "Ouvrir la photo", "打开照片"));
    var count = document.createElement("span"); count.className = "photo-gallery-status";
    count.setAttribute("role", "status");
    var dots = document.createElement("div"); dots.className = "photo-gallery-dots";
    dots.setAttribute("role", "group"); dots.setAttribute("aria-label", label("Photos, videos and audio", "Photos, vidéos et audio", "照片、视频和音频"));
    var previous = button("‹", label("Previous item", "Élément précédent", "上一项"), function () { move(-1); });
    var next = button("›", label("Next item", "Élément suivant", "下一项"), function () { move(1); });
    previous.className = "photo-gallery-prev"; next.className = "photo-gallery-next";
    icon(previous, "M14 6l-6 6 6 6"); icon(next, "M10 6l6 6-6 6");
    // Controls are siblings of the photo button, not nested interactive elements.
    var controls = document.createElement("div"); controls.className = "photo-gallery-controls"; controls.append(previous, dots, count, next); card.parentNode.appendChild(controls);
    var updateContrast = galleryContrast(card, controls);
    function inputMode(event) {
      if (event.pointerType) controls.classList.toggle("photo-touch-input", event.pointerType !== "mouse");
    }
    document.addEventListener("pointerdown", inputMode, { passive: true });
    document.addEventListener("pointermove", inputMode, { passive: true });
    viewer = document.createElement("dialog"); viewer.className = "revival-photo-viewer";
    viewer.tabIndex = -1;
    viewer.setAttribute("aria-label", label("Memory gallery", "Galerie du souvenir", "回忆相册"));
    var image = document.createElement("img");
    var video = document.createElement("video"); video.controls = true; video.playsInline = true; video.preload = "metadata"; video.hidden = true;
    video.setAttribute("aria-label", label("Memory video", "Vidéo du souvenir", "回忆视频"));
    var player = createVideoPlayer(video);
    var audio = document.createElement("audio"); audio.preload = "metadata";
    var audioPlayer = createVideoPlayer(audio);
    audioPlayer.element.classList.add("memory-audio-player");
    var visualizer = window.songqiAudioVisualizer(audio, audioPlayer.element);
    card.appendChild(audioPlayer.element);

    var play = document.createElement("span"); play.className = "memory-video-play"; play.textContent = "▶"; play.setAttribute("aria-hidden", "true"); card.appendChild(play);
    var mediaError = document.createElement("p"); mediaError.className = "media-playback-error"; mediaError.hidden = true;
    var resumeSound = false;
    function restoreSound() { var sound = window.SongqiPhotos.sound; if (resumeSound && sound) sound.unmute(); resumeSound = false; }
    [video, audio].forEach(function (media) {
    media.addEventListener("play", function () { var sound = window.SongqiPhotos.sound; if (sound && !sound.isMute) { resumeSound = true; sound.mute(0); } });
    media.addEventListener("pause", restoreSound);
    media.addEventListener("ended", restoreSound);
    media.addEventListener("error", function () { restoreSound(); (media === audio ? audioPlayer.element : viewer).appendChild(mediaError); mediaError.hidden = false; mediaError.textContent = label("This media could not be played. Please try again.", "Impossible de lire ce fichier.", "媒体无法播放，请重试。"); });
    });
    var close = button("×", label("Close gallery", "Fermer la galerie", "关闭相册"), function () { viewer.close(); });
    close.className = "photo-viewer-close";
    var fullPrevious = button("‹", previous.getAttribute("aria-label"), function () { move(-1); });
    var fullNext = button("›", next.getAttribute("aria-label"), function () { move(1); });
    fullPrevious.className = "photo-gallery-prev"; fullNext.className = "photo-gallery-next";
    icon(fullPrevious, "M14 6l-6 6 6 6"); icon(fullNext, "M10 6l6 6-6 6");
    viewer.append(close, image, player.element, mediaError, fullPrevious, fullNext); document.body.appendChild(viewer);
    // Keep native touch clicks and photo gestures out of the galaxy input controller.
    ["touchstart", "touchmove", "touchend", "mousedown", "mouseup", "wheel"].forEach(function (type) {
      viewer.addEventListener(type, function (event) { event.stopPropagation(); }, { passive: true });
    });
    function render() {
      var photo = currentMemory[memoryIndex];
      controls.hidden = currentMemory.length < 2;
      fullPrevious.hidden = fullNext.hidden = currentMemory.length < 2;
      player.reset(); video.pause(); video.removeAttribute("src"); video.load();
      audioPlayer.reset(); audio.pause(); audio.removeAttribute("src"); audio.load(); visualizer.reset();
      mediaError.hidden = true;
      if (!photo) return;
      var isVideo = !!photo.video_url;
      var isAudio = !!photo.audio_url;
      play.hidden = !isVideo || isAudio;
      card.classList.toggle("has-inline-audio", isAudio);
      card.setAttribute("role", isAudio ? "group" : "button"); card.tabIndex = isAudio ? -1 : 0;
      card.setAttribute("aria-label", isAudio ? label("Audio memory", "Souvenir audio", "音频回忆") : isVideo ? label("Play video", "Lire la vidéo", "播放视频") : label("Open photo", "Ouvrir la photo", "打开照片"));
      image.hidden = isVideo || isAudio; video.hidden = !isVideo; player.element.hidden = !isVideo; audioPlayer.element.hidden = !isAudio;
      card.style.backgroundImage = 'url("' + photo.image_url.replace(/"/g, "%22") + '")';
      count.textContent = label("Item", "Élément", "项目") + " " + (memoryIndex + 1) + " / " + currentMemory.length;
      if (dots.children.length !== currentMemory.length) {
        dots.replaceChildren();
        currentMemory.forEach(function (_, index) {
          var dot = button("", label("Show item", "Afficher l’élément", "显示项目") + " " + (index + 1), function () { memoryIndex = index; render(); });
          dot.className = "photo-gallery-dot";
          dots.appendChild(dot);
        });
      }
      Array.prototype.forEach.call(dots.children, function (dot, index) { dot.setAttribute("aria-pressed", String(index === memoryIndex)); });
      updateContrast(photo.image_url);
      if (viewer.open && isVideo) { image.removeAttribute("src"); video.poster = photo.full_image_url; video.src = photo.video_url; }
      if (isAudio) { if (viewer.open) viewer.close(); image.removeAttribute("src"); audio.src = photo.audio_url; visualizer.reset(); }
      if (viewer.open && !isVideo && !isAudio) { image.src = photo.full_image_url; image.alt = label("Memory photo", "Photo du souvenir", "回忆照片") + " " + (memoryIndex + 1); }
    }
    function move(delta) { if (currentMemory.length < 2) return; memoryIndex = (memoryIndex + delta + currentMemory.length) % currentMemory.length; render(); }
    function open(event) {
      if (event.type === "keydown" && event.key !== "Enter" && event.key !== " ") return;
      if (!currentMemory.length || currentMemory[memoryIndex].audio_url) return;
      event.preventDefault(); event.stopPropagation(); viewer.showModal(); render(); if (currentMemory[memoryIndex].video_url) video.play().catch(function () {}); if (currentMemory[memoryIndex].video_url) player.focus(); else if (!currentMemory[memoryIndex].audio_url) viewer.focus({ preventScroll: true });
    }
    card.addEventListener("click", open); card.addEventListener("keydown", open);
    viewer.addEventListener("keydown", function (event) { if (!player.element.contains(event.target) && !audioPlayer.element.contains(event.target) && (event.key === "ArrowLeft" || event.key === "ArrowRight")) { event.preventDefault(); move(event.key === "ArrowLeft" ? -1 : 1); } event.stopPropagation(); });
    viewer.addEventListener("close", function () { player.reset(); video.pause(); video.removeAttribute("src"); video.load(); image.removeAttribute("src"); card.focus({ preventScroll: true }); });
    viewer.addEventListener("click", function (event) { if (event.target === viewer) viewer.close(); });
    window.addEventListener("popstate", function () { audio.pause(); if (viewer.open) viewer.close(); });
    window.addEventListener("pagehide", function () { audio.pause(); video.pause(); });
    function swipe(element) {
      var start;
      element.addEventListener("touchstart", function (event) { start = !event.target.closest("button,input") && event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null; }, { passive: true });
      element.addEventListener("touchend", function (event) { if (!start || !event.changedTouches.length) return; var point = event.changedTouches[0]; var dx = point.clientX - start.x; var dy = point.clientY - start.y; start = null; if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) { event.preventDefault(); move(dx > 0 ? -1 : 1); } }, { passive: false });
    }
    swipe(card); swipe(image);
    window.SongqiPhotos.closeMemory = function () {
      audio.pause(); audio.removeAttribute("src"); audio.load(); visualizer.reset();
      if (viewer.open) viewer.close();
    };
    window.SongqiPhotos.renderMemory = render;
  }
  function showMemory(post) {
    installViewer();
    var photos = post.photos && post.photos.length ? post.photos : [{ image_url: post.image_url, full_image_url: post.full_image_url || post.image_url }];
    currentMemory = photos.slice(0, MAX_VIEW_PHOTOS).map(function (photo) { return { audio_url: photo.audio_url ? safeImageUrl(photo.audio_url) : "", video_url: photo.video_url ? safeImageUrl(photo.video_url) : "", image_url: safeImageUrl(photo.image_url), full_image_url: safeImageUrl(photo.full_image_url || photo.image_url) }; }).filter(function (photo) { return photo.image_url && photo.full_image_url; });
    memoryIndex = 0;
    if (window.SongqiPhotos.renderMemory) window.SongqiPhotos.renderMemory();
  }
  window.SongqiPhotos = { uploadFiles: uploadFiles, createAdjustmentStep: createAdjustmentStep, installViewer: installViewer, showMemory: showMemory, cropBounds: cropBounds };
}());
