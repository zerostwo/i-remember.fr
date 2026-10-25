export const isLivePhotoFile = (file) =>
  file.type === "application/x-songqi-live-photo" || /\.(livp|zip)$/i.test(file.name || "");

// Pair before counting attachments: one still + one MOV occupies one slot.
// The server verifies embedded identifiers; matching names alone never establish
// that two files form a valid Live Photo.
export function groupLivePhotos(files) {
  const list = Array.from(files || []),
    consumed = new Set(),
    result = [];
  for (const file of list) {
    if (consumed.has(file)) continue;
    const stem = file.name.replace(/\.[^.]+$/, "").toLowerCase();
    const candidates = list.filter(
      (other) => other.name.replace(/\.[^.]+$/, "").toLowerCase() === stem,
    );
    const photos = candidates.filter((other) => /\.(jpe?g|heic|heif)$/i.test(other.name));
    const movies = candidates.filter((other) => /\.mov$/i.test(other.name));
    if (photos.length === 1 && movies.length === 1) {
      const photo = photos[0],
        movie = movies[0];
      if (photo.size > 32 * 1024 * 1024 || photo.size + movie.size + 18 > 100 * 1024 * 1024)
        throw new Error("Choose a Live Photo under 100 MB with a photo under 32 MB.");
      const size = new Uint8Array(4);
      new DataView(size.buffer).setUint32(0, photo.size);
      result.push(
        new File(["SONGQI-LIVE-1\n", size, photo, movie], "Memory.livephoto", {
          type: "application/x-songqi-live-photo",
        }),
      );
      consumed.add(photo);
      consumed.add(movie);
    } else {
      if (photos.length && movies.length)
        throw new Error("Choose one original photo and its matching MOV per Live Photo.");
      if (/\.(heic|heif)$/i.test(file.name))
        throw new Error(
          "For a Live Photo, select the matching original MOV too, or choose a .livp archive. For a still photo, export a JPEG.",
        );
      result.push(file);
      consumed.add(file);
    }
  }
  return result;
}
