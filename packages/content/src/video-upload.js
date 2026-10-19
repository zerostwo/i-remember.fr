import { uploadRequest } from "./upload-request.js";
import { videoLimits, audioLimits, isAudioFile } from "../../config/src/media-limits.js";

function pause(ms, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      reject(signal.reason || new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
  });
}

export async function uploadVideoFile(file, { signal, onProgress = () => {} } = {}) {
  const audio = isAudioFile(file);
  const endpoint = audio ? "/api/audio-uploads" : "/api/video-uploads";
  if (file.size > (audio ? audioLimits.maxAudioBytes : videoLimits.maxVideoBytes) || file.size <= 0)
    throw new Error(audio ? "Choose audio of 100 MB or less." : "Choose a video of 500 MB or less.");
  async function request(path, options = {}) {
    const response = await fetch(path, { credentials: "same-origin", signal, ...options });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success)
      throw new Error(payload?.errorMsg || "Media upload failed. Please try again.");
    return payload.data;
  }
  onProgress({ phase: "uploading", percent: 0, loaded: 0, total: file.size });
  const session = await request(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ size: file.size }),
  });
  const url = endpoint + "/" + encodeURIComponent(session.id);
  try {
    for (let offset = 0, index = 0; offset < file.size; offset += session.chunkBytes, index++) {
      const end = Math.min(offset + session.chunkBytes, file.size);
      await uploadRequest(url + "/chunks/" + index, {
        signal,
        onProgress: (fraction) => {
          const loaded = offset + (end - offset) * fraction;
          onProgress({ phase: "uploading", percent: Math.floor(loaded / file.size * 100), loaded, total: file.size });
        },
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: file.slice(offset, end),
      });
      onProgress({ phase: "uploading", percent: Math.floor((end / file.size) * 100), loaded: end, total: file.size });
    }
    let state = await request(url + "/complete", { method: "POST" });
    onProgress(state.progress || { phase: "processing", stage: "preparing", percent: null });
    const deadline = Date.now() + 20 * 60 * 1000;
    while (state.state === "processing") {
      if (Date.now() > deadline) throw new Error("Media processing timed out. Please try again.");
      await pause(1500, signal);
      state = await request(url);
      if (state.state === "processing") onProgress(state.progress || { phase: "processing", stage: "preparing", percent: null });
    }
    if (state.state !== "complete")
      throw new Error(state.error || "Media processing failed. Please try again.");
    onProgress({ phase: "complete", percent: 100 });
    return state.result;
  } finally {
    // Release the temporary session on completion, failure or editor cancellation.
    await fetch(url, {
      method: "DELETE",
      credentials: "same-origin",
      signal: AbortSignal.timeout(10000),
    }).catch(() => {});
  }
}
