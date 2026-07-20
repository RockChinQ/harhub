import type { Express, Request, RequestHandler } from "express";

import { PUBLIC_APP_URL } from "../config.js";
import type {
  ProjectBindingKind,
  ProjectRepository,
  ProjectRepositoryBindingInput,
  ProjectSyncRequest
} from "../../shared/types.js";
import {
  archiveProject,
  connectProjectRepository,
  createProject,
  freezeForgeSessionAsProject,
  getForgeSession,
  getProject,
  listProjects,
  rotateProjectSyncToken
} from "../../state/index.js";
import { requireWorkspaceAccess } from "../auth.js";
import { loadOrCreateWorkspaceAssetCatalog } from "../services/workspace-catalogs.js";
import {
  getProjectSkillDiff,
  publishProjectSkillFork,
  syncProjectRepositoryBundle
} from "../services/project-skill-forks.js";
import { getBearerToken, sendError, setPrivateNoStore } from "../utils/http.js";

const MAX_PROJECT_NAME_CHARS = 120;
const MAX_PROJECT_DESCRIPTION_CHARS = 2_000;
const MAX_BINDINGS_PER_SYNC = 1_000;
const MAX_BINDING_NAME_CHARS = 200;
const MAX_BINDING_PATH_CHARS = 1_024;

