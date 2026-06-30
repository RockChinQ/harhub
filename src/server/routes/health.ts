import path from "node:path";
import type { Express } from "express";
import { getStatePath } from "../../state/index.js";

export function registerHealthRoutes(app: Express): void {
  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      cwd: process.cwd(),
      statePath: path.resolve(process.cwd(), getStatePath())
    });
  });
}
