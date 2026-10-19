import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile, rm, rename, copyFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { audioLimits } from "../../packages/config/src/media-limits.js";

const run = promisify(execFile);
let processing = false;
const failure = (statusCode, message) => Object.assign(new Error(message), { statusCode, errorMsg: message });

// A deterministic monochrome cover keeps audio visible in the existing galaxy and gallery.
function cover() {
  let points = "";
  for (let i = 0; i < 960; i++) {
    const angle = i * 2.3999632297;
    const radius = 176 + Math.sin(i * 12.9898) * 17 + Math.cos(i * 4.17) * 7;
    points += `<circle cx="${300 + Math.cos(angle) * radius}" cy="${300 + Math.sin(angle) * radius}" r="${i % 5 === 0 ? 1.3 : .7}" opacity="${.18 + (i % 9) * .08}"/>`;
  }
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#080808"/><g fill="#eee">${points}</g><path d="M287 280l32 20-32 20Z" fill="none" stroke="#ddd" stroke-width="1.5"/></svg>`);
}

export async function uploadAudio(file, storageRoot, onProgress = () => {}) {
  const size = file?.path ? (await stat(file.path)).size : file?.data?.length;
  if (!size) throw failure(400, "Choose an MP3, M4A, WAV, OGG or FLAC audio file.");
  if (size > audioLimits.maxAudioBytes) throw failure(413, "Choose audio of 100 MB or less.");
  if (processing) throw failure(429, "Another audio file is processing. Please try again shortly.");
  processing = true;
  const fileId = `revival-${randomUUID().slice(0, 12)}`;
  const temporary = join(storageRoot, ".audio-processing", fileId);
  try {
    onProgress({ phase: "processing", stage: "preparing", percent: null });
    await mkdir(temporary, { recursive: true, mode: 0o770 });
    const input = join(temporary, "source");
    if (file.path) await copyFile(file.path, input); else await writeFile(input, file.data, { mode: 0o660 });
    const { stdout } = await run("ffprobe", ["-v", "error", "-protocol_whitelist", "file,pipe", "-show_format", "-show_streams", "-of", "json", input], { timeout: 15000, maxBuffer: 1024 * 1024 });
    const info = JSON.parse(stdout);
    const duration = Number(info.format?.duration);
    const stream = info.streams?.find((item) => item.codec_type === "audio");
    if (!/(^|,)(mp3|mov|mp4|wav|ogg|flac)(,|$)/.test(info.format?.format_name || "") || !stream || info.streams.some((item) => item.codec_type === "video" && !item.disposition?.attached_pic) || !Number.isFinite(duration) || duration <= 0)
      throw failure(400, "Choose a valid MP3, M4A, WAV, OGG or FLAC audio file.");
    if (duration > audioLimits.maxAudioSeconds) throw failure(400, "Choose audio of 10 minutes or less.");
    const conversion = run("ffmpeg", ["-v", "error", "-progress", "pipe:1", "-nostats", "-nostdin", "-y", "-protocol_whitelist", "file,pipe", "-i", input, "-map", `0:${stream.index}`, "-vn", "-map_metadata", "-1", "-map_chapters", "-1", "-t", String(audioLimits.maxAudioSeconds), "-c:a", "libmp3lame", "-b:a", "192k", "-ac", "2", "-ar", "44100", "-threads", "2", join(temporary, "audio.mp3")], { timeout: 300000, maxBuffer: 1024 * 1024 });
    let pending = "";
    conversion.child.stdout.on("data", (chunk) => {
      pending += chunk.toString();
      const lines = pending.split("\n"); pending = lines.pop();
      for (const line of lines) {
        const match = line.match(/^out_time_us=(\d+)$/);
        if (match) onProgress({ phase: "processing", stage: "transcoding", percent: Math.min(99, Math.floor(Number(match[1]) / (duration * 10000))) });
      }
    });
    await conversion;
    onProgress({ phase: "processing", stage: "finishing", percent: null });
    for (const [name, size] of [["full", 600], ["resized", 600], ["thumb", 220]]) await sharp(cover()).resize(size, size).jpeg({ quality: 90 }).toFile(join(temporary, `${name}.jpg`));
    const metadata = { type: "audio/mpeg", duration };
    await writeFile(join(temporary, "audio.json"), JSON.stringify(metadata), { mode: 0o660 });
    await rm(input);
    await mkdir(join(storageRoot, "posts"), { recursive: true });
    await rename(temporary, join(storageRoot, "posts", fileId));
    return { fileId, ...metadata };
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    if (error.statusCode) throw error;
    if (error.code === "ENOENT") throw failure(503, "Audio processing is unavailable. Please try again later.");
    throw failure(400, "This audio could not be processed. Try another MP3, M4A, WAV, OGG or FLAC file.");
  } finally { processing = false; }
}
