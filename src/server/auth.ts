import type { Request, Response } from "express";
import {
  authenticate,
  listAccountWorkspaces
} from "../state/index.js";
import type { AccountProfile } from "../shared/types.js";
import { getBearerToken } from "./utils/http.js";

export async function buildSessionPayload(account: AccountProfile) {
  return listAccountWorkspaces(account.id);
}

export function getAuthContext(req: Request) {
  return authenticate(getBearerToken(req));
}

export async function requireAuth(req: Request, res: Response) {
  const context = await getAuthContext(req);
  if (!context) {
    res.status(401).json({ error: "Authentication required" });
    return undefined;
  }
  return context;
}

export async function requireWorkspaceAccess(req: Request, res: Response) {
  const context = await requireAuth(req, res);
  if (!context) return undefined;

  const payload = await listAccountWorkspaces(context.account.id);
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
