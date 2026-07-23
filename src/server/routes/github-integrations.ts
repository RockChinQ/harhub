import type { Express, Request } from "express";

import type { ProjectBindingOwnership } from "../../shared/types.js";
import {
  consumeGitHubInstallationAuthorization,
  createGitHubInstallationAuthorization,
  getGitHubInstallationInternal,
  getProject,
  getProjectInventoryState,
  getProjectInventoryStateInternal,
  getProjectChangeProposal,
  getProjectRepositoryConnectionInternal,
  listProjectInventoryFilePaths,
  listGitHubInstallations,
  upsertGitHubInstallation,
  upsertProjectBindingPolicy,
  saveProjectChangeProposal,
  recordWorkspaceAuditEvent
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
  connectExistingProjectGitHubRepository,
  queueProjectRepositoryScan
} from "../services/project-repository-inventory.js";
import {
  createAddLibrarySkillsProposal,
  createBootstrapProposal,
  createRemoveSkillProposal,
  openProjectChangeProposal
} from "../services/project-repository-proposals.js";
import { loadStoredSkill } from "../services/skill-packages.js";
import { loadOrCreateWorkspaceAssetCatalog } from "../services/workspace-catalogs.js";
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
        repository,
        permissionMode: installation.permissions.contents === "write" &&
          installation.permissions.pull_requests === "write"
          ? "write"
          : "read"
      }));
    } catch (error) {
      sendError(res, error, 400);
    }
  });

  app.post("/api/workspaces/:workspaceId/projects/:projectId/github/connect", async (req, res) => {
    const context = await requireWorkspaceAdminAccess(req, res);
    if (!context) return;
    setPrivateNoStore(res);
    try {
      const projectId = requiredParam(req.params.projectId, "projectId");
      const project = await getProject(context.account.id, context.workspace.id, projectId);
      const installationId = requiredBodyString(req.body, "installationId");
      const repositoryId = requiredBodyString(req.body, "repositoryId");
      const installation = await getGitHubInstallationInternal(context.workspace.id, installationId);
      if (!installation || installation.suspendedAt) throw new Error("GitHub installation is unavailable.");
      const repository = (await listInstallationRepositories(installationId))
        .find((candidate) => candidate.id === repositoryId);
      if (!repository) throw new Error("Repository is not available to this GitHub App installation.");
      if (project.repository) {
        const current = `${project.repository.owner}/${project.repository.name}`.toLowerCase();
        if (current !== repository.fullName.toLowerCase()) {
          throw new Error("Select the same GitHub repository already tracked by this Project.");
        }
      }
      res.json(await connectExistingProjectGitHubRepository({
        accountId: context.account.id,
        workspaceId: context.workspace.id,
        projectId,
        installationId,
        repository,
        permissionMode: installation.permissions.contents === "write" &&
          installation.permissions.pull_requests === "write" ? "write" : "read"
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
        trigger: "manual",
        actorAccountId: context.account.id
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
      const libraryAssetId = optionalBodyString(req.body, "libraryAssetId");
      if (ownership === "library" && !libraryAssetId) {
        throw new Error("libraryAssetId is required for Library ownership.");
      }
      const policy = {
        projectId,
        artifactPath: requiredBodyString(req.body, "artifactPath"),
        ownership,
        ...(libraryAssetId ? { libraryAssetId } : {}),
        ...(Number.isInteger(req.body?.pinnedVersion) ? { pinnedVersion: Number(req.body.pinnedVersion) } : {}),
        decidedByAccountId: context.account.id,
        decidedAt: new Date().toISOString()
      };
      await upsertProjectBindingPolicy(policy);
      const scan = await queueProjectRepositoryScan({
        workspaceId: context.workspace.id,
        projectId,
        trigger: "manual",
        actorAccountId: context.account.id
      });
      res.json({ policy, scan });
    } catch (error) {
      sendError(res, error, 400);
    }
  });

  app.post("/api/workspaces/:workspaceId/projects/:projectId/proposals", async (req, res) => {
    const context = await requireWorkspaceAdminAccess(req, res);
    if (!context) return;
    setPrivateNoStore(res);
    try {
      const projectId = requiredParam(req.params.projectId, "projectId");
      const [project, inventory, connection] = await Promise.all([
        getProject(context.account.id, context.workspace.id, projectId),
        getProjectInventoryStateInternal(context.workspace.id, projectId),
        getProjectRepositoryConnectionInternal(projectId)
      ]);
      if (!connection || connection.workspaceId !== context.workspace.id || !connection.installationId) {
        throw new Error("Project GitHub repository connection is unavailable.");
      }
      if (!inventory.latestSnapshot) throw new Error("Run the initial repository scan first.");
      const installation = await getGitHubInstallationInternal(context.workspace.id, connection.installationId);
      if (!installation) throw new Error("GitHub installation is unavailable.");
      const kind = req.body?.kind;
      let proposal;
      if (kind === "bootstrap") {
        proposal = createBootstrapProposal({
          project,
          connection,
          installation,
          snapshot: inventory.latestSnapshot,
          policies: inventory.policies,
          accountId: context.account.id
        });
      } else if (kind === "add-library-skills") {
        const assetIds = readStringArray(req.body?.assetIds, "assetIds", 20);
        const catalog = await loadOrCreateWorkspaceAssetCatalog(context.workspace);
        const assetsById = new Map(catalog.assets.map((asset) => [asset.id, asset]));
        const assets = assetIds.map((assetId) => {
          const asset = assetsById.get(assetId);
          if (!asset) throw new Error(`Library Skill ${assetId} was not found.`);
          if (!asset.storage) throw new Error(`Library Skill ${asset.displayName} has no stored package.`);
          return asset;
        });
        const skills = await Promise.all(assets.map(async (asset) => ({
          asset,
          files: (await loadStoredSkill(asset.storage!)).files
        })));
        proposal = createAddLibrarySkillsProposal({
          project,
          connection,
          installation,
          snapshot: inventory.latestSnapshot,
          skills,
          accountId: context.account.id
        });
      } else if (kind === "remove-skill") {
        const bindingId = requiredBodyString(req.body, "bindingId");
        const binding = project.bindings.find((candidate) => candidate.id === bindingId);
        if (!binding) throw new Error("Project Skill binding was not found.");
        const artifact = inventory.latestSnapshot.artifacts.find((candidate) =>
          candidate.kind === "skill" &&
          (candidate.bindingId === binding.id || candidate.path === binding.path)
        );
        if (!artifact) throw new Error("Project Skill is not present in the latest repository inventory.");
        const filePaths = await listProjectInventoryFilePaths(
          context.workspace.id,
          projectId,
          inventory.latestSnapshot.id,
          artifact.id
        );
        proposal = createRemoveSkillProposal({
          project,
          connection,
          installation,
          snapshot: inventory.latestSnapshot,
          binding,
          filePaths,
          accountId: context.account.id
        });
      } else {
        throw new Error("Proposal kind must be bootstrap, add-library-skills, or remove-skill.");
      }
      await saveProjectChangeProposal(proposal);
      await recordWorkspaceAuditEvent({
        workspaceId: context.workspace.id,
        eventType: "project.proposal.created",
        entityType: "project",
        entityId: projectId,
        actorAccountId: context.account.id,
        source: "api",
        metadata: { proposalId: proposal.id, kind: proposal.kind, baseSha: proposal.baseSha },
        deduplicationKey: `project-proposal-created:${proposal.id}`
      });
      res.status(201).json(proposal);
    } catch (error) {
      sendError(res, error, 400);
    }
  });

  app.post("/api/workspaces/:workspaceId/projects/:projectId/proposals/:proposalId/open", async (req, res) => {
    const context = await requireWorkspaceAdminAccess(req, res);
    if (!context) return;
    setPrivateNoStore(res);
    const projectId = requiredParam(req.params.projectId, "projectId");
    try {
      await getProject(context.account.id, context.workspace.id, projectId);
      const [proposal, connection] = await Promise.all([
        getProjectChangeProposal(projectId, requiredParam(req.params.proposalId, "proposalId")),
        getProjectRepositoryConnectionInternal(projectId)
      ]);
      if (!proposal || proposal.workspaceId !== context.workspace.id) throw new Error("Proposal not found.");
      if (!connection || connection.workspaceId !== context.workspace.id || !connection.installationId) {
        throw new Error("Project GitHub repository connection is unavailable.");
      }
      const installation = await getGitHubInstallationInternal(context.workspace.id, connection.installationId);
      if (!installation) throw new Error("GitHub installation is unavailable.");
      const creating = { ...proposal, status: "creating" as const, updatedAt: new Date().toISOString() };
      await saveProjectChangeProposal(creating);
      try {
        const opened = await openProjectChangeProposal({ proposal, connection, installation });
        await saveProjectChangeProposal(opened);
        res.json(opened);
      } catch (error) {
        await saveProjectChangeProposal({
          ...proposal,
          status: "failed",
          updatedAt: new Date().toISOString(),
          failure: error instanceof Error ? error.message : String(error)
        });
        throw error;
      }
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

function readStringArray(value: unknown, label: string, maximum: number): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > maximum) {
    throw new Error(`${label} must include between 1 and ${maximum} values.`);
  }
  const values = value.map((candidate) => {
    if (typeof candidate !== "string" || !candidate.trim()) {
      throw new Error(`${label} values must be non-empty strings.`);
    }
    return candidate.trim();
  });
  if (new Set(values).size !== values.length) throw new Error(`${label} values must be unique.`);
  return values;
}

function redirectUrl(req: Request, path: string, query: string): string {
  const base = PUBLIC_APP_URL?.trim() || `${req.protocol}://${req.get("host")}`;
  const url = new URL(path, `${base.replace(/\/+$/, "")}/`);
  for (const pair of new URLSearchParams(query)) url.searchParams.set(pair[0], pair[1]);
  return url.toString();
}
