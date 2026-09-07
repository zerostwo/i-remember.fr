import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createViteRevivalPlugin } from "./src/server/revival.js";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: rootDir,
  plugins: [react(), tailwindcss(), createViteRevivalPlugin()],
  resolve: {
    alias: {
      "@": resolve(rootDir, "src"),
      "@i-remember/memory-engine": resolve(rootDir, "packages/memory-engine/src/index.js"),
      "@i-remember/ui": resolve(rootDir, "packages/ui/src/index.js"),
    },
  },
  server: {
    proxy: {
      "/api/v1": {
        target: process.env.API_BASE_URL || "http://127.0.0.1:7892",
        changeOrigin: false,
      },
      "/uploads/admin": {
        target: process.env.API_BASE_URL || "http://127.0.0.1:7892",
        changeOrigin: false,
      },
    },
  },
  preview: {
    proxy: {
      "/api/v1": {
        target: process.env.API_BASE_URL || "http://127.0.0.1:7892",
        changeOrigin: false,
      },
      "/uploads/admin": {
        target: process.env.API_BASE_URL || "http://127.0.0.1:7892",
        changeOrigin: false,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        entryFileNames: (chunk) =>
          chunk.name === "publicMarkdown" ? "assets/public-markdown.js" : "assets/[name]-[hash].js",
      },
      input: {
        main: resolve(rootDir, "index.html"),
        admin: resolve(rootDir, "admin.html"),
        publicMarkdown: resolve(rootDir, "src/public-markdown.js"),
      },
    },
  },
});
