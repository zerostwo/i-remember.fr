import { randomBytes } from "node:crypto";
import { mkdir, appendFile, writeFile, rm, stat, readdir } from "node:fs/promises";
import { join } from "node:path";
import { uploadVideo, videoLimits } from "./video.js";

export const videoChunkBytes = 8 * 1024 * 1024;
const lifetime = 30 * 60 * 1000;
const fail = (statusCode, message) =>
  Object.assign(new Error(message), { statusCode, errorMsg: message });

// This single-image deployment has one web process. Tokens are unguessable,
// request bodies are bounded, and only two unfinished uploads may occupy disk.
export function createVideoUploads(storageRoot, finalize = async (result) => result, options = {}) {
  const sessions = new Map();
  const directory = `${storageRoot}.video-uploads`;
  const now = options.now || Date.now;
  const processVideo = options.processVideo || uploadVideo;
  let initializing;
  async function initialize() {
    if (!initializing)
      initializing = (async () => {
        await mkdir(directory, { recursive: true, mode: 0o770 });
        for (const name of await readdir(directory)) {
          if (!/^[a-f0-9]{48}$/.test(name)) continue;
          const path = join(directory, name);
          if (now() - (await stat(path)).mtimeMs > lifetime) await rm(path, { force: true });
        }
      })();
    await initializing;
  }
  async function expire() {
    for (const [id, session] of sessions) {
      if (
        session.state === "processing" ||
        session.state === "writing" ||
        now() - session.touched < lifetime
      )
        continue;
      sessions.delete(id);
      await rm(session.path, { force: true });
    }
    if (initializing) {
      for (const name of await readdir(directory)) {
        if (!/^[a-f0-9]{48}$/.test(name) || sessions.has(name)) continue;
        const path = join(directory, name);
        if (now() - (await stat(path)).mtimeMs > lifetime) await rm(path, { force: true });
      }
    }
  }
  const timer = setInterval(() => {
    expire().catch(() => {});
  }, 60000);
  timer.unref();
  function get(id) {
    const session = sessions.get(id);
    if (!session) throw fail(404, "This upload expired. Please choose the video again.");
    session.touched = now();
    return session;
  }
  function status(session) {
    return {
      id: session.id,
      state: session.state,
      received: session.received,
      size: session.size,
      chunkBytes: videoChunkBytes,
      ...(session.result ? { result: session.result } : {}),
      ...(session.error ? { error: session.error } : {}),
    };
  }
  return {
    async start(size) {
      if (!Number.isSafeInteger(size) || size <= 0 || size > videoLimits.maxVideoBytes)
        throw fail(413, "Choose a video of 500 MB or less.");
      await initialize();
      await expire();
      if (
        [...sessions.values()].filter((s) => !["complete", "failed"].includes(s.state)).length >= 2
      )
        throw fail(429, "Other videos are uploading. Please try again shortly.");
      const id = randomBytes(24).toString("hex");
      const session = {
        id,
        path: join(directory, id),
        size,
        received: 0,
        state: "uploading",
        touched: now(),
      };
      // Reserve the slot before yielding to filesystem I/O.
      sessions.set(id, session);
      try {
        await writeFile(session.path, "", { flag: "wx", mode: 0o660 });
      } catch (error) {
        sessions.delete(id);
        throw error;
      }
      return status(session);
    },
    async append(id, index, data) {
      const session = get(id);
      if (session.state !== "uploading" || index !== session.received / videoChunkBytes)
        throw fail(409, "The upload is out of order. Please choose the video again.");
      const expected = Math.min(videoChunkBytes, session.size - session.received);
      if (!expected || data.length !== expected)
        throw fail(400, "An upload part is incomplete. Please try again.");
      session.state = "writing";
      try {
        await appendFile(session.path, data);
        session.received += data.length;
        session.state = "uploading";
      } catch (error) {
        session.state = "failed";
        session.error = "This upload could not be saved. Please try again.";
        await rm(session.path, { force: true });
        throw error;
      }
      return status(session);
    },
    complete(id) {
      const session = get(id);
      if (["processing", "complete", "failed"].includes(session.state)) return status(session);
      if (session.state !== "uploading" || session.received !== session.size)
        throw fail(409, "The video upload is incomplete. Please try again.");
      session.state = "processing";
      // Acknowledge immediately: a ten-minute transcode can outlast an edge request.
      session.job = Promise.resolve()
        .then(async () => {
          const result = await processVideo(
            { path: session.path, size: session.size },
            storageRoot,
          );
          const finalized = session.cancelled ? null : await finalize(result);
          if (session.cancelled) {
            await rm(join(storageRoot, "posts", result.fileId), { recursive: true, force: true });
            return;
          }
          session.result = finalized;
          session.state = "complete";
        })
        .catch((error) => {
          session.state = "failed";
          session.error = error.errorMsg || "This video could not be processed. Please try again.";
        })
        .finally(async () => {
          session.touched = now();
          await rm(session.path, { force: true }).catch(() => {});
          if (session.cancelled) sessions.delete(id);
        });
      return status(session);
    },
    status(id) {
      return status(get(id));
    },
    async cancel(id) {
      const session = get(id);
      if (session.state === "writing") throw fail(409, "An upload part is still being saved.");
      if (session.state === "processing") {
        session.cancelled = true;
        return;
      }
      sessions.delete(id);
      await rm(session.path, { force: true });
    },
    // Used by lifecycle tests; completed media remains owned by its memory flow.
    async close() {
      clearInterval(timer);
      await Promise.all([...sessions.values()].map((s) => s.job));
      await Promise.all([...sessions.values()].map((s) => rm(s.path, { force: true })));
      sessions.clear();
    },
  };
}
