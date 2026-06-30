import cors from "cors";
import express, { type Request, type Response } from "express";
import multer from "multer";
import JSZip, { type JSZipObject } from "jszip";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  assetCatalogToSkillCatalog,
  createAssetCatalog,
  createUploadedSkillAsset,
  filterAssets,
  findAsset,
  removeCatalogAsset,
  readAssetCatalog,
  updateCatalogAsset,
  upsertAsset,
  writeAssetCatalog
} from "./assets.js";
import {
  createCatalog,
  readCatalog,
  writeCatalog
} from "./catalog.js";
import {
  deleteSkill,
  createSkillSkeleton,
  filterCatalog,
  findSkill,
  scanSkills,
  updateSkillMetadata,
  validateSkills
} from "./skills.js";
import {
  authenticate,
  addWorkspaceMember,
  changeAccountPassword,
  createSession,
  createWorkspaceForAccount,
  deleteSession,
  getWorkspaceAssetCatalogPath,
  getStatePath,
  getWorkspaceCatalogPath,
  listWorkspaceMembers,
  listAccountWorkspaces,
  loadState,
  loginAccount,
  removeWorkspaceMember,
  signUpAccount,
  updateAccountProfile,
  updateWorkspaceMemberRole,
  updateWorkspaceForAccount
} from "./state.js";
import {
  deleteStoredObject,
  getStorageStatus,
  readStoredObject,
  uploadSkillZipObject
} from "./storage.js";
import { contentHash } from "./markdown.js";
import type {
  AccountProfile,
  AssetCatalog,
  AssetFilePreview,
  AssetFileSummary,
  AssetFileTreeNode,
  AssetRecord,
  SkillCatalog,
  ValidationIssue,
  WorkspaceRecord
} from "./types.js";

const PORT = Number(process.env.PORT ?? 3310);
const MAX_UPLOAD_BYTES = Number(process.env.HARHUB_MAX_UPLOAD_BYTES ?? 25 * 1024 * 1024);
const MAX_PREVIEW_BYTES = 256 * 1024;
const MAX_PREVIEW_CHARS = 120_000;

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_BYTES
  }
});

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    cwd: process.cwd(),
    statePath: path.resolve(process.cwd(), getStatePath())
  });
});

app.get("/api/session", (req, res) => {
  const context = getAuthContext(req);
  if (!context) {
    res.status(401).json({
      error: "Not signed in",
      demo: {
        email: "admin@harhub.local",
        password: "harhub"
      }
    });
    return;
  }

  res.json(buildSessionPayload(context.account));
});

app.post("/api/auth/login", (req, res) => {
  try {
    const account = loginAccount(String(req.body?.email ?? ""), String(req.body?.password ?? ""));
    const token = createSession(account.id);
    res.json({
      token,
      ...buildSessionPayload(account)
    });
  } catch (error) {
    sendError(res, error, 401);
  }
});

