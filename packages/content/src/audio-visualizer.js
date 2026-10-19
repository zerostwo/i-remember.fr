// One persistent analyser per player, created only by an explicit playback gesture.
// Frequency data follows the media element through seeking, volume and gallery changes.
export function createAudioVisualizer(audio, root) {
  const canvas = document.createElement("canvas");
  canvas.className = "memory-audio-orbit";
  canvas.setAttribute("aria-hidden", "true");
  const caption = document.createElement("div");
  caption.className = "memory-audio-caption";
  const language = window.LANG || "en";
  caption.textContent =
    language === "fr"
      ? "Un souvenir en son"
      : language === "zh"
        ? "声音里的回忆"
        : "A memory in sound";
  root.prepend(canvas, caption);
  const paint = canvas.getContext("2d");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let context,
    analyser,
    spectrum,
    frame = 0,
    last = 0;
  const particles = Array.from({ length: 1100 }, (_, i) => ({
    angle: i * 2.3999632297,
    spread: Math.sin(i * 12.9898) * 0.022 + Math.cos(i * 4.17) * 0.012,
    size: i % 7 === 0 ? 1.25 : 0.65,
    opacity: 0.15 + (i % 11) * 0.065,
  }));
  function draw() {
    if (!paint) return;
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const pixelRatio = Math.min(devicePixelRatio || 1, 2);
    const width = Math.round(bounds.width * pixelRatio),
      height = Math.round(bounds.height * pixelRatio);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    paint.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    paint.clearRect(0, 0, bounds.width, bounds.height);
    const size = Math.min(bounds.width, bounds.height);
    const active =
      analyser && !audio.paused && !audio.ended && !document.hidden && !reduced.matches;
    if (active) analyser.getByteFrequencyData(spectrum);
    for (const particle of particles) {
      // Mirror logarithmic bands around the orbit; no hard seam at twelve o'clock.
      const position = (1 + Math.sin(particle.angle)) / 2;
      const bin = Math.min(220, Math.floor(2 * Math.pow(110, position)));
      const energy = active ? spectrum[bin] / 255 : 0;
      const radius = size * (0.3 + particle.spread + energy * 0.045);
      const x = bounds.width / 2 + Math.cos(particle.angle) * radius;
      const y = bounds.height / 2 + Math.sin(particle.angle) * radius;
      paint.fillStyle = `rgba(238,238,238,${Math.min(1, particle.opacity + energy * 0.2)})`;
      paint.beginPath();
      paint.arc(x, y, particle.size + energy * 0.45, 0, Math.PI * 2);
      paint.fill();
    }
  }
  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
    draw();
  }
  function animate(time) {
    frame = 0;
    if (audio.paused || audio.ended || document.hidden || reduced.matches || root.hidden) {
      draw();
      return;
    }
    if (time - last >= 32) {
      last = time;
      draw();
    }
    frame = requestAnimationFrame(animate);
  }
  function start() {
    if (!frame) frame = requestAnimationFrame(animate);
  }
  audio.preparePlayback = () => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!context && AudioContext) {
        context = new AudioContext();
        analyser = context.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.88;
        spectrum = new Uint8Array(analyser.frequencyBinCount);
        const source = context.createMediaElementSource(audio);
        source.connect(analyser);
        analyser.connect(context.destination);
      }
      if (context?.state === "suspended") context.resume().catch(() => {});
    } catch {
      /* Plain audio playback remains available without visualization support. */
    }
  };
  audio.addEventListener("playing", start);
  for (const event of ["pause", "ended", "emptied", "error"]) audio.addEventListener(event, stop);
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
  reduced.addEventListener("change", () => {
    stop();
    if (!reduced.matches) start();
  });
  new ResizeObserver(draw).observe(canvas);
  return { reset: stop };
}
