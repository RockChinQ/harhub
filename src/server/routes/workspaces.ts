import type { Express } from "express";
import type {
  WorkspaceAiConnectionTestRequest,
  WorkspaceAiSettingsUpdate
} from "../../shared/types.js";
import {
  acceptWorkspaceInvitation,
  createWorkspaceInvitation,
  createWorkspaceForAccount,
  listAccountWorkspaces,
  listWorkspacePendingInvitations,
  listWorkspaceMembers,
  getWorkspaceAiSettings,
  removeWorkspaceInvitation,
  removeWorkspaceMember,
  resolveWorkspaceAiConnectionTestConfiguration,
  updateWorkspaceAiSettings,
  updateWorkspaceForAccount,
  updateWorkspaceMemberRole
} from "../../state/index.js";
import { requireAuth, requireWorkspaceAccess } from "../auth.js";
import {
  readWorkspaceRole,
  sendError
} from "../utils/http.js";
import { sendWorkspaceInvitationEmail } from "../services/email.js";
import { testForgeAiConnection } from "../services/forge.js";
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

  app.get("/api/workspaces/:workspaceId/ai-settings", async (req, res) => {
    const context = await requireWorkspaceAccess(req, res);
    if (!context) return;

    try {
      res.json(await getWorkspaceAiSettings(context.account.id, context.workspace.id));
    } catch (error) {
      sendError(res, error, 403);
    }
  });

  app.put("/api/workspaces/:workspaceId/ai-settings", async (req, res) => {
    const context = await requireWorkspaceAccess(req, res);
    if (!context) return;
    if (!["owner", "admin"].includes(context.membership.role)) {
      res.status(403).json({ error: "Workspace admin access is required." });
      return;
    }

    try {
      res.json(await updateWorkspaceAiSettings(
        context.account.id,
        context.workspace.id,
        readAiSettingsUpdate(req.body)
      ));
    } catch (error) {
      sendError(res, error, 400);
    }
  });

  app.post("/api/workspaces/:workspaceId/ai-settings/test", async (req, res) => {
    const context = await requireWorkspaceAccess(req, res);
    if (!context) return;
    if (!["owner", "admin"].includes(context.membership.role)) {
      res.status(403).json({ error: "Workspace admin access is required." });
      return;
    }

    let configuration;
    try {
      configuration = await resolveWorkspaceAiConnectionTestConfiguration(
        context.account.id,
        context.workspace.id,
        readAiConnectionTestRequest(req.body)
      );
    } catch (error) {
      sendError(res, error, 400);
      return;
    }

    try {
      res.json(await testForgeAiConnection(configuration));
    } catch (error) {
      sendError(res, error, 502);
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

function readAiSettingsUpdate(value: unknown): WorkspaceAiSettingsUpdate {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected a JSON object request body.");
  }
  const input = value as Record<string, unknown>;
  if (input.provider !== "openai-compatible") {
    throw new Error("Unsupported AI provider.");
  }
  return {
    provider: input.provider,
    baseUrl: typeof input.baseUrl === "string" ? input.baseUrl : "",
    model: typeof input.model === "string" ? input.model : "",
    apiKey: typeof input.apiKey === "string" ? input.apiKey : undefined,
    clearApiKey: input.clearApiKey === true
  };
}

function readAiConnectionTestRequest(value: unknown): WorkspaceAiConnectionTestRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected a JSON object request body.");
  }
  const input = value as Record<string, unknown>;
  if (input.provider !== "openai-compatible") {
    throw new Error("Unsupported AI provider.");
  }
  return {
    provider: input.provider,
    baseUrl: typeof input.baseUrl === "string" ? input.baseUrl : "",
    model: typeof input.model === "string" ? input.model : "",
    apiKey: typeof input.apiKey === "string" ? input.apiKey : undefined
  };
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
