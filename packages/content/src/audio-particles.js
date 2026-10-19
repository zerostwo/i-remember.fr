// Shared by the live canvas and generated audio covers; all coordinates are normalized.
export function createAudioParticles() {
  const noise = (seed) => {
    const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
    return value - Math.floor(value);
  };
  return Array.from({ length: 1500 }, (_, i) => {
    const x = noise(i + 1);
    const position = x * 2 - 1;
    const depth = noise(i + 6001);
    const dust = i % 19 !== 0;
    const gaussian = Math.sqrt(-2 * Math.log(Math.max(0.001, noise(i + 1801)))) *
      Math.cos(noise(i + 3601) * Math.PI * 2);
    const spread = 0.015 + Math.pow(Math.sin(x * Math.PI), 1.5) * 0.065;
    return {
      x: 0.08 + x * 0.84,
      y: dust ? -position * 0.14 + Math.sin(position * 4) * 0.035 + gaussian * spread
        : (noise(i + 1801) - 0.5) * 0.75,
      bin: Math.min(220, Math.floor(2 * Math.pow(110, x))),
      size: dust ? 0.3 + depth * depth * 0.55 : 0.7 + depth * 0.5,
      opacity: (0.12 + depth * depth * 0.65) * Math.pow(Math.sin(x * Math.PI), 0.35),
      phase: noise(i + 4201) * Math.PI * 2,
      depth,
      dust,
    };
  });
}
