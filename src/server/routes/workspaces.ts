import type { Express } from "express";
import {
  addWorkspaceMember,
  createWorkspaceForAccount,
  listAccountWorkspaces,
  listWorkspaceMembers,
  removeWorkspaceMember,
  updateWorkspaceForAccount,
  updateWorkspaceMemberRole
} from "../../state/index.js";
import { requireAuth, requireWorkspaceAccess } from "../auth.js";
import {
  readOptionalPathList,
  readWorkspaceRole,
  sendError
} from "../utils/http.js";

export function registerWorkspaceRoutes(app: Express): void {
  app.get("/api/workspaces", async (req, res) => {
    const context = await requireAuth(req, res);
    if (!context) return;
    res.json(await listAccountWorkspaces(context.account.id));
  });

  app.post("/api/workspaces", async (req, res) => {
    const context = await requireAuth(req, res);
    if (!context) return;

    try {
      const workspace = await createWorkspaceForAccount(context.account.id, {
        name: String(req.body?.name ?? ""),
        defaultScanPaths: readOptionalPathList(req.body?.defaultScanPaths),
        skillRoot:
          typeof req.body?.skillRoot === "string" ? req.body.skillRoot : undefined
      });
      res.status(201).json({
        workspace,
        ...(await listAccountWorkspaces(context.account.id))
      });
    } catch (error) {
      sendError(res, error, 400);
    }
  });

  app.patch("/api/workspaces/:workspaceId", async (req, res) => {
    const context = await requireAuth(req, res);
    if (!context) return;

    try {
      const workspace = await updateWorkspaceForAccount(context.account.id, req.params.workspaceId, {
        name: typeof req.body?.name === "string" ? req.body.name : undefined,
        defaultScanPaths: readOptionalPathList(req.body?.defaultScanPaths),
        skillRoot:
          typeof req.body?.skillRoot === "string" ? req.body.skillRoot : undefined
      });
      res.json({
        workspace,
        ...(await listAccountWorkspaces(context.account.id))
      });
    } catch (error) {
      sendError(res, error, 403);
    }
  });

  registerMemberRoutes(app);
}

function registerMemberRoutes(app: Express): void {
  app.get("/api/workspaces/:workspaceId/members", async (req, res) => {
    const context = await requireWorkspaceAccess(req, res);
    if (!context) return;

    try {
      res.json({
        workspace: context.workspace,
        members: await listWorkspaceMembers(context.account.id, context.workspace.id)
      });
    } catch (error) {
      sendError(res, error, 403);
    }
  });

  app.post("/api/workspaces/:workspaceId/members", async (req, res) => {
    const context = await requireWorkspaceAccess(req, res);
    if (!context) return;

    try {
      const member = await addWorkspaceMember(context.account.id, context.workspace.id, {
        email: String(req.body?.email ?? ""),
        role: readWorkspaceRole(req.body?.role)
      });
      res.status(201).json({
        workspace: context.workspace,
        member,
        members: await listWorkspaceMembers(context.account.id, context.workspace.id)
      });
    } catch (error) {
      sendError(res, error, 400);
    }
  });

  app.patch("/api/workspaces/:workspaceId/members/:membershipId", async (req, res) => {
    const context = await requireWorkspaceAccess(req, res);
    if (!context) return;

    try {
      const member = await updateWorkspaceMemberRole(
        context.account.id,
        context.workspace.id,
        req.params.membershipId,
        readWorkspaceRole(req.body?.role)
      );
      res.json({
        workspace: context.workspace,
        member,
        members: await listWorkspaceMembers(context.account.id, context.workspace.id)
      });
    } catch (error) {
      sendError(res, error, 400);
    }
  });

  app.delete("/api/workspaces/:workspaceId/members/:membershipId", async (req, res) => {
    const context = await requireWorkspaceAccess(req, res);
    if (!context) return;

    try {
      await removeWorkspaceMember(context.account.id, context.workspace.id, req.params.membershipId);
      res.status(204).send();
    } catch (error) {
      sendError(res, error, 400);
    }
  });
}
