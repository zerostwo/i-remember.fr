import { videoLimits } from "../../config/src/media-limits.js";

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
  if (file.size > videoLimits.maxVideoBytes || file.size <= 0)
    throw new Error("Choose a video of 500 MB or less.");
  async function request(path, options = {}) {
    const response = await fetch(path, { credentials: "same-origin", signal, ...options });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success)
      throw new Error(payload?.errorMsg || "Video upload failed. Please try again.");
    return payload.data;
  }
  const session = await request("/api/video-uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ size: file.size }),
  });
  const url = "/api/video-uploads/" + encodeURIComponent(session.id);
  try {
    for (let offset = 0, index = 0; offset < file.size; offset += session.chunkBytes, index++) {
      const end = Math.min(offset + session.chunkBytes, file.size);
      await request(url + "/chunks/" + index, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: file.slice(offset, end),
      });
      onProgress({ phase: "uploading", percent: Math.round((end / file.size) * 100) });
    }
    let state = await request(url + "/complete", { method: "POST" });
    onProgress({ phase: "processing", percent: 100 });
    const deadline = Date.now() + 20 * 60 * 1000;
    while (state.state === "processing") {
      if (Date.now() > deadline) throw new Error("Video processing timed out. Please try again.");
      await pause(1500, signal);
      state = await request(url);
    }
    if (state.state !== "complete")
      throw new Error(state.error || "Video processing failed. Please try again.");
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
