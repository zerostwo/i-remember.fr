import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile, readFile, rm, rename, copyFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";

import { videoLimits } from "../../packages/config/src/media-limits.js";
export { videoLimits };

const run = promisify(execFile);
let processing = false;
function failure(statusCode, message) {
  return Object.assign(new Error(message), { statusCode, errorMsg: message, expose: true });
}

// Only one decoder per web process. Reject overload instead of accumulating
// large upload buffers and unbounded transcode jobs in memory.
export async function uploadVideo(file, storageRoot, onProgress = () => {}) {
  const size = file?.path ? (await stat(file.path)).size : file?.data?.length;
  if (!size) throw failure(400, "Choose an MP4, MOV or WebM video.");
  if (size > videoLimits.maxVideoBytes)
    throw failure(413, "Choose a video of 500 MB or less.");
  if (processing) throw failure(429, "Another video is processing. Please try again shortly.");
  processing = true;
  onProgress({ phase: "processing", stage: "preparing", percent: null });
  const fileId = `revival-${randomUUID().slice(0, 12)}`;
  const folder = join(storageRoot, "posts", fileId);
  const temporary = join(storageRoot, ".video-processing", fileId);
  try {
    await mkdir(temporary, { recursive: true, mode: 0o770 });
    const input = join(temporary, "source");
    if (file.path) await copyFile(file.path, input);
    else await writeFile(input, file.data, { mode: 0o660 });
    // Never permit uploaded playlists to fetch network resources.
    const { stdout } = await run(
      "ffprobe",
      [
        "-v",
        "error",
        "-protocol_whitelist",
        "file,pipe",
        "-show_format",
        "-show_streams",
        "-of",
        "json",
        input,
      ],
      { timeout: 15000, maxBuffer: 1024 * 1024 },
    );
    const info = JSON.parse(stdout);
    const stream = info.streams?.find(
      (item) => item.codec_type === "video" && !item.disposition?.attached_pic,
    );
    const duration = Number(info.format?.duration);
    if (
      !/(^|,)(mov|mp4|webm|matroska)(,|$)/.test(info.format?.format_name || "") ||
      !stream ||
      !Number.isFinite(duration) ||
      duration <= 0
    )
      throw failure(400, "Choose a valid MP4, MOV or WebM video.");
    if (duration > videoLimits.maxVideoSeconds)
      throw failure(400, "Choose a video of 10 minutes or less.");
    if (
      !(stream.width > 0 && stream.height > 0) ||
      stream.width * stream.height > videoLimits.maxVideoPixels
    )
      throw failure(400, "Choose a video with a resolution of 4K or less.");
    const output = join(temporary, "video.mp4");
    const conversion = run(
      "ffmpeg",
      [
        "-v",
        "error",
        "-progress",
        "pipe:1",
        "-nostats",
        "-nostdin",
        "-y",
        "-threads",
        "2",
        "-protocol_whitelist",
        "file,pipe",
        "-i",
        input,
        "-map",
        `0:${stream.index}`,
        "-map",
        "0:a:0?",
        "-map_metadata",
        "-1",
        "-map_chapters",
        "-1",
        "-t",
        String(videoLimits.maxVideoSeconds),
        "-vf",
        "scale=w='min(1920,iw)':h='min(1920,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1,fps=30",
        "-c:v",
        "libx264",
        "-threads",
        "2",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-ac",
        "2",
        "-movflags",
        "+faststart",
        output,
      ],
      { timeout: 900000, maxBuffer: 1024 * 1024 },
    );
    let pendingProgress = "";
    let lastPercent = -1;
    conversion.child.stdout.on("data", (chunk) => {
      pendingProgress += chunk.toString();
      const lines = pendingProgress.split("\n");
      pendingProgress = lines.pop();
      for (const line of lines) {
        const match = line.match(/^out_time_us=(\d+)$/);
        if (!match) continue;
        const percent = Math.max(0, Math.min(99, Math.floor(Number(match[1]) / (duration * 1000000) * 100)));
        if (percent > lastPercent) {
          lastPercent = percent;
          onProgress({ phase: "processing", stage: "transcoding", percent });
        }
      }
    });
    await conversion;
    onProgress({ phase: "processing", stage: "finishing", percent: null });
    const poster = join(temporary, "full.jpg");
    await run(
      "ffmpeg",
      [
        "-v",
        "error",
        "-nostdin",
        "-y",
        "-ss",
        String(Math.min(0.5, duration / 2)),
        "-i",
        output,
        "-frames:v",
        "1",
        "-q:v",
        "2",
        poster,
      ],
      { timeout: 15000, maxBuffer: 1024 * 1024 },
    );
    const posterData = await readFile(poster);
    await sharp(posterData)
      .resize(600, 600, { fit: "cover" })
      .jpeg({ quality: 88 })
      .toFile(join(temporary, "resized.jpg"));
    await sharp(posterData)
      .resize(220, 220, { fit: "cover" })
      .jpeg({ quality: 82 })
      .toFile(join(temporary, "thumb.jpg"));
    const metadata = { type: "video/mp4", duration, width: stream.width, height: stream.height };
    await writeFile(join(temporary, "video.json"), JSON.stringify(metadata), { mode: 0o660 });
    await rm(input);
    await mkdir(join(storageRoot, "posts"), { recursive: true });
    await rename(temporary, folder);
    return { fileId, ...metadata };
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    if (error.statusCode) throw error;
    if (error.code === "ENOENT")
      throw failure(503, "Video processing is unavailable. Please try again later.");
    throw failure(400, "This video could not be processed. Try a shorter MP4, MOV or WebM file.");
  } finally {
    processing = false;
  }
}
