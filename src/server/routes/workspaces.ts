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
  app.get("/api/workspaces", (req, res) => {
    const context = requireAuth(req, res);
    if (!context) return;
    res.json(listAccountWorkspaces(context.account.id));
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
        ...listAccountWorkspaces(context.account.id)
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
        ...listAccountWorkspaces(context.account.id)
      });
    } catch (error) {
      sendError(res, error, 403);
    }
  });

  registerMemberRoutes(app);
}

function registerMemberRoutes(app: Express): void {
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
}