app.post("/api/auth/signup", (req, res) => {
  try {
    const account = signUpAccount({
      email: String(req.body?.email ?? ""),
      name: String(req.body?.name ?? ""),
      password: String(req.body?.password ?? ""),
      workspaceName:
        typeof req.body?.workspaceName === "string" ? req.body.workspaceName : undefined
    });
    const token = createSession(account.id);
    res.status(201).json({
      token,
      ...buildSessionPayload(account)
    });
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.post("/api/auth/logout", (req, res) => {
  const token = getBearerToken(req);
  if (token) deleteSession(token);
  res.status(204).send();
});

app.patch("/api/account", (req, res) => {
  const context = requireAuth(req, res);
  if (!context) return;

  try {
    const account = updateAccountProfile(context.account.id, {
      name: typeof req.body?.name === "string" ? req.body.name : undefined,
      email: typeof req.body?.email === "string" ? req.body.email : undefined
    });
    res.json(buildSessionPayload(account));
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.post("/api/account/password", (req, res) => {
  const context = requireAuth(req, res);
  if (!context) return;

  try {
    changeAccountPassword(context.account.id, {
      currentPassword: String(req.body?.currentPassword ?? ""),
      newPassword: String(req.body?.newPassword ?? "")
    });
    res.status(204).send();
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.get("/api/workspaces", (req, res) => {
  const context = requireAuth(req, res);
  if (!context) return;
  res.json(buildSessionPayload(context.account));
});

app.post("/api/workspaces", (req, res) => {
  const context = requireAuth(req, res);
  if (!context) return;

  try {
    const workspace = createWorkspaceForAccount(context.account.id, {
      name: String(req.body?.name ?? ""),
      defaultScanPaths: readOptionalPathList(req.body?.defaultScanPaths),
      skillRoot:
        typeof req.body?.skillRoot === "string" ? req.body.skillRoot : undefined
    });
    res.status(201).json({
      workspace,
      ...buildSessionPayload(context.account)
    });
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.patch("/api/workspaces/:workspaceId", (req, res) => {
  const context = requireAuth(req, res);
  if (!context) return;

  try {
    const workspace = updateWorkspaceForAccount(context.account.id, req.params.workspaceId, {
      name: typeof req.body?.name === "string" ? req.body.name : undefined,
      defaultScanPaths: readOptionalPathList(req.body?.defaultScanPaths),
      skillRoot:
        typeof req.body?.skillRoot === "string" ? req.body.skillRoot : undefined
    });
    res.json({
      workspace,
      ...buildSessionPayload(context.account)
    });
  } catch (error) {
    sendError(res, error, 403);
  }
});

app.get("/api/workspaces/:workspaceId/members", (req, res) => {
  const context = requireWorkspaceAccess(req, res);
  if (!context) return;

  try {
    res.json({
      workspace: context.workspace,
      members: listWorkspaceMembers(context.account.id, context.workspace.id)
    });
  } catch (error) {
    sendError(res, error, 403);
  }
});

app.post("/api/workspaces/:workspaceId/members", (req, res) => {
  const context = requireWorkspaceAccess(req, res);
  if (!context) return;

  try {
    const member = addWorkspaceMember(context.account.id, context.workspace.id, {
      email: String(req.body?.email ?? ""),
      role: readWorkspaceRole(req.body?.role)
    });
    res.status(201).json({
      workspace: context.workspace,
      member,
      members: listWorkspaceMembers(context.account.id, context.workspace.id)
    });
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.patch("/api/workspaces/:workspaceId/members/:membershipId", (req, res) => {
  const context = requireWorkspaceAccess(req, res);
  if (!context) return;

  try {
    const member = updateWorkspaceMemberRole(
      context.account.id,
      context.workspace.id,
      req.params.membershipId,
      readWorkspaceRole(req.body?.role)
    );
    res.json({
      workspace: context.workspace,
      member,
      members: listWorkspaceMembers(context.account.id, context.workspace.id)
    });
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.delete("/api/workspaces/:workspaceId/members/:membershipId", (req, res) => {
  const context = requireWorkspaceAccess(req, res);
  if (!context) return;

  try {
    removeWorkspaceMember(context.account.id, context.workspace.id, req.params.membershipId);
    res.status(204).send();
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.get("/api/workspaces/:workspaceId/assets", (req, res) => {
  const context = requireWorkspaceAccess(req, res);
  if (!context) return;

  const catalog = loadOrCreateWorkspaceAssetCatalog(context.workspace);
  const assets = filterAssets(catalog, {
    kind: stringQuery(req.query.kind),
    tag: stringQuery(req.query.tag),
    owner: stringQuery(req.query.owner),
    packageName: stringQuery(req.query.package)
  });

  res.json({
    workspace: context.workspace,
    catalogPath: getWorkspaceAssetCatalogPath(context.workspace.id),
    generatedAt: catalog.generatedAt,
    storage: getStorageStatus(),
    assets,
    skills: assets
      .map((asset) => asset.skill)
      .filter((skill): skill is SkillCatalog["skills"][number] => Boolean(skill))
  });
});

app.get("/api/workspaces/:workspaceId/assets/:query/preview", async (req, res) => {
  const context = requireWorkspaceAccess(req, res);
  if (!context) return;

  try {
    const catalog = loadOrCreateWorkspaceAssetCatalog(context.workspace);
    const asset = findAsset(catalog, req.params.query);
    if (!asset) {
      res.status(404).json({ error: "Asset not found" });
      return;
    }

    if (!asset.storage) {
      res.status(400).json({ error: "Asset has no stored zip to preview." });
      return;
    }

    const buffer = await readStoredObject(asset.storage);
    const zip = await JSZip.loadAsync(buffer);
    const entries = Object.values(zip.files)
      .filter((entry) => !entry.dir)
      .sort((a, b) => a.name.localeCompare(b.name));
    const requestedPath = stringQuery(req.query.path);
    const fallbackPath = metadataString(asset, "skillEntry") || entries[0]?.name;
    const selectedEntry = entries.find((entry) => entry.name === (requestedPath || fallbackPath));

    res.json({
      asset,
      tree: buildZipTree(entries),
      files: entries.map(zipEntrySummary),
      selectedFile: selectedEntry ? await zipEntryPreview(selectedEntry) : undefined
    });
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.get("/api/workspaces/:workspaceId/assets/:query", (req, res) => {
  const context = requireWorkspaceAccess(req, res);
  if (!context) return;

  const catalog = loadOrCreateWorkspaceAssetCatalog(context.workspace);
  const asset = findAsset(catalog, req.params.query);

  if (!asset) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }

  res.json(asset);
});

app.post("/api/workspaces/:workspaceId/assets/scan", (req, res) => {
  const context = requireWorkspaceAccess(req, res);
  if (!context) return;

  const roots = readPathList(req.body?.paths, context.workspace.defaultScanPaths);
  const response = scanAndPersistWorkspace(context.workspace, roots);
  res.status(hasErrors(response.issues) ? 422 : 200).json(response);
});

app.post("/api/workspaces/:workspaceId/assets/validate", (req, res) => {
  const context = requireWorkspaceAccess(req, res);
  if (!context) return;

  const roots = readPathList(req.body?.paths, context.workspace.defaultScanPaths);
  const skills = scanSkills({ roots });
  const issues = validateSkills(skills);
  const assetCatalog = createAssetCatalog(skills, issues);

  res.status(hasErrors(issues) ? 422 : 200).json({
    workspace: context.workspace,
    assets: assetCatalog.assets,
    skills,
    issues
  });
});

app.post("/api/workspaces/:workspaceId/assets/upload", upload.single("file"), async (req, res) => {
  const context = requireWorkspaceAccess(req, res);
  if (!context) return;

  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "A zip file is required." });
    return;
  }

  let uploaded: AssetRecord["storage"] | undefined;
  try {
    const requestedName =
      typeof req.body?.name === "string" && req.body.name.trim()
        ? req.body.name.trim()
        : path.basename(file.originalname, path.extname(file.originalname));
    const checksum = contentHash(file.buffer);

    uploaded = await uploadSkillZipObject({
      workspaceId: context.workspace.id,
      objectName: requestedName,
      originalName: file.originalname,
      body: file.buffer,
      contentType: file.mimetype || "application/zip",
      checksum
    });

    const asset = await createUploadedSkillAsset({
      workspaceId: context.workspace.id,
      fileName: file.originalname,
      buffer: file.buffer,
      storage: uploaded,
      name: requestedName,
      description:
        typeof req.body?.description === "string" ? req.body.description : undefined,
      owner: typeof req.body?.owner === "string" ? req.body.owner : context.account.name,
      tags: readOptionalStringList(req.body?.tags)
    });
    const catalog = upsertAsset(loadOrCreateWorkspaceAssetCatalog(context.workspace), asset);
    writeAssetCatalog(getWorkspaceAssetCatalogPath(context.workspace.id), catalog);

    res.status(201).json({
      workspace: context.workspace,
      catalogPath: getWorkspaceAssetCatalogPath(context.workspace.id),
      generatedAt: catalog.generatedAt,
      storage: getStorageStatus(),
      uploaded: asset,
      assets: catalog.assets,
      skills: catalog.skills,
      issues: []
    });
  } catch (error) {
    if (uploaded) {
      await deleteStoredObject(uploaded).catch(() => undefined);
    }
    sendError(res, error, 400);
  }
});

app.post("/api/workspaces/:workspaceId/assets", (req, res) => {
  const context = requireWorkspaceAccess(req, res);
  if (!context) return;

  if (String(req.body?.kind ?? "skill") !== "skill") {
    res.status(400).json({ error: "Only skill assets are supported in this MVP." });
    return;
  }

  createSkillAsset(req, res, context.workspace, context.account.name);
});

app.patch("/api/workspaces/:workspaceId/assets/:query", (req, res) => {
  const context = requireWorkspaceAccess(req, res);
  if (!context) return;

  try {
    const catalog = loadOrCreateWorkspaceAssetCatalog(context.workspace);
    const asset = findAsset(catalog, req.params.query);
    if (!asset) {
      res.status(404).json({ error: "Asset not found" });
      return;
    }

    if (!asset.skill) {
      const nextCatalog = updateCatalogAsset(catalog, asset.id, {
        description:
          typeof req.body?.description === "string" ? req.body.description : undefined,
        owner: typeof req.body?.owner === "string" ? req.body.owner : undefined,
        tags: Array.isArray(req.body?.tags)
          ? req.body.tags.filter((tag: unknown): tag is string => typeof tag === "string")
          : undefined,
        lifecycleState:
          typeof req.body?.lifecycleState === "string"
            ? req.body.lifecycleState
            : undefined,
        agents: Array.isArray(req.body?.agents)
          ? req.body.agents.filter((agent: unknown): agent is string => typeof agent === "string")
          : undefined
      });
      writeAssetCatalog(getWorkspaceAssetCatalogPath(context.workspace.id), nextCatalog);
      res.json({
        workspace: context.workspace,
        catalogPath: getWorkspaceAssetCatalogPath(context.workspace.id),
        generatedAt: nextCatalog.generatedAt,
        storage: getStorageStatus(),
        assets: nextCatalog.assets,
        skills: nextCatalog.skills,
        issues: []
      });
      return;
    }

    updateSkillMetadata(asset.skill, {
      description:
        typeof req.body?.description === "string" ? req.body.description : undefined,
      owner: typeof req.body?.owner === "string" ? req.body.owner : undefined,
      tags: Array.isArray(req.body?.tags)
        ? req.body.tags.filter((tag: unknown): tag is string => typeof tag === "string")
        : undefined,
      lifecycleState:
        typeof req.body?.lifecycleState === "string"
          ? req.body.lifecycleState
          : undefined,
      agents: Array.isArray(req.body?.agents)
        ? req.body.agents.filter((agent: unknown): agent is string => typeof agent === "string")
        : undefined
    });

    res.json(
      scanAndPersistWorkspace(
        context.workspace,
        unique([context.workspace.skillRoot, ...context.workspace.defaultScanPaths])
      )
    );
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.delete("/api/workspaces/:workspaceId/assets/:query", async (req, res) => {
  const context = requireWorkspaceAccess(req, res);
  if (!context) return;

  try {
    const catalog = loadOrCreateWorkspaceAssetCatalog(context.workspace);
    const asset = findAsset(catalog, req.params.query);
    if (!asset) {
      res.status(404).json({ error: "Asset not found" });
      return;
    }

    if (asset.storage) {
      await deleteStoredObject(asset.storage);
      const nextCatalog = removeCatalogAsset(catalog, asset.id);
      writeAssetCatalog(getWorkspaceAssetCatalogPath(context.workspace.id), nextCatalog);
      res.json({
        workspace: context.workspace,
        catalogPath: getWorkspaceAssetCatalogPath(context.workspace.id),
        generatedAt: nextCatalog.generatedAt,
        storage: getStorageStatus(),
        assets: nextCatalog.assets,
        skills: nextCatalog.skills,
        issues: []
      });
      return;
    }

    if (!asset.skill) {
      res.status(400).json({ error: "Asset has no removable storage object." });
      return;
    }

    deleteSkill(asset.skill);
    res.json(
      scanAndPersistWorkspace(
        context.workspace,
        unique([context.workspace.skillRoot, ...context.workspace.defaultScanPaths])
      )
    );
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.get("/api/workspaces/:workspaceId/skills", (req, res) => {
  const context = requireWorkspaceAccess(req, res);
  if (!context) return;

  const catalog = loadOrCreateWorkspaceCatalog(context.workspace);
  const skills = filterCatalog(catalog, {
    tag: stringQuery(req.query.tag),
    owner: stringQuery(req.query.owner),
    packageName: stringQuery(req.query.package)
  });

  res.json({
    workspace: context.workspace,
    catalogPath: getWorkspaceCatalogPath(context.workspace.id),
    generatedAt: catalog.generatedAt,
    skills
  });
});

app.get("/api/workspaces/:workspaceId/skills/:query", (req, res) => {
  const context = requireWorkspaceAccess(req, res);
  if (!context) return;

  const catalog = loadOrCreateWorkspaceCatalog(context.workspace);
  const skill = findSkill(catalog, req.params.query);

  if (!skill) {
    res.status(404).json({ error: "Skill not found" });
    return;
  }

  res.json(skill);
});

app.post("/api/workspaces/:workspaceId/skills/scan", (req, res) => {
  const context = requireWorkspaceAccess(req, res);
  if (!context) return;

  const roots = readPathList(req.body?.paths, context.workspace.defaultScanPaths);
  const response = scanAndPersistWorkspace(context.workspace, roots);
  res.status(hasErrors(response.issues) ? 422 : 200).json(response);
});

app.post("/api/workspaces/:workspaceId/skills/validate", (req, res) => {
  const context = requireWorkspaceAccess(req, res);
  if (!context) return;

  const roots = readPathList(req.body?.paths, context.workspace.defaultScanPaths);
  const skills = scanSkills({ roots });
  const issues = validateSkills(skills);

  res.status(hasErrors(issues) ? 422 : 200).json({
    workspace: context.workspace,
    skills,
    issues
  });
});

app.post("/api/workspaces/:workspaceId/skills", (req, res) => {
  const context = requireWorkspaceAccess(req, res);
  if (!context) return;

  createSkillAsset(req, res, context.workspace, context.account.name);
});

// Backward-compatible demo workspace routes used by older smoke tests.
app.get("/api/skills", (req, res) => {
  const workspace = getDemoWorkspace();
  const catalog = loadOrCreateWorkspaceCatalog(workspace);
  const skills = filterCatalog(catalog, {
    tag: stringQuery(req.query.tag),
    owner: stringQuery(req.query.owner),
    packageName: stringQuery(req.query.package)
  });
  res.json({
    workspace,
    catalogPath: getWorkspaceCatalogPath(workspace.id),
    generatedAt: catalog.generatedAt,
    skills
  });
});

app.post("/api/skills/scan", (req, res) => {
  const workspace = getDemoWorkspace();
  const response = scanAndPersistWorkspace(
    workspace,
    readPathList(req.body?.paths, workspace.defaultScanPaths)
  );
  res.status(hasErrors(response.issues) ? 422 : 200).json(response);
});

const webRoot = path.resolve(process.cwd(), "dist/web");
if (existsSync(webRoot)) {
  app.use(express.static(webRoot));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(webRoot, "index.html"));
  });
}

app.listen(PORT, "127.0.0.1", () => {
  console.log(`Harhub API listening on http://127.0.0.1:${PORT}`);
});

function buildSessionPayload(account: AccountProfile) {
  return listAccountWorkspaces(account.id);
}

function getAuthContext(req: Request) {
  return authenticate(getBearerToken(req));
}

function requireAuth(req: Request, res: Response) {
  const context = getAuthContext(req);
  if (!context) {
    res.status(401).json({ error: "Authentication required" });
    return undefined;
  }
  return context;
}

function requireWorkspaceAccess(req: Request, res: Response) {
  const context = requireAuth(req, res);
  if (!context) return undefined;

  const payload = listAccountWorkspaces(context.account.id);
  const workspace = payload.workspaces.find(
    (item) => item.id === req.params.workspaceId
  );
  const membership = payload.memberships.find(
    (item) => item.workspaceId === req.params.workspaceId
  );

  if (!workspace || !membership) {
    res.status(404).json({ error: "Workspace not found" });
    return undefined;
  }

  return {
    ...context,
    workspace,
    membership
  };
}

function loadOrCreateWorkspaceCatalog(workspace: WorkspaceRecord): SkillCatalog {
  const assetPath = getWorkspaceAssetCatalogPath(workspace.id);
  if (existsSync(assetPath)) {
    return assetCatalogToSkillCatalog(readAssetCatalog(assetPath));
  }

  const catalogPath = getWorkspaceCatalogPath(workspace.id);
  if (existsSync(catalogPath)) {
    const catalog = readCatalog(catalogPath);
    const needsRefresh = catalog.workspaceId !== workspace.id ||
      catalog.skills.some((skill) => !skill.displayName || !skill.resources);
    if (!needsRefresh) return catalog;
  }

  return scanAndPersistWorkspace(workspace, workspace.defaultScanPaths).catalog;
}

function loadOrCreateWorkspaceAssetCatalog(workspace: WorkspaceRecord): AssetCatalog {
  const catalogPath = getWorkspaceAssetCatalogPath(workspace.id);
  if (existsSync(catalogPath)) {
    const catalog = readAssetCatalog(catalogPath);
    const needsRefresh = catalog.workspaceId !== workspace.id ||
      catalog.assets.some((asset) => !asset.displayName || !asset.kind);
    if (!needsRefresh) return catalog;
  }

  return scanAndPersistWorkspace(workspace, workspace.defaultScanPaths).assetCatalog;
}

function scanAndPersistWorkspace(workspace: WorkspaceRecord, roots: string[]) {
  const previousAssetCatalog = existsSync(getWorkspaceAssetCatalogPath(workspace.id))
    ? readAssetCatalog(getWorkspaceAssetCatalogPath(workspace.id))
    : undefined;
  const skills = scanSkills({ roots });
  const issues = validateSkills(skills);
  const catalog = {
    ...createCatalog(skills),
    workspaceId: workspace.id
  };
  const storedAssets = previousAssetCatalog?.assets.filter((asset) => asset.storage) ?? [];
  const scannedAssetCatalog = createAssetCatalog(skills, issues);
  const assetCatalog = {
    ...scannedAssetCatalog,
    workspaceId: workspace.id,
    assets: [
      ...scannedAssetCatalog.assets,
      ...storedAssets.filter(
        (storedAsset) =>
          !scannedAssetCatalog.assets.some((scannedAsset) => scannedAsset.id === storedAsset.id)
      )
    ].sort((a, b) => a.id.localeCompare(b.id))
  };

  writeCatalog(getWorkspaceCatalogPath(workspace.id), catalog);
  writeAssetCatalog(getWorkspaceAssetCatalogPath(workspace.id), assetCatalog);

  return {
    workspace,
    catalog,
    assetCatalog,
    catalogPath: getWorkspaceCatalogPath(workspace.id),
    assetCatalogPath: getWorkspaceAssetCatalogPath(workspace.id),
    generatedAt: catalog.generatedAt,
    storage: getStorageStatus(),
    assets: assetCatalog.assets,
    skills,
    issues
  };
}

function createSkillAsset(
  req: Request,
  res: Response,
  workspace: WorkspaceRecord,
  defaultOwner: string
): void {
  try {
    if (!String(req.body?.name ?? "").trim()) {
      throw new Error("Skill name is required.");
    }

    const skillPath = createSkillSkeleton({
      name: String(req.body.name),
      dir: String(req.body?.dir ?? workspace.skillRoot),
      description:
        typeof req.body?.description === "string" ? req.body.description : undefined,
      owner:
        typeof req.body?.owner === "string" && req.body.owner.trim()
          ? req.body.owner
          : defaultOwner,
      tags: Array.isArray(req.body?.tags)
        ? req.body.tags.filter((tag: unknown): tag is string => typeof tag === "string")
        : []
    });

    const response = scanAndPersistWorkspace(
      workspace,
      unique([workspace.skillRoot, ...workspace.defaultScanPaths])
    );

    res.status(201).json({
      path: skillPath,
      ...response
    });
  } catch (error) {
    sendError(res, error, 400);
  }
}

function getDemoWorkspace(): WorkspaceRecord {
  return loadState().workspaces[0]!;
}

function getBearerToken(req: Request): string | undefined {
  const authorization = req.header("authorization");
  if (!authorization?.startsWith("Bearer ")) return undefined;
  return authorization.slice("Bearer ".length).trim();
}

function readOptionalPathList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const paths = value.filter((item): item is string => typeof item === "string");
  return paths.length > 0 ? paths : undefined;
}

function readOptionalStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function readPathList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    return fallback;
  }

  const paths = value.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0
  );

  return paths.length > 0 ? paths : fallback;
}

function stringQuery(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function metadataString(asset: AssetRecord, key: string): string | undefined {
  const value = asset.metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function buildZipTree(entries: JSZipObject[]): AssetFileTreeNode[] {
  type MutableNode = AssetFileTreeNode & { childMap?: Map<string, MutableNode> };
  const roots = new Map<string, MutableNode>();

  for (const entry of entries) {
    const parts = entry.name.split("/").filter(Boolean);
    let level = roots;
    let currentPath = "";

    parts.forEach((part, index) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isFile = index === parts.length - 1;
      let node = level.get(part);

      if (!node) {
        node = {
          name: part,
          path: currentPath,
          type: isFile ? "file" : "directory",
          ...(isFile ? { size: zipEntrySize(entry) } : { children: [], childMap: new Map() })
        };
        level.set(part, node);
      }

      if (!isFile) {
        node.type = "directory";
        node.children ??= [];
        node.childMap ??= new Map();
        level = node.childMap;
      }
    });
  }

  function finalize(nodes: Iterable<MutableNode>): AssetFileTreeNode[] {
    return Array.from(nodes)
      .sort((a, b) =>
        a.type === b.type ? a.name.localeCompare(b.name) : a.type === "directory" ? -1 : 1
      )
      .map((node) => ({
        name: node.name,
        path: node.path,
        type: node.type,
        size: node.size,
        children: node.childMap ? finalize(node.childMap.values()) : undefined
      }));
  }

  return finalize(roots.values());
}

function zipEntrySummary(entry: JSZipObject): AssetFileSummary {
  return {
    path: entry.name,
    name: path.posix.basename(entry.name),
    size: zipEntrySize(entry),
    isText: isTextZipEntry(entry.name)
  };
}

async function zipEntryPreview(entry: JSZipObject): Promise<AssetFilePreview> {
  const size = zipEntrySize(entry);
  const isText = isTextZipEntry(entry.name);
  const base = {
    path: entry.name,
    name: path.posix.basename(entry.name),
    size,
    isText
  };

  if (!isText) {
    return {
      ...base,
      truncated: false
    };
  }

  const content = await entry.async("string");
  return {
    ...base,
    truncated: size > MAX_PREVIEW_BYTES || content.length > MAX_PREVIEW_CHARS,
    content: content.slice(0, MAX_PREVIEW_CHARS)
  };
}

function zipEntrySize(entry: JSZipObject): number {
  const data = (entry as unknown as { _data?: { uncompressedSize?: number } })._data;
  return data?.uncompressedSize ?? 0;
}

function isTextZipEntry(filePath: string): boolean {
  const name = filePath.toLowerCase();
  const extension = path.posix.extname(name);
  return (
    name.endsWith("skill.md") ||
    [
      ".md",
      ".mdx",
      ".txt",
      ".json",
      ".yaml",
      ".yml",
      ".csv",
      ".tsv",
      ".xml",
      ".html",
      ".css",
      ".js",
      ".jsx",
      ".ts",
      ".tsx",
      ".py",
      ".sh",
      ".toml",
      ".ini",
      ".env",
      ".gitignore",
      ".license"
    ].includes(extension)
  );
}

function hasErrors(issues: ValidationIssue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
}

function readWorkspaceRole(value: unknown) {
  if (value === "owner" || value === "admin" || value === "member" || value === "viewer") {
    return value;
  }

  return "member";
}

function sendError(res: Response, error: unknown, status: number): void {
  res.status(status).json({
    error: error instanceof Error ? error.message : String(error)
  });
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}
