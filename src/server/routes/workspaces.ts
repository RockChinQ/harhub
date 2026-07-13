import type { Express } from "express";
import {
  acceptWorkspaceInvitation,
  createWorkspaceInvitation,
  createWorkspaceForAccount,
  listAccountWorkspaces,
  listWorkspacePendingInvitations,
  listWorkspaceMembers,
  removeWorkspaceInvitation,
  removeWorkspaceMember,
  updateWorkspaceForAccount,
  updateWorkspaceMemberRole
} from "../../state/index.js";
import { requireAuth, requireWorkspaceAccess } from "../auth.js";
import {
  readWorkspaceRole,
  sendError
} from "../utils/http.js";
import { sendWorkspaceInvitationEmail } from "../services/email.js";
import { publicAppUrl } from "../services/oauth.js";

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
        name: String(req.body?.name ?? "")
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
        name: typeof req.body?.name === "string" ? req.body.name : undefined
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

  app.post("/api/invitations/accept", async (req, res) => {
    const context = await requireAuth(req, res);
    if (!context) return;

    try {
      const workspace = await acceptWorkspaceInvitation(
        context.account.id,
        String(req.body?.token ?? "")
      );
      res.json({
        workspace,
        ...(await listAccountWorkspaces(context.account.id))
      });
    } catch (error) {
      sendError(res, error, 400);
    }
  });
}

function registerMemberRoutes(app: Express): void {
  app.get("/api/workspaces/:workspaceId/members", async (req, res) => {
    const context = await requireWorkspaceAccess(req, res);
    if (!context) return;

    try {
      res.json({
        workspace: context.workspace,
        members: await listWorkspaceMembers(context.account.id, context.workspace.id),
        invitations: await listWorkspacePendingInvitations(context.account.id, context.workspace.id)
      });
    } catch (error) {
      sendError(res, error, 403);
    }
  });

  app.post("/api/workspaces/:workspaceId/members", async (req, res) => {
    const context = await requireWorkspaceAccess(req, res);
    if (!context) return;

    try {
      const invitation = await createWorkspaceInvitation(context.account.id, context.workspace.id, {
        email: String(req.body?.email ?? ""),
        role: readWorkspaceRole(req.body?.role)
      });
      const acceptUrl = `${publicAppUrl(req)}/?invite=${encodeURIComponent(invitation.token)}`;
      let emailError: string | undefined;
      try {
        await sendWorkspaceInvitationEmail({
          email: invitation.email,
          workspaceName: context.workspace.name,
          inviterName: context.account.name,
          acceptUrl
        });
      } catch (caught) {
        emailError = caught instanceof Error ? caught.message : String(caught);
      }
      res.status(emailError ? 202 : 201).json({
        workspace: context.workspace,
        invitation,
        invitationUrl: acceptUrl,
        email: {
          sent: !emailError,
          error: emailError
        },
        invitations: await listWorkspacePendingInvitations(context.account.id, context.workspace.id),
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

  app.delete("/api/workspaces/:workspaceId/invitations/:invitationId", async (req, res) => {
    const context = await requireWorkspaceAccess(req, res);
    if (!context) return;

    try {
      await removeWorkspaceInvitation(
        context.account.id,
        context.workspace.id,
        req.params.invitationId
      );
      res.status(204).send();
    } catch (error) {
      sendError(res, error, 400);
    }
  });
}
