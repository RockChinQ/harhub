import cors from "cors";
import express from "express";
import multer from "multer";
import { existsSync } from "node:fs";
import path from "node:path";
import { MAX_UPLOAD_BYTES } from "./config.js";
import { registerAssetRoutes } from "./routes/assets.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerForgeRoutes } from "./routes/forge.js";
import { registerLegacySkillRoutes } from "./routes/legacy-skills.js";
import { registerOAuthDeviceRoutes } from "./routes/oauth-device.js";
import { registerProjectRoutes } from "./routes/projects.js";
import { registerShareRoutes } from "./routes/shares.js";
import { registerSkillRoutes } from "./routes/skills.js";
import { registerWorkspaceRoutes } from "./routes/workspaces.js";

export function createServerApp() {
  const app = express();
  app.set("trust proxy", true);
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: MAX_UPLOAD_BYTES
    }
  });

  app.use(cors());
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false, limit: "32kb" }));

  registerHealthRoutes(app);
  registerAuthRoutes(app);
  registerOAuthDeviceRoutes(app);
  registerShareRoutes(app);
  registerWorkspaceRoutes(app);
  registerProjectRoutes(app);
  registerForgeRoutes(app);
  registerAssetRoutes(app, upload);
  registerSkillRoutes(app);
  registerLegacySkillRoutes(app);
  registerStaticApp(app);
  return app;
}

function registerStaticApp(app: ReturnType<typeof express>): void {
  const webRoot = path.resolve(process.cwd(), "dist/web");
  if (!existsSync(webRoot)) return;

  app.use(express.static(webRoot));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(webRoot, "index.html"));
  });
}
