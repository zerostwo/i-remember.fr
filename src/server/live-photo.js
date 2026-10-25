import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readFile, writeFile, rm, rename, stat, readdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { uploadVideo } from "./video.js";
import { keyPhotoTime, pairedJpeg, pairedMov } from "./live-photo-format.js";
import { unpackPair, zipFiles, livePhotoMaxBytes } from "./live-photo-archive.js";
export { livePhotoMaxBytes };
const run = promisify(execFile);
const fail = (code, message) => Object.assign(new Error(message), { statusCode: code, errorMsg: message });
let processing = false;
export async function uploadLivePhoto(file, root, onProgress = () => {}) {
  if (processing) throw fail(429, "Another Live Photo is processing. Please try again shortly.");
  processing = true;
  let temporary, publishedFolder;
  try {
    onProgress({ phase: "processing", stage: "preparing", percent: null });
    const size = file.path ? (await stat(file.path)).size : file.data?.length;
    if (!size || size > livePhotoMaxBytes) throw fail(413, "Choose a Live Photo of 100 MB or less.");
    // Keep all originals outside the publicly served storage root.
    const staging = `${root}.live-photo-processing`;
    await mkdir(staging, { recursive: true, mode: 0o700 });
    // Clean abandoned work from a terminated process on the next upload. A
    // normal conversion has a 15-minute deadline; allow one hour for recovery.
    for (const name of await readdir(staging)) {
      if (/^work-[A-Za-z0-9]+$/.test(name)) {
        const path = join(staging, name);
        if (Date.now() - (await stat(path)).mtimeMs > 3600000) await rm(path, { recursive: true, force: true });
      }
    }
    temporary = await mkdtemp(join(staging, "work-"));
    const pair = unpackPair(file.path ? await readFile(file.path) : file.data);
    const photoPath = join(temporary, "source-photo"), moviePath = join(temporary, "source.mov");
    await writeFile(photoPath, pair.photo, { mode: 0o600 });
    await writeFile(moviePath, pair.movie, { mode: 0o600 });
    const tags = JSON.parse((await run("exiftool", ["-j", "-n", "-ContentIdentifier", "-MediaGroupUUID", "-ImageWidth", "-ImageHeight", "-FileType", photoPath, moviePath], { timeout: 15000, maxBuffer: 65536 })).stdout);
    // Debian's ExifTool 12 calls Apple MakerNote tag 17 MediaGroupUUID;
    // newer versions call the same tag ContentIdentifier.
    const id = tags[0]?.ContentIdentifier || tags[0]?.MediaGroupUUID;
    if (!id || id !== tags[1]?.ContentIdentifier) throw fail(400, "These files are not a matching Live Photo. Export the unmodified photo and MOV together.");
    if (!["JPEG", "HEIC", "HEIF"].includes(tags[0].FileType) || !(tags[0].ImageWidth > 0 && tags[0].ImageHeight > 0) || tags[0].ImageWidth * tags[0].ImageHeight > 64000000) throw fail(400, "Choose a JPEG or HEIC Live Photo under 64 megapixels.");
    const probe = JSON.parse((await run("ffprobe", ["-v", "error", "-protocol_whitelist", "file,pipe", "-show_streams", "-show_format", "-of", "json", moviePath], { timeout: 15000, maxBuffer: 1024 * 1024 })).stdout);
    const duration = Number(probe.format?.duration);
    if (!(duration > 0 && duration <= 30)) throw fail(400, "Choose a Live Photo of 30 seconds or less.");
    const packets = JSON.parse((await run("ffprobe", ["-v", "error", "-protocol_whitelist", "file,pipe", "-select_streams", "d", "-show_packets", "-show_entries", "packet=stream_index,pts_time,pos,size", "-of", "json", moviePath], { timeout: 15000, maxBuffer: 4 * 1024 * 1024 })).stdout);
    const photoTime = keyPhotoTime(pair.movie, { ...probe, packets: packets.packets });
    if (photoTime >= duration) throw fail(400, "The Live Photo key-picture time is invalid.");
    let input = pair.photo;
    if (tags[0].FileType !== "JPEG") {
      const decoded = join(temporary, "decoded.png");
      await run("heif-convert", [photoPath, decoded], { timeout: 60000, maxBuffer: 65536 });
      input = await readFile(decoded);
    }
    // Re-encode pixels with orientation applied. Never copy EXIF, XMP, IPTC,
    // thumbnails, camera MakerNotes or the user's original pairing identifier.
    const cleanPhoto = await sharp(input, { limitInputPixels: 64000000 }).rotate().jpeg({ quality: 95 }).toBuffer();
    const result = await uploadVideo({ path: moviePath }, temporary, onProgress);
    const folder = join(temporary, "posts", result.fileId);
    const cleanMov = join(temporary, "clean.mov");
    await run("ffmpeg", ["-v", "error", "-nostdin", "-y", "-i", join(folder, "video.mp4"), "-map", "0:v:0", "-map", "0:a:0?", "-c", "copy", "-map_metadata", "-1", "-map_chapters", "-1", cleanMov], { timeout: 30000, maxBuffer: 65536 });
    const identifier = randomUUID().toUpperCase();
    const nativePhoto = pairedJpeg(cleanPhoto, identifier);
    const nativeMovie = pairedMov(await readFile(cleanMov), identifier, photoTime);
    const instructions = Buffer.from("Live Photo\n\nExtract this ZIP, then import Memory.JPG and Memory.MOV together using File > Import in Photos on a Mac. They share a new Live Photo identifier and key-picture track. iOS Safari cannot directly save a ZIP as a Live Photo; import on Mac and sync with iCloud Photos.\n\nLocation, capture dates, device information and original identifiers have been removed from both files. Motion and recorded sound are retained. The still is JPEG and the movie is H.264/AAC MOV.\n");
    await writeFile(join(folder, "live-photo.zip"), zipFiles({ "Memory.JPG": nativePhoto, "Memory.MOV": nativeMovie, "Read me.txt": instructions }), { mode: 0o600 });
    for (const [name, size, fit] of [["full", 2400, "inside"], ["resized", 600, "cover"], ["thumb", 220, "cover"]]) {
      await sharp(cleanPhoto).resize(size, size, { fit, withoutEnlargement: true }).jpeg({ quality: 90 }).toFile(join(folder, `${name}.jpg`));
    }
    const metadata = { type: "image/jpeg", livePhoto: true, photoTime, duration, hasAudio: probe.streams.some(s => s.codec_type === "audio") };
    await rm(join(folder, "video.json"));
    await writeFile(join(folder, "live-photo.json"), JSON.stringify(metadata), { mode: 0o600 });
    await mkdir(join(root, "posts"), { recursive: true });
    publishedFolder = join(root, "posts", result.fileId);
    await rename(folder, publishedFolder);
    return { fileId: result.fileId, ...metadata };
  } catch (error) {
    if (publishedFolder) await rm(publishedFolder, { recursive: true, force: true });
    if (error.statusCode) throw error;
    if (error.code === "ENOENT") throw fail(503, "Live Photo processing is unavailable. Please try again later.");
    throw fail(400, "This Live Photo could not be processed. Choose its matching original photo and MOV, or a .livp archive.");
  } finally {
    if (temporary) await rm(temporary, { recursive: true, force: true });
    processing = false;
  }
}
