// Shared upload defaults for the server and admin; the public shell receives these too.
export const videoLimits = Object.freeze({
  maxVideoBytes: 500 * 1024 * 1024,
  maxVideoSeconds: 10 * 60,
  maxVideoPixels: 3840 * 2160,
});

export const audioLimits = Object.freeze({
  maxAudioBytes: 100 * 1024 * 1024,
  maxAudioSeconds: 10 * 60,
});
export const isAudioFile = (file) =>
  /^audio\//.test(file.type) || /\.(mp3|m4a|wav|ogg|flac)$/i.test(file.name);
export const mediaAccept =
  "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm,.mov,.m4v,audio/mpeg,audio/mp4,audio/wav,audio/ogg,audio/flac,.mp3,.m4a,.wav,.ogg,.flac";
