import { createServer } from "node:http";
import { createApiV1Middleware } from "./index.js";
import { serveLocalAsset } from "./static-assets.js";

function boundedEnvironmentInteger(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = Number.parseInt(String(process.env[name] || ""), 10);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

const host = process.env.API_HOST || process.env.HOST || "127.0.0.1";
const port = boundedEnvironmentInteger(process.env.API_PORT ? "API_PORT" : "PORT", 7892, 1, 65_535);
const api = createApiV1Middleware();

const server = createServer(
  {
    maxHeaderSize: boundedEnvironmentInteger(
      "API_MAX_HEADER_BYTES",
      16 * 1024,
      8 * 1024,
      64 * 1024,
    ),
  },
  (req, res) => {
    if (req.method === "GET" && req.url === "/healthz") {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ ok: true, service: "api" }));
      return;
    }

    if (serveLocalAsset(req, res)) return;

    api(req, res, () => {
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(
        JSON.stringify({ success: false, error: { code: "not_found", message: "Not found" } }),
      );
    });
  },
);

server.requestTimeout = boundedEnvironmentInteger("API_REQUEST_TIMEOUT_MS", 30_000, 5000, 120_000);
server.headersTimeout = boundedEnvironmentInteger("API_HEADERS_TIMEOUT_MS", 10_000, 1000, 60_000);
server.keepAliveTimeout = boundedEnvironmentInteger(
  "API_KEEP_ALIVE_TIMEOUT_MS",
  5000,
  1000,
  30_000,
);
server.maxHeadersCount = boundedEnvironmentInteger("API_MAX_HEADERS_COUNT", 100, 20, 500);
server.maxRequestsPerSocket = boundedEnvironmentInteger(
  "API_MAX_REQUESTS_PER_SOCKET",
  100,
  1,
  1000,
);
server.setTimeout(
  boundedEnvironmentInteger("API_SOCKET_TIMEOUT_MS", 30_000, 5000, 120_000),
  (socket) => socket.destroy(),
);
server.on("clientError", (_error, socket) => {
  if (socket.writable) {
    socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
  }
});
server.on("error", (error) => {
  console.error("API server failed", error);
});

server.listen(port, host, () => {
  console.log(`I Remember API listening at http://${host}:${port}/`);
});
