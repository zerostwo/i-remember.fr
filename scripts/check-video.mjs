import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { uploadVideo, videoLimits } from "../src/server/video.js";
const run = promisify(execFile);
const root = await mkdtemp(join(tmpdir(), "songqi-video-test-"));
try {
  await assert.rejects(
    uploadVideo({ data: Buffer.from("not a video") }, root),
    (e) => e.statusCode === 400,
  );
  await assert.rejects(
    uploadVideo({ data: { length: videoLimits.maxVideoBytes + 1 } }, root),
    (e) => e.statusCode === 413,
  );
  const input = join(root, "input.mov");
  await run("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=160x240:rate=12",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=220",
    "-t",
    "1",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    input,
  ]);
  const data = await readFile(input);
  const progress = [];
  const pending = uploadVideo({ data }, root, (event) => progress.push(event));
  await assert.rejects(uploadVideo({ data }, root), (e) => e.statusCode === 429);
  const result = await pending;
  assert.equal(result.type, "video/mp4");
  const folder = join(root, "posts", result.fileId);
  const info = JSON.parse(
    (
      await run("ffprobe", [
        "-v",
        "error",
        "-show_streams",
        "-of",
        "json",
        join(folder, "video.mp4"),
      ])
    ).stdout,
  );
  assert.equal(info.streams[0].codec_name, "h264");
  assert.equal(info.streams[0].pix_fmt, "yuv420p");
  assert.equal(info.streams[1].codec_name, "aac");
  assert.ok(info.streams[0].height > info.streams[0].width, "Portrait aspect ratio is retained");
  assert.ok((await readFile(join(folder, "full.jpg"))).length);
  assert.deepEqual(
    await readdir(join(root, ".video-processing")),
    [],
    "Temporary source files are removed",
  );
  // A full ten-minute clip must survive conversion, not be cut at the old 120s cap.
  const boundary = join(root, "ten-minutes.mp4");
  await run("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=size=32x32:rate=1",
    "-t",
    "600",
    "-c:v",
    "libx264",
    boundary,
  ]);
  assert.ok(progress.some((event) => event.stage === "transcoding" && Number.isFinite(event.percent)));
  assert.equal(progress.at(-1).stage, "finishing");
  const accepted = await uploadVideo({ path: boundary }, root);
  const converted = JSON.parse(
    (
      await run("ffprobe", [
        "-v",
        "error",
        "-show_format",
        "-of",
        "json",
        join(root, "posts", accepted.fileId, "video.mp4"),
      ])
    ).stdout,
  );
  assert.ok(Number(converted.format.duration) >= 599.9, "All ten minutes are retained");
  assert.equal(videoLimits.maxVideoBytes, 500 * 1024 * 1024);
  assert.equal(videoLimits.maxVideoSeconds, 600);
  const long = join(root, "long.mp4");
  await run("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=size=32x32:rate=1",
    "-t",
    String(videoLimits.maxVideoSeconds + 1),
    "-c:v",
    "libx264",
    long,
  ]);
  await assert.rejects(
    uploadVideo({ data: await readFile(long) }, root),
    (e) => e.statusCode === 400 && /10 minutes/.test(e.message),
  );
  console.log(
    "Video validation, overload, duration limits, portrait MOV to H.264/AAC, poster and cleanup checks passed",
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
