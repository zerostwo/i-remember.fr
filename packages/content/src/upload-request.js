// XHR exposes actual bytes sent; fetch is retained for non-browser API clients.
export function uploadRequest(url, { method = "POST", body, headers = {}, signal, onProgress = () => {}, onUploaded = () => {} } = {}) {
  if (typeof XMLHttpRequest === "undefined")
    return fetch(url, { method, body, headers, signal, credentials: "same-origin" }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok || payload.success === false) throw new Error(payload.errorMsg || payload.error?.message || "Upload failed. Please try again.");
      return payload;
    });
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const cleanup = () => signal?.removeEventListener("abort", abort);
    xhr.open(method, url);
    for (const [key, value] of Object.entries(headers)) xhr.setRequestHeader(key, value);
    xhr.responseType = "json";
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.upload.onload = () => { onProgress(1); onUploaded(); };
    xhr.onload = () => {
      cleanup();
      const payload = xhr.response;
      if (xhr.status < 200 || xhr.status >= 300 || !payload || payload.success === false)
        reject(new Error(payload?.errorMsg || payload?.error?.message || "Upload failed. Please try again."));
      else resolve(payload);
    };
    xhr.onerror = () => { cleanup(); reject(new Error("Connection lost. Please try again.")); };
    xhr.onabort = () => { cleanup(); reject(signal?.reason || new DOMException("Aborted", "AbortError")); };
    if (signal?.aborted) { reject(signal.reason || new DOMException("Aborted", "AbortError")); return; }
    signal?.addEventListener("abort", abort, { once: true });
    xhr.send(body);
  });
}
