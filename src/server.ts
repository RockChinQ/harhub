import cors from "cors";
import express, { type Request, type Response } from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  createCatalog,
  readCatalog,
  writeCatalog
} from "./catalog.js";
import {
  createSkillSkeleton,
  filterCatalog,
  findSkill,
  scanSkills,
  validateSkills
} from "./skills.js";
import {
  authenticate,
  createSession,
  createWorkspaceForAccount,
  deleteSession,
  getStatePath,
  getWorkspaceCatalogPath,
  listAccountWorkspaces,
  loadState,
  loginAccount,
  signUpAccount,
  updateWorkspaceForAccount
} from "./state.js";
import type {
  AccountProfile,
  SkillCatalog,
  ValidationIssue,
  WorkspaceRecord
} from "./types.js";

const PORT = Number(process.env.PORT ?? 3300);

const app = express();

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

  try {
    if (!String(req.body?.name ?? "").trim()) {
      throw new Error("Skill name is required.");
    }

    const skillPath = createSkillSkeleton({
      name: String(req.body.name),
      dir: String(req.body?.dir ?? context.workspace.skillRoot),
      description:
        typeof req.body?.description === "string" ? req.body.description : undefined,
      owner:
        typeof req.body?.owner === "string" ? req.body.owner : context.account.name,
      tags: Array.isArray(req.body?.tags)
        ? req.body.tags.filter((tag: unknown): tag is string => typeof tag === "string")
        : []
    });

    const response = scanAndPersistWorkspace(
      context.workspace,
      unique([context.workspace.skillRoot, ...context.workspace.defaultScanPaths])
    );

    res.status(201).json({
      path: skillPath,
      ...response
    });
  } catch (error) {
    sendError(res, error, 400);
  }
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
  const catalogPath = getWorkspaceCatalogPath(workspace.id);
  if (existsSync(catalogPath)) {
    const catalog = readCatalog(catalogPath);
    const needsRefresh = catalog.workspaceId !== workspace.id ||
      catalog.skills.some((skill) => !skill.displayName || !skill.resources);
    if (!needsRefresh) return catalog;
  }

  return scanAndPersistWorkspace(workspace, workspace.defaultScanPaths).catalog;
}

function scanAndPersistWorkspace(workspace: WorkspaceRecord, roots: string[]) {
  const skills = scanSkills({ roots });
  const issues = validateSkills(skills);
  const catalog = {
    ...createCatalog(skills),
    workspaceId: workspace.id
  };

  writeCatalog(getWorkspaceCatalogPath(workspace.id), catalog);

  return {
    workspace,
    catalog,
    catalogPath: getWorkspaceCatalogPath(workspace.id),
    generatedAt: catalog.generatedAt,
    skills,
    issues
  };
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

function hasErrors(issues: ValidationIssue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
}

function sendError(res: Response, error: unknown, status: number): void {
  res.status(status).json({
    error: error instanceof Error ? error.message : String(error)
  });
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}
