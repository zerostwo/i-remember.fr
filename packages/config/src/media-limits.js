// Shared upload defaults for the server and admin; the public shell receives these too.
export const videoLimits = Object.freeze({
  maxVideoBytes: 500 * 1024 * 1024,
  maxVideoSeconds: 10 * 60,
  maxVideoPixels: 3840 * 2160,
});
