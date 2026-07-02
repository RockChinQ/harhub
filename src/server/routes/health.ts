import path from "node:path";
import type { Express } from "express";
import {
  getStateBackend,
  getStatePath
} from "../../state/index.js";

export function registerHealthRoutes(app: Express): void {
  app.get("/api/health", (_req, res) => {
    const stateBackend = getStateBackend();
    res.json({
      ok: true,
      cwd: process.cwd(),
      stateBackend,
      ...(stateBackend === "local-json"
        ? { statePath: path.resolve(process.cwd(), getStatePath()) }
        : {})
    });
  });
}
