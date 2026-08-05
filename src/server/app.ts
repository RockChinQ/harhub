import cors from "cors";
import express from "express";
import multer from "multer";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  AUTH_RATE_LIMIT_MAX,
  AUTH_RATE_LIMIT_WINDOW_MS,
  MAX_UPLOAD_BYTES,
  PUBLIC_SHARE_RATE_LIMIT_MAX,
  PUBLIC_SHARE_RATE_LIMIT_WINDOW_MS,
  TRUST_PROXY,
  UPLOAD_RATE_LIMIT_MAX,
  UPLOAD_RATE_LIMIT_WINDOW_MS
} from "./config.js";
import { createRateLimitMiddleware } from "./middleware/rate-limit.js";
import { registerAuditEventRoutes } from "./routes/audit-events.js";
import { registerAssetRoutes } from "./routes/assets.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerForgeRoutes } from "./routes/forge.js";
import { registerGitHubIntegrationRoutes } from "./routes/github-integrations.js";
import { registerGitHubWebhookRoute } from "./routes/github-webhooks.js";
import { registerLegacySkillRoutes } from "./routes/legacy-skills.js";
import { registerOAuthDeviceRoutes } from "./routes/oauth-device.js";
import { registerProjectRoutes } from "./routes/projects.js";
import { registerShareRoutes } from "./routes/shares.js";
import { registerSkillRoutes } from "./routes/skills.js";
import { registerWorkspaceRoutes } from "./routes/workspaces.js";
import { recoverProjectRepositoryScans } from "./services/project-repository-inventory.js";

export function createServerApp() {
  const app = express();
  app.set("trust proxy", TRUST_PROXY);
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: MAX_UPLOAD_BYTES
    }
  });

  app.use(cors());
  registerGitHubWebhookRoute(app);
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false, limit: "32kb" }));

  const authRateLimit = createRateLimitMiddleware({
    windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
    max: AUTH_RATE_LIMIT_MAX
  });
  const uploadRateLimit = createRateLimitMiddleware({
    windowMs: UPLOAD_RATE_LIMIT_WINDOW_MS,
    max: UPLOAD_RATE_LIMIT_MAX
  });
  const publicShareRateLimit = createRateLimitMiddleware({
    windowMs: PUBLIC_SHARE_RATE_LIMIT_WINDOW_MS,
    max: PUBLIC_SHARE_RATE_LIMIT_MAX
  });
  app.use("/api/auth/login", authRateLimit);
  app.use("/api/auth/email-code", authRateLimit);
  app.use("/api/auth/oauth", authRateLimit);
  app.use("/api/oauth/device", authRateLimit);
  app.use("/api/public/shares", publicShareRateLimit);
  app.use("/s", publicShareRateLimit);
  app.use("/api/workspaces/:workspaceId/assets/upload", uploadRateLimit);
  app.use("/api/workspaces/:workspaceId/assets/mcp", uploadRateLimit);
  app.use("/api/workspaces/:workspaceId/assets/import/preview", uploadRateLimit);
  app.use("/api/projects/:projectId/sync", uploadRateLimit);

  registerHealthRoutes(app);
  registerAuthRoutes(app);
  registerOAuthDeviceRoutes(app);
  registerShareRoutes(app);
  registerWorkspaceRoutes(app);
  registerAuditEventRoutes(app);
  registerProjectRoutes(app, upload);
  registerForgeRoutes(app);
  registerGitHubIntegrationRoutes(app);
  registerAssetRoutes(app, upload);
  registerSkillRoutes(app);
  registerLegacySkillRoutes(app);
  registerStaticApp(app);
  recoverProjectRepositoryScans();
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
