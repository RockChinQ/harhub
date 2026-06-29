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
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:3300"
    }
  },
  build: {
    outDir: "../../dist/web",
    emptyOutDir: true
  }
});
