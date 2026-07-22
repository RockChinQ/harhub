import type { Express, Request } from "express";

import type { ProjectBindingOwnership } from "../../shared/types.js";
import {
  consumeGitHubInstallationAuthorization,
  createGitHubInstallationAuthorization,
  getGitHubInstallationInternal,
  getProject,
  getProjectInventoryState,
  listGitHubInstallations,
  upsertGitHubInstallation,
  upsertProjectBindingPolicy
} from "../../state/index.js";
import { requireWorkspaceAccess, requireWorkspaceAdminAccess } from "../auth.js";
import { PUBLIC_APP_URL } from "../config.js";
import {
  exchangeGitHubAppOAuthCode,
  githubAppInstallUrl,
  githubAppOAuthUrl,
  githubIntegrationStatus,
  listInstallationRepositories,
  verifyAndReadInstallation
} from "../services/github-app.js";
import {
  importGitHubRepository,
  queueProjectRepositoryScan
} from "../services/project-repository-inventory.js";
import { sendError, setPrivateNoStore } from "../utils/http.js";

export function registerGitHubIntegrationRoutes(app: Express): void {
  app.get("/api/workspaces/:workspaceId/github/status", async (req, res) => {
    const context = await requireWorkspaceAccess(req, res);
    if (!context) return;
    setPrivateNoStore(res);
    res.json(githubIntegrationStatus());
  });

  app.post("/api/workspaces/:workspaceId/github/installations/authorize", async (req, res) => {
    const context = await requireWorkspaceAdminAccess(req, res);
    if (!context) return;
    setPrivateNoStore(res);
    try {
      const authorization = await createGitHubInstallationAuthorization(
        context.account.id,
        context.workspace.id,
        readRedirectPath(req.body)
      );
      res.json({ url: githubAppInstallUrl(authorization.state) });
    } catch (error) {
      sendError(res, error, 400);
    }
  });

  app.get("/api/github/installations/callback", async (req, res) => {
    try {
      const stateValue = requiredQuery(req, "state");
      const code = optionalQuery(req, "code");
      if (!code) {
        const installationId = requiredQuery(req, "installation_id");
        const initial = await consumeGitHubInstallationAuthorization(stateValue);
        const oauth = await createGitHubInstallationAuthorization(
          initial.accountId,
          initial.workspaceId,
          initial.redirectPath,
          installationId
        );
        res.redirect(302, githubAppOAuthUrl(oauth.state));
        return;
      }
      const oauth = await consumeGitHubInstallationAuthorization(stateValue);
      if (!oauth.installationId) throw new Error("GitHub installation authorization is incomplete.");
      const userAccessToken = await exchangeGitHubAppOAuthCode(code);
      const installation = await verifyAndReadInstallation({
        installationId: oauth.installationId,
        userAccessToken,
        workspaceId: oauth.workspaceId,
        linkedByAccountId: oauth.accountId
      });
      await upsertGitHubInstallation(installation);
      res.redirect(302, redirectUrl(req, oauth.redirectPath, "github=connected"));
    } catch (error) {
      res.status(400).send(`GitHub App connection failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  app.get("/api/workspaces/:workspaceId/github/installations", async (req, res) => {
    const context = await requireWorkspaceAccess(req, res);
    if (!context) return;
    setPrivateNoStore(res);
    try {
      res.json({ installations: await listGitHubInstallations(context.account.id, context.workspace.id) });
    } catch (error) {
      sendError(res, error, 400);
    }
  });

  app.get("/api/workspaces/:workspaceId/github/installations/:installationId/repositories", async (req, res) => {
    const context = await requireWorkspaceAccess(req, res);
    if (!context) return;
    setPrivateNoStore(res);
    try {
      const installationId = requiredParam(req.params.installationId, "installationId");
      const installation = await getGitHubInstallationInternal(context.workspace.id, installationId);
      if (!installation || installation.suspendedAt) throw new Error("GitHub installation is unavailable.");
      res.json({ repositories: await listInstallationRepositories(installationId) });
    } catch (error) {
      sendError(res, error, 400);
    }
  });

  app.post("/api/workspaces/:workspaceId/github/repositories/import", async (req, res) => {
    const context = await requireWorkspaceAdminAccess(req, res);
    if (!context) return;
    setPrivateNoStore(res);
    try {
      const installationId = requiredBodyString(req.body, "installationId");
      const repositoryId = requiredBodyString(req.body, "repositoryId");
      const installation = await getGitHubInstallationInternal(context.workspace.id, installationId);
      if (!installation || installation.suspendedAt) throw new Error("GitHub installation is unavailable.");
      const repository = (await listInstallationRepositories(installationId))
        .find((candidate) => candidate.id === repositoryId);
      if (!repository) throw new Error("Repository is not available to this GitHub App installation.");
      res.status(201).json(await importGitHubRepository({
        accountId: context.account.id,
        workspaceId: context.workspace.id,
        installationId,
        repository
      }));
    } catch (error) {
      sendError(res, error, 400);
    }
  });

  app.get("/api/workspaces/:workspaceId/projects/:projectId/inventory", async (req, res) => {
    const context = await requireWorkspaceAccess(req, res);
    if (!context) return;
    setPrivateNoStore(res);
    try {
      const projectId = requiredParam(req.params.projectId, "projectId");
      const [project, inventory] = await Promise.all([
        getProject(context.account.id, context.workspace.id, projectId),
        getProjectInventoryState(context.account.id, context.workspace.id, projectId)
      ]);
      res.json({ project, ...inventory });
    } catch (error) {
      sendError(res, error, 404);
    }
  });

  app.post("/api/workspaces/:workspaceId/projects/:projectId/scans", async (req, res) => {
    const context = await requireWorkspaceAdminAccess(req, res);
    if (!context) return;
    setPrivateNoStore(res);
    try {
      res.status(202).json(await queueProjectRepositoryScan({
        workspaceId: context.workspace.id,
        projectId: requiredParam(req.params.projectId, "projectId"),
        trigger: "manual"
      }));
    } catch (error) {
      sendError(res, error, 400);
    }
  });

  app.put("/api/workspaces/:workspaceId/projects/:projectId/inventory/policies", async (req, res) => {
    const context = await requireWorkspaceAdminAccess(req, res);
    if (!context) return;
    setPrivateNoStore(res);
    try {
      const projectId = requiredParam(req.params.projectId, "projectId");
      await getProject(context.account.id, context.workspace.id, projectId);
      const ownership = readOwnership(req.body?.ownership);
      const policy = {
        projectId,
        artifactPath: requiredBodyString(req.body, "artifactPath"),
        ownership,
        ...(optionalBodyString(req.body, "libraryAssetId") ? { libraryAssetId: optionalBodyString(req.body, "libraryAssetId") } : {}),
        ...(Number.isInteger(req.body?.pinnedVersion) ? { pinnedVersion: Number(req.body.pinnedVersion) } : {}),
        decidedByAccountId: context.account.id,
        decidedAt: new Date().toISOString()
      };
      await upsertProjectBindingPolicy(policy);
      const scan = await queueProjectRepositoryScan({
        workspaceId: context.workspace.id,
        projectId,
        trigger: "manual"
      });
      res.json({ policy, scan });
    } catch (error) {
      sendError(res, error, 400);
    }
  });
}

function readOwnership(value: unknown): ProjectBindingOwnership {
  if (value === "library" || value === "repository" || value === "ignored") return value;
  throw new Error("ownership must be library, repository, or ignored");
}

function readRedirectPath(body: unknown): string {
  return optionalBodyString(body, "redirectPath") ?? "/projects";
}

function requiredQuery(req: Request, key: string): string {
  const value = optionalQuery(req, key);
  if (!value) throw new Error(`${key} is required.`);
  return value;
}

function optionalQuery(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requiredParam(value: string | undefined, label: string): string {
  if (!value?.trim()) throw new Error(`${label} is required.`);
  return value.trim();
}

function requiredBodyString(body: unknown, key: string): string {
  const value = optionalBodyString(body, key);
  if (!value) throw new Error(`${key} is required.`);
  return value;
}

function optionalBodyString(body: unknown, key: string): string | undefined {
  if (!body || typeof body !== "object" || Array.isArray(body)) return undefined;
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function redirectUrl(req: Request, path: string, query: string): string {
  const base = PUBLIC_APP_URL?.trim() || `${req.protocol}://${req.get("host")}`;
  const url = new URL(path, `${base.replace(/\/+$/, "")}/`);
  for (const pair of new URLSearchParams(query)) url.searchParams.set(pair[0], pair[1]);
  return url.toString();
}
