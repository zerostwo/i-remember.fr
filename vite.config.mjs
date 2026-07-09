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
      "@i-remember/ui": resolve(rootDir, "packages/ui/src/index.js"),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(rootDir, "index.html"),
        admin: resolve(rootDir, "admin.html"),
      },
    },
  },
});
