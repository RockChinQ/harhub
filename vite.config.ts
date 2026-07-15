import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  root: "src/web",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src/web/src")
    }
  },
  server: {
    port: 5176,
    proxy: {
      "/api": process.env.HARHUB_API_TARGET ?? "http://127.0.0.1:3310",
      "/.well-known": process.env.HARHUB_API_TARGET ?? "http://127.0.0.1:3310"
    }
  },
  build: {
    outDir: "../../dist/web",
    emptyOutDir: true
  }
});
