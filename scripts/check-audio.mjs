import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { uploadAudio } from "../src/server/audio.js";
import { audioLimits, isAudioFile } from "../packages/config/src/media-limits.js";
import { createVideoUploads } from "../src/server/video-uploads.js";
const run = promisify(execFile);
const root = await mkdtemp(join(tmpdir(), "songqi-audio-test-"));
let uploads;
try {
  assert.ok(isAudioFile({ name: "VOICE.MP3", type: "" }));
  await assert.rejects(
    uploadAudio({ data: Buffer.from("not audio") }, root),
    (e) => e.statusCode === 400,
  );
  await assert.rejects(
    uploadAudio({ data: { length: audioLimits.maxAudioBytes + 1 } }, root),
    (e) => e.statusCode === 413,
  );
  for (const extension of ["mp3", "m4a", "wav", "ogg", "flac"]) {
    const input = join(root, `input.${extension}`);
    await run("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440",
      "-t",
      "1",
      input,
    ]);
    const data = await readFile(input),
      progress = [];
    const pending = uploadAudio({ data }, root, (event) => progress.push(event));
    await assert.rejects(uploadAudio({ data }, root), (e) => e.statusCode === 429);
    const result = await pending;
    assert.equal(result.type, "audio/mpeg");
    assert.ok(result.duration > 0);
    const folder = join(root, "posts", result.fileId);
    const info = JSON.parse(
      (
        await run("ffprobe", [
          "-v",
          "error",
          "-show_streams",
          "-of",
          "json",
          join(folder, "audio.mp3"),
        ])
      ).stdout,
    );
    assert.equal(info.streams.length, 1);
    assert.equal(info.streams[0].codec_name, "mp3");
    assert.ok(progress.some((event) => event.stage === "transcoding" && event.percent != null));
    for (const name of ["full", "resized", "thumb"])
      assert.ok((await readFile(join(folder, `${name}.jpg`))).length > 1000);
    assert.ok(!(await readdir(folder)).includes("source"));
  }
  const long = join(root, "long.flac");
  await run("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "anullsrc=r=8000:cl=mono",
    "-t",
    "601",
    long,
  ]);
  await assert.rejects(
    uploadAudio({ path: long }, root),
    (e) => e.statusCode === 400 && /10 minutes/.test(e.message),
  );
  const video = join(root, "video.mp4");
  await run("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=size=32x32",
    "-f",
    "lavfi",
    "-i",
    "sine",
    "-t",
    "1",
    "-c:v",
    "libx264",
    "-c:a",
    "aac",
    video,
  ]);
  await assert.rejects(uploadAudio({ path: video }, root), (e) => e.statusCode === 400);
  assert.deepEqual(await readdir(join(root, ".audio-processing")), []);
  uploads = createVideoUploads(root, async (result) => result, {
    kind: "audio",
    maxBytes: audioLimits.maxAudioBytes,
    processVideo: uploadAudio,
  });
  await assert.rejects(uploads.start(audioLimits.maxAudioBytes + 1), (e) => e.statusCode === 413);
  const bytes = await readFile(join(root, "input.mp3"));
  const session = await uploads.start(bytes.length);
  await uploads.append(session.id, 0, bytes);
  uploads.complete(session.id);
  await uploads.close();
  uploads = null;
  assert.deepEqual(await readdir(`${root}.audio-uploads`), []);
  console.log(
    "Audio formats, byte/duration limits, video rejection, conversion, covers, overload and session cleanup passed",
  );
} finally {
  await uploads?.close();
  await rm(root, { recursive: true, force: true });
  await rm(`${root}.audio-uploads`, { recursive: true, force: true });
}
