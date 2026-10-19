// Shared by the live canvas and generated audio covers; all coordinates are normalized.
export function createAudioParticles() {
  const noise = (seed) => {
    const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
    return value - Math.floor(value);
  };
  return Array.from({ length: 1800 }, (_, i) => {
    const band = i % 100;
    const x = band / 99;
    const taper = Math.pow(Math.sin(x * Math.PI), 0.65);
    const peak = 0.2 + 0.8 * Math.pow(Math.abs(Math.sin(x * 28) * Math.cos(x * 11 + 1)), 1.3);
    return {
      x: 0.08 + x * 0.84 + (noise(i + 1) - 0.5) * 0.008,
      y: (noise(i + 1801) * 2 - 1) * taper * peak * 0.38,
      bin: Math.min(220, Math.floor(2 * Math.pow(110, x))),
      size: i % 13 === 0 ? 1.1 : 0.55,
      opacity: 0.2 + noise(i + 3601) * 0.65,
    };
  });
}