export function registerProjectRoutes(
  app: Express,
  upload: { single(fieldName: string): RequestHandler }
): void {
  app.post("/api/projects/:projectId/sync", upload.single("skills"), async (req, res) => {
    setPrivateNoStore(res);
    try {
      const token = getBearerToken(req);
      if (!token) {
        res.status(401).json({ error: "Project sync credentials are required." });
        return;
      }
      res.json(await syncProjectRepositoryBundle({
        projectId: readRequiredString(req.params.projectId, "projectId", 128),
        token,
        request: readProjectSyncRequestBody(req),
        ...(req.file ? { skillArchive: req.file.buffer } : {})
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sendError(res, error, message.includes("credentials") ? 401 : 400);
    }
  });

  app.get(
    "/api/workspaces/:workspaceId/projects/:projectId/bindings/:bindingId/diff",
    async (req, res) => {
      const context = await requireWorkspaceAccess(req, res);
      if (!context) return;
      setPrivateNoStore(res);
      try {
        res.json(await getProjectSkillDiff({
          accountId: context.account.id,
          workspace: context.workspace,
          projectId: readRequiredString(req.params.projectId, "projectId", 128),
          bindingId: readRequiredString(req.params.bindingId, "bindingId", 128),
          ...(typeof req.query.path === "string" && req.query.path
            ? { selectedPath: readRequiredString(req.query.path, "path", MAX_BINDING_PATH_CHARS) }
            : {})
        }));
      } catch (error) {
        sendError(res, error, 400);
      }
    }
  );

  app.post(
    "/api/workspaces/:workspaceId/projects/:projectId/bindings/:bindingId/publish",
    async (req, res) => {
      const context = await requireWorkspaceAccess(req, res);
      if (!context) return;
      setPrivateNoStore(res);
      try {
        res.json(await publishProjectSkillFork({
          accountId: context.account.id,
          workspace: context.workspace,
          projectId: readRequiredString(req.params.projectId, "projectId", 128),
          bindingId: readRequiredString(req.params.bindingId, "bindingId", 128)
        }));
      } catch (error) {
        sendError(res, error, 400);
      }
    }
  );

  app.get("/api/workspaces/:workspaceId/projects", async (req, res) => {
    const context = await requireWorkspaceAccess(req, res);
    if (!context) return;
    setPrivateNoStore(res);
    try {
      res.json(await listProjects(context.account.id, context.workspace.id));
    } catch (error) {
      sendError(res, error, 400);
    }
  });

  app.post("/api/workspaces/:workspaceId/projects", async (req, res) => {
    const context = await requireWorkspaceAccess(req, res);
    if (!context) return;
    setPrivateNoStore(res);
    try {
      if (!isRecord(req.body)) throw new Error("Expected a JSON object request body");
      res.status(201).json(await createProject({
        accountId: context.account.id,
        workspaceId: context.workspace.id,
        name: readRequiredString(req.body.name, "name", MAX_PROJECT_NAME_CHARS),
        description: readOptionalString(
          req.body.description,
          "description",
          MAX_PROJECT_DESCRIPTION_CHARS
        ) ?? "Tracked repository harness bindings.",
        ...(req.body.repository === undefined
          ? {}
          : { repository: readProjectRepository(req.body.repository, req.body.defaultBranch) })
      }));
    } catch (error) {
      sendError(res, error, 400);
    }
  });

  app.get("/api/workspaces/:workspaceId/projects/:projectId", async (req, res) => {
    const context = await requireWorkspaceAccess(req, res);
    if (!context) return;
    setPrivateNoStore(res);
    try {
      res.json(await getProject(
        context.account.id,
        context.workspace.id,
        readRequiredString(req.params.projectId, "projectId", 128)
      ));
    } catch (error) {
      sendError(res, error, 404);
    }
  });

  app.post(
    "/api/workspaces/:workspaceId/projects/:projectId/rotate-sync-token",
    async (req, res) => {
      const context = await requireWorkspaceAccess(req, res);
      if (!context) return;
      setPrivateNoStore(res);
      try {
        res.json(await rotateProjectSyncToken(
          context.account.id,
          context.workspace.id,
          readRequiredString(req.params.projectId, "projectId", 128)
        ));
      } catch (error) {
        sendError(res, error, 400);
      }
    }
  );

  app.put(
    "/api/workspaces/:workspaceId/projects/:projectId/repository",
    async (req, res) => {
      const context = await requireWorkspaceAccess(req, res);
      if (!context) return;
      setPrivateNoStore(res);
      try {
        if (!isRecord(req.body)) throw new Error("Expected a JSON object request body");
        res.json(await connectProjectRepository(
          context.account.id,
          context.workspace.id,
          readRequiredString(req.params.projectId, "projectId", 128),
          readProjectRepository(req.body.repository, req.body.defaultBranch)
        ));
      } catch (error) {
        sendError(res, error, 400);
      }
    }
  );

  app.delete("/api/workspaces/:workspaceId/projects/:projectId", async (req, res) => {
    const context = await requireWorkspaceAccess(req, res);
    if (!context) return;
    setPrivateNoStore(res);
    try {
      res.json(await archiveProject(
        context.account.id,
        context.workspace.id,
        readRequiredString(req.params.projectId, "projectId", 128)
      ));
    } catch (error) {
      sendError(res, error, 400);
    }
  });

  app.post(
    "/api/workspaces/:workspaceId/forge/sessions/:sessionId/freeze",
    async (req, res) => {
      const context = await requireWorkspaceAccess(req, res);
      if (!context) return;
      setPrivateNoStore(res);
      try {
        if (!isRecord(req.body)) throw new Error("Expected a JSON object request body");
        const sessionId = readRequiredString(req.params.sessionId, "sessionId", 128);
        const session = await getForgeSession(
          context.account.id,
          context.workspace.id,
          sessionId
        );
        const alreadyFrozen = Boolean(session.frozenProject);
        const catalog = await loadOrCreateWorkspaceAssetCatalog(context.workspace);
        const selectedAssetIds = new Set(
          session.template?.selectedAssets.map((asset) => asset.id) ?? []
        );
        const assetDigests = Object.fromEntries(
          catalog.assets.flatMap((asset) =>
            selectedAssetIds.has(asset.id) && asset.storage?.checksum
              ? [[asset.id, asset.storage.checksum]]
              : []
          )
        );
        const result = await freezeForgeSessionAsProject({
          accountId: context.account.id,
          workspaceId: context.workspace.id,
          sessionId,
          name: readRequiredString(req.body.name, "name", MAX_PROJECT_NAME_CHARS),
          description: readOptionalString(
            req.body.description,
            "description",
            MAX_PROJECT_DESCRIPTION_CHARS
          ),
          apiBaseUrl: projectApiBaseUrl(req),
          assetDigests
        });
        res.status(alreadyFrozen ? 200 : 201).json({
          ...result,
          session: await getForgeSession(context.account.id, context.workspace.id, sessionId)
        });
      } catch (error) {
        sendError(res, error, 400);
      }
    }
  );
}

function readProjectSyncRequestBody(req: Request): ProjectSyncRequest {
  const manifest = req.body?.manifest;
  if (typeof manifest !== "string") return readProjectSyncRequest(req.body);
  try {
    return readProjectSyncRequest(JSON.parse(manifest));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("Project sync manifest must be valid JSON.");
    throw error;
  }
}

export function readProjectRepository(
  value: unknown,
  defaultBranchValue?: unknown
): ProjectRepository {
  const raw = typeof value === "string"
    ? value.trim()
    : isRecord(value) && typeof value.url === "string"
      ? value.url.trim()
      : "";
  const match = raw.match(/^(?:https?:\/\/github\.com\/|git@github\.com:)?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/i);
  if (!match) throw new Error("repository must be a GitHub owner/repository or URL");
  const owner = match[1];
  const name = match[2];
  const defaultBranch = readOptionalString(
    defaultBranchValue ?? (isRecord(value) ? value.defaultBranch : undefined),
    "defaultBranch",
    255
  ) ?? "main";
  return {
    provider: "github",
    owner,
    name,
    url: `https://github.com/${owner}/${name}`,
    defaultBranch
  };
}

function readProjectSyncRequest(value: unknown): ProjectSyncRequest {
  if (!isRecord(value)) throw new Error("Expected a JSON object request body");
  if (value.schemaVersion !== 1) throw new Error("Unsupported Project sync schemaVersion");
  if (!Array.isArray(value.bindings)) throw new Error("bindings must be an array");
  if (value.bindings.length > MAX_BINDINGS_PER_SYNC) {
    throw new Error(`Project sync supports at most ${MAX_BINDINGS_PER_SYNC} bindings.`);
  }
  const bindings = value.bindings.map(readRepositoryBinding);
  const keys = new Set(bindings.map((binding) => `${binding.kind}\u0000${binding.path}`));
  if (keys.size !== bindings.length) throw new Error("Project sync bindings must be unique.");
  const commitSha = readRequiredString(value.commitSha, "commitSha", 64);
  if (!/^[a-f0-9]{7,64}$/i.test(commitSha)) throw new Error("commitSha is invalid");
  const runId = readOptionalString(value.runId, "runId", 64);
  if (runId && !/^\d+$/.test(runId)) throw new Error("runId is invalid");
  return {
    schemaVersion: 1,
    repository: readRequiredString(value.repository, "repository", 300),
    commitSha,
    ref: readRequiredString(value.ref, "ref", 255),
    ...(runId ? { runId } : {}),
    bindings
  };
}

function readRepositoryBinding(value: unknown): ProjectRepositoryBindingInput {
  if (!isRecord(value)) throw new Error("Invalid Project binding");
  const kind = value.kind;
  if (kind !== "skill" && kind !== "mcp" && kind !== "rule") {
    throw new Error("Project binding kind is invalid");
  }
  const path = readRequiredString(value.path, "binding path", MAX_BINDING_PATH_CHARS)
    .replace(/\\/g, "/");
  if (
    path.startsWith("/") ||
    path.split("/").includes("..") ||
    !pathMatchesKind(kind, path)
  ) {
    throw new Error("Project binding path is invalid");
  }
  const digest = readRequiredString(value.digest, "binding digest", 64);
  if (!/^[a-f0-9]{64}$/i.test(digest)) throw new Error("Project binding digest is invalid");
  return {
    kind,
    name: readRequiredString(value.name, "binding name", MAX_BINDING_NAME_CHARS),
    path,
    digest: digest.toLowerCase()
  };
}

function pathMatchesKind(kind: ProjectBindingKind, path: string): boolean {
  if (kind === "skill") return /^\.harness\/skills\/[^/]+(?:\/[^/]+)*$/.test(path);
  if (kind === "mcp") return path.startsWith(".harness/mcp/");
  return path.startsWith(".harness/rules/");
}

function projectApiBaseUrl(req: Request): string {
  const configured = PUBLIC_APP_URL?.trim();
  if (configured) return configured;
  return `${req.protocol}://${req.get("host")}`;
}

function readRequiredString(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required`);
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new Error(`${label} is too long`);
  return normalized;
}

function readOptionalString(
  value: unknown,
  label: string,
  maxLength: number
): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return readRequiredString(value, label, maxLength);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
