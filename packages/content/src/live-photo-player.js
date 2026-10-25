// The key picture is the card background. Only reveal motion after playback
// actually starts, and return to the exact still (not a nearby video frame).
export function createLivePhotoPlayer({ labels = {} } = {}) {
  const root = document.createElement("div");
  root.className = "memory-live-photo";
  root.hidden = true;
  const video = document.createElement("video");
  video.playsInline = true;
  video.preload = "auto";
  video.muted = false;
  video.loop = false;
  video.setAttribute("aria-label", labels.video || "Live Photo");
  const controls = document.createElement("div");
  controls.className = "memory-live-controls";
  const play = document.createElement("button");
  play.type = "button";
  play.textContent = "LIVE";
  const download = document.createElement("a");
  download.textContent = "↓";
  download.download = "Live Photo.zip";
  download.setAttribute("aria-label", labels.download || "Download Live Photo for Apple Photos");
  download.title = labels.download || "Download Live Photo for Apple Photos";
  const status = document.createElement("span");
  status.className = "memory-live-status";
  status.setAttribute("role", "status");
  controls.append(play, download, status);
  root.append(video, controls);
  let photo,
    generation = 0,
    openingFrame = 0;
  function still(state = "still") {
    root.dataset.state = state;
    video.style.visibility = "hidden";
    play.setAttribute("aria-label", labels.play || "Play Live Photo with sound");
    play.setAttribute("aria-pressed", "false");
  }
  function layout() {
    if (!photo || !video.videoWidth || !root.clientWidth) return;
    const w = video.videoWidth,
      h = video.videoHeight,
      crop = photo.live_crop || { x: 0.5, y: 0.5, zoom: 1 };
    const zoom = Math.max(1, Math.min(4, Number(crop.zoom) || 1));
    const size = Math.min(w, h) / zoom,
      scale = root.clientWidth / size;
    const left = Math.max(0, Math.min(w - size, (Number(crop.x) || 0.5) * w - size / 2));
    const top = Math.max(0, Math.min(h - size, (Number(crop.y) || 0.5) * h - size / 2));
    Object.assign(video.style, {
      width: w * scale + "px",
      height: h * scale + "px",
      left: -left * scale + "px",
      top: -top * scale + "px",
    });
  }
  async function start() {
    if (!photo || document.hidden) return;
    cancelAnimationFrame(openingFrame);
    openingFrame = 0;
    const token = generation;
    status.textContent = "";
    video.currentTime = 0;
    try {
      await video.play();
    } catch (error) {
      if (token !== generation || error.name === "AbortError") return;
      still("blocked");
      status.textContent = labels.tap || "Tap LIVE to play with sound";
    }
  }
  controls.addEventListener("click", (event) => event.stopPropagation());
  controls.addEventListener("keydown", (event) => event.stopPropagation());
  play.__skipPreventDefault = download.__skipPreventDefault = true;
  play.addEventListener("click", () => {
    if (!video.paused) video.pause();
    else void start();
  });
  video.addEventListener("playing", () => {
    if (!photo || root.hidden) {
      video.pause();
      return;
    }
    layout();
    video.style.visibility = "visible";
    root.dataset.state = "playing";
    play.setAttribute("aria-label", labels.pause || "Pause Live Photo");
    play.setAttribute("aria-pressed", "true");
  });
  video.addEventListener("ended", () => still());
  video.addEventListener("pause", () => still());
  video.addEventListener("error", () => {
    if (photo) {
      still("error");
      status.textContent = labels.error || "Live Photo could not play. Try again.";
    }
  });
  video.addEventListener("loadedmetadata", layout);
  const resize = new ResizeObserver(layout);
  resize.observe(root);
  const pause = () => video.pause();
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pause();
  });
  window.addEventListener("pagehide", pause);
  function stop() {
    cancelAnimationFrame(openingFrame);
    openingFrame = 0;
    generation++;
    photo = null;
    video.pause();
    video.removeAttribute("src");
    video.load();
    root.hidden = true;
    still();
  }
  return {
    element: root,
    video,
    pause,
    stop,
    show(next, autoplay = true) {
      stop();
      if (!next?.live_photo_url) return;
      photo = next;
      root.hidden = false;
      status.textContent = "";
      download.href = photo.live_download_url;
      download.hidden = !photo.live_download_url;
      video.src = photo.live_photo_url;
      video.muted = false;
      still();
      if (autoplay) {
        // The galaxy loads the photo before revealing its animated card. Start
        // on the visible card, rather than finishing behind the opening motion.
        const token = generation;
        const whenVisible = () => {
          if (token !== generation) return;
          if (
            !document.hidden &&
            root.getClientRects().length &&
            (!root.checkVisibility ||
              root.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }))
          )
            void start();
          else openingFrame = requestAnimationFrame(whenVisible);
        };
        openingFrame = requestAnimationFrame(whenVisible);
      }
    },
  };
}
