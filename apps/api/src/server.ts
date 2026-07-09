import { createServer } from "node:http";
import { createApiV1Middleware } from "./index.js";
import { serveLocalAsset } from "./static-assets.js";

const host = process.env.API_HOST || process.env.HOST || "127.0.0.1";
const port = Number.parseInt(process.env.API_PORT || process.env.PORT || "7892", 10);
const api = createApiV1Middleware();

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/healthz") {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: true, service: "api" }));
    return;
  }

  if (serveLocalAsset(req, res)) return;

  api(req, res, () => {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ success: false, error: { code: "not_found", message: "Not found" } }));
  });
});

server.listen(port, host, () => {
  console.log(`I Remember API listening at http://${host}:${port}/`);
});
