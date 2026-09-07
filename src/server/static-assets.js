import { createReadStream, statSync } from "node:fs";
import { pipeline } from "node:stream";

// RFC 9110 byte ranges refer to offsets, while a suffix is a byte count.
export function byteRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!match) return null; // Unsupported or malformed ranges may be ignored.
  if ((!match[1] && !match[2]) || !size) return false;
  const length = BigInt(size);
  if (!match[1]) {
    const suffix = BigInt(match[2]);
    return suffix
      ? { start: Number(suffix >= length ? 0n : length - suffix), end: size - 1 }
      : false;
  }
  const start = BigInt(match[1]);
  const end = match[2] ? BigInt(match[2]) : length - 1n;
  if (start >= length || end < start) return false;
  return { start: Number(start), end: Number(end < length ? end : length - 1n) };
}

function encodingPreferences(header) {
  const values = new Map();
  for (const entry of String(header || "")
    .toLowerCase()
    .split(",")) {
    const [name, ...parameters] = entry.trim().split(";");
    const weight = parameters.find((value) => value.trim().startsWith("q="));
    const quality = weight === undefined ? 1 : Number(weight.trim().slice(2));
    values.set(name, Number.isFinite(quality) && quality >= 0 && quality <= 1 ? quality : 0);
  }
  const candidates = ["br", "gzip"].map((name) => ({
    name,
    quality: values.get(name) ?? values.get("*") ?? 0,
  }));
  // Prefer compression unless the client explicitly prefers identity. Identity
  // remains acceptable by default, except when it or the wildcard is excluded.
  candidates.push({
    name: "identity",
    quality: values.get("identity") ?? (values.get("*") === 0 ? 0 : 0.001),
  });
  return candidates.filter(({ quality }) => quality > 0).sort((a, b) => b.quality - a.quality);
}

function representation(req, filePath, stat) {
  // Audio stays byte-for-byte identical. Partial transfers always use identity.
  const candidates = encodingPreferences(req.headers["accept-encoding"]);
  if (req.headers.range && candidates.some(({ name }) => name === "identity"))
    return { path: filePath, stat, encoding: "identity" };
  for (const { name } of candidates) {
    if (name === "identity") return { path: filePath, stat, encoding: "identity" };
    const path = filePath + (name === "br" ? ".br" : ".gz");
    try {
      const compressed = statSync(path);
      if (compressed.isFile() && compressed.mtimeMs >= stat.mtimeMs) {
        return { path, stat: compressed, encoding: name };
      }
    } catch {
      /* A build without precompression still serves the original asset. */
    }
  }
  return null;
}

export function serveAsset(req, res, filePath, stat, contentType) {
  const selected = representation(req, filePath, stat);
  if (!selected) {
    res.statusCode = 406;
    res.setHeader("Vary", "Accept-Encoding");
    res.setHeader("Cache-Control", "no-store");
    res.end();
    return;
  }
  const etag = `W/"${selected.stat.size.toString(16)}-${selected.stat.mtimeMs.toString(16)}-${selected.encoding}"`;
  const modified = new Date(stat.mtimeMs).toUTCString();
  res.setHeader("Content-Type", contentType);
  res.setHeader("Vary", "Accept-Encoding");
  res.setHeader("ETag", etag);
  res.setHeader("Last-Modified", modified);
  res.setHeader("Accept-Ranges", "bytes");
  // Entry documents and stable asset URLs must revalidate after deployments.
  // Content-hashed Vite assets can safely be retained for a year.
  const hashed =
    !filePath.endsWith("/assets/public-markdown.js") &&
    /[/\\]assets[/\\].+-[\w-]{8}\.[\w]+$/.test(filePath);
  res.setHeader(
    "Cache-Control",
    hashed ? "public, max-age=31536000, immutable" : "public, max-age=0, must-revalidate",
  );
  if (selected.encoding !== "identity") res.setHeader("Content-Encoding", selected.encoding);

  const noneMatch = req.headers["if-none-match"];
  const match = noneMatch
    ? noneMatch
        .split(",")
        .some(
          (candidate) =>
            candidate.trim() === "*" ||
            candidate.trim().replace(/^W\//, "") === etag.replace(/^W\//, ""),
        )
    : req.headers["if-modified-since"] &&
      Date.parse(req.headers["if-modified-since"]) >= Date.parse(modified);
  if (match) {
    res.statusCode = 304;
    res.end();
    return;
  }

  // A weak ETag cannot validate If-Range. An unchanged date can.
  const ifRange = req.headers["if-range"];
  const rangeAllowed = !ifRange || ifRange === modified;
  const range =
    req.method === "GET" && selected.encoding === "identity" && rangeAllowed
      ? byteRange(req.headers.range, stat.size)
      : null;
  if (range === false) {
    res.statusCode = 416;
    res.setHeader("Content-Range", `bytes */${stat.size}`);
    res.setHeader("Content-Length", "0");
    res.end();
    return;
  }

  res.statusCode = range ? 206 : 200;
  if (range) res.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${stat.size}`);
  res.setHeader("Content-Length", String(range ? range.end - range.start + 1 : selected.stat.size));
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  // Pipeline closes the file descriptor when a tab cancels an asset download.
  pipeline(createReadStream(selected.path, range || undefined), res, () => {});
}
