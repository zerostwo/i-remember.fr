import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, readdir, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";
import { pairedJpeg, pairedMov, keyPhotoTime, boxes } from "../src/server/live-photo-format.js";
import { zipFiles, unpackPair } from "../src/server/live-photo-archive.js";
import { uploadLivePhoto } from "../src/server/live-photo.js";
import { groupLivePhotos } from "../packages/content/src/live-photo-upload.js";
const run = promisify(execFile),
  root = await mkdtemp(join(tmpdir(), "songqi-live-test-"));
const identifier = "01234567-89AB-CDEF-0123-456789ABCDEF";
const probe = async (path) =>
  JSON.parse(
    (await run("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", path]))
      .stdout,
  );
const metadata = async (path) =>
  JSON.parse((await run("exiftool", ["-j", "-ee", "-G1", "-a", path])).stdout)[0];
try {
  await run("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=160x240:rate=30",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440",
    "-t",
    "1.5",
    "-c:v",
    "libx264",
    "-c:a",
    "aac",
    join(root, "source.mov"),
  ]);
  await sharp({ create: { width: 160, height: 240, channels: 3, background: "#667799" } })
    .jpeg()
    .toFile(join(root, "source.jpg"));
  if (process.platform === "darwin") {
    await run("swift", [resolve("scripts/create-live-photo-fixture.swift"), root], {
      timeout: 120000,
      maxBuffer: 1024 * 1024,
    });
  } else {
    await writeFile(
      join(root, "reference.jpg"),
      pairedJpeg(await readFile(join(root, "source.jpg")), identifier),
    );
    await writeFile(
      join(root, "reference.mov"),
      pairedMov(await readFile(join(root, "source.mov")), identifier, 0.6),
    );
  }
  // Deliberately embed private data in BOTH components before processing.
  await run("exiftool", [
    "-overwrite_original",
    "-GPSLatitude=51.5",
    "-GPSLongitude=4.5",
    "-Make=PRIVATE-CAMERA",
    "-Artist=PRIVATE-OWNER",
    "-DateTimeOriginal=2020:01:02 03:04:05",
    "-XMP:Description=PRIVATE-NOTE",
    join(root, "reference.jpg"),
  ]);
  await run("exiftool", [
    "-overwrite_original",
    "-Keys:GPSCoordinates=+51.5000+004.5000/",
    "-Keys:Make=PRIVATE-CAMERA",
    "-Keys:Author=PRIVATE-OWNER",
    "-Keys:CreationDate=2020:01:02 03:04:05+00:00",
    join(root, "reference.mov"),
  ]);
  assert.match(JSON.stringify(await metadata(join(root, "reference.jpg"))), /PRIVATE-OWNER/);
  assert.match(JSON.stringify(await metadata(join(root, "reference.mov"))), /PRIVATE-OWNER/);
  const photo = await readFile(join(root, "reference.jpg")),
    movie = await readFile(join(root, "reference.mov"));
  const grouped = groupLivePhotos([new File([movie], "IMG_1.MOV"), new File([photo], "IMG_1.JPG")]);
  assert.equal(grouped.length, 1);
  const envelope = Buffer.from(await grouped[0].arrayBuffer());
  assert.deepEqual(unpackPair(envelope), { photo, movie });
  const zip = zipFiles({ "Memory.JPG": photo, "Memory.MOV": movie });
  assert.deepEqual(unpackPair(zip), { photo, movie });
  assert.throws(() => unpackPair(zipFiles({ "Only.JPG": photo })), /both/);
  assert.throws(
    () => unpackPair(zipFiles({ "a.JPG": photo, "b.JPG": photo, "a.MOV": movie })),
    /one photo/,
  );
  const corrupt = Buffer.from(zip);
  corrupt[50] ^= 1;
  assert.throws(() => unpackPair(corrupt), /Damaged/);
  assert.throws(() => boxes(Buffer.from([0, 0, 0, 99, 109, 111, 111, 118])), /Invalid/);
  const output = join(root, "output"),
    progress = [];
  const pending = uploadLivePhoto({ data: envelope }, output, (p) => progress.push(p));
  await assert.rejects(uploadLivePhoto({ data: envelope }, output), (e) => e.statusCode === 429);
  const result = await pending;
  assert.equal(result.hasAudio, true);
  assert.equal(result.photoTime, 0.6);
  assert.ok(progress.some((p) => p.stage === "transcoding"));
  const folder = join(output, "posts", result.fileId);
  const exported = unpackPair(await readFile(join(folder, "live-photo.zip")));
  const exportedFolder = join(root, "export");
  await mkdir(exportedFolder);
  const stillPath = join(exportedFolder, "Memory.JPG"),
    movPath = join(exportedFolder, "Memory.MOV");
  await writeFile(stillPath, exported.photo);
  await writeFile(movPath, exported.movie);
  const stillTags = await metadata(stillPath),
    movTags = await metadata(movPath);
  const stillIdentifier = stillTags["Apple:ContentIdentifier"] || stillTags["Apple:MediaGroupUUID"];
  assert.equal(stillIdentifier, movTags["Keys:ContentIdentifier"]);
  assert.notEqual(stillIdentifier, identifier);
  for (const tags of [stillTags, movTags, await metadata(join(folder, "video.mp4"))]) {
    assert.doesNotMatch(
      JSON.stringify(tags),
      /PRIVATE-|2020:01:02|GPSLatitude|GPSLongitude|GPSCoordinates|DateTimeOriginal/,
    );
  }
  const streams = (await probe(movPath)).streams;
  assert.deepEqual(
    streams.map((s) => s.codec_type),
    ["video", "audio", "data"],
  );
  const packets = JSON.parse(
    (
      await run("ffprobe", [
        "-v",
        "error",
        "-select_streams",
        "d",
        "-show_packets",
        "-of",
        "json",
        movPath,
      ])
    ).stdout,
  );
  assert.ok(
    Math.abs(keyPhotoTime(exported.movie, { streams, packets: packets.packets }) - 0.6) < 0.001,
  );
  const sound = await run(
    "ffmpeg",
    ["-v", "error", "-i", movPath, "-map", "0:a:0", "-f", "s16le", "-ac", "1", "pipe:1"],
    { encoding: "buffer", maxBuffer: 1024 * 1024 },
  );
  assert.ok(
    sound.stdout.some((b) => b !== 0),
    "Retain actual recorded audio samples",
  );
  assert.equal((await sharp(exported.photo).metadata()).width, 160);
  assert.equal(
    (await readdir(output)).some((name) => name.startsWith(".live-photo-")),
    false,
    "Remove all source/staging files",
  );
  assert.equal((await readdir(folder)).includes("original"), false);
  assert.deepEqual(
    await readdir(`${output}.live-photo-processing`),
    [],
    "No private source remains in staging",
  );
  const roundTrip = await uploadLivePhoto(
    { data: await readFile(join(folder, "live-photo.zip")) },
    output,
  );
  assert.equal(roundTrip.livePhoto, true);
  assert.ok(Math.abs(roundTrip.photoTime - 0.6) < 0.001);
  if (process.platform === "darwin") {
    const native = await run(
      "swift",
      [resolve("scripts/check-live-photo-native.swift"), exportedFolder],
      { timeout: 45000 },
    );
    assert.match(native.stdout, /Live Photo: true/);
    const heicResult = await uploadLivePhoto(
      {
        data: zipFiles({
          "Memory.HEIC": await readFile(join(root, "reference.heic")),
          "Memory.MOV": movie,
        }),
      },
      output,
    );
    assert.equal(heicResult.livePhoto, true);
  }
  const mismatched = Buffer.from(
    photo.toString("binary").replace(identifier, "11234567-89AB-CDEF-0123-456789ABCDEF"),
    "binary",
  );
  await assert.rejects(
    uploadLivePhoto({ data: zipFiles({ "Memory.JPG": mismatched, "Memory.MOV": movie }) }, output),
    (e) => e.statusCode === 400 && /matching/.test(e.message),
  );
  assert.equal(
    (await readdir(output)).some((name) => name.startsWith(".live-photo-")),
    false,
  );
  assert.deepEqual(await readdir(`${output}.live-photo-processing`), []);
  console.log(
    "Live Photo pairing, key picture, recorded audio, privacy, archives, limits and cleanup passed" +
      (process.platform === "darwin" ? "; Apple native recognition and HEIC passed" : ""),
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
