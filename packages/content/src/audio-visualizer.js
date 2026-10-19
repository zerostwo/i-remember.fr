import { createAudioParticles } from "./audio-particles.js";

// One persistent analyser per player, created only by an explicit playback gesture.
// Frequency data follows the media element through seeking, volume and gallery changes.
export function createAudioVisualizer(audio, root) {
  const canvas = document.createElement("canvas");
  canvas.className = "memory-audio-waveform";
  canvas.setAttribute("aria-hidden", "true");
  root.prepend(canvas);
  const paint = canvas.getContext("2d");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let context,
    analyser,
    spectrum,
    frame = 0,
    last = 0;
  const particles = createAudioParticles();
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
    const active =
      analyser && !audio.paused && !audio.ended && !document.hidden && !reduced.matches;
    if (active) analyser.getByteFrequencyData(spectrum);
    for (const particle of particles) {
      const energy = active ? spectrum[particle.bin] / 255 : 0;
      // A loose horizontal star field expands vertically with each frequency band.
      // Its resting silhouette is illustrative, not a precomputed track waveform.
      const amplitude = active ? 0.28 + energy * 1.15 : 0.65;
      const x = bounds.width * particle.x;
      const y = bounds.height * (0.5 + particle.y * amplitude);
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
