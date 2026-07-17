import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createMembership } from "./records.js";
import { getStatePath } from "./paths.js";
import { hashPassword } from "./passwords.js";
import {
  isDatabaseStateEnabled,
  readDatabaseState,
  writeDatabaseState
} from "./database.js";
import type { AccountRecord, AppState } from "./types.js";
import type { WorkspaceRecord } from "../shared/types.js";

export async function loadState(): Promise<AppState> {
  if (isDatabaseStateEnabled()) {
    const state = await readDatabaseState();
    if (state) {
      const needsMigration = needsStateMigration(state);
      const normalized = normalizeState(state);
      if (needsMigration) await writeDatabaseState(normalized);
      return normalized;
    }

    const seeded = createSeedState();
    await saveState(seeded);
    return seeded;
  }

  const statePath = getStatePath();
  if (!existsSync(statePath)) {
    const seeded = createSeedState();
    await saveState(seeded);
    return seeded;
  }

  const parsed = JSON.parse(readFileSync(statePath, "utf8")) as AppState;
  const needsMigration = needsStateMigration(parsed);
  const normalized = normalizeState(parsed);
  if (needsMigration) await saveState(normalized);
  return normalized;
}

export async function saveState(state: AppState): Promise<void> {
  if (isDatabaseStateEnabled()) {
    await writeDatabaseState(state);
    return;
  }

  const statePath = getStatePath();
  mkdirSync(path.dirname(statePath), { recursive: true });
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

function createSeedState(): AppState {
  const account: AccountRecord = {
    id: "acct_demo",
    email: "admin@harhub.local",
    name: "Harhub Admin",
    passwordHash: hashPassword("harhub"),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  const workspace: WorkspaceRecord = {
    id: "ws_demo",
    name: "Engineering Platform",
    slug: "engineering-platform",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  return {
    schemaVersion: 1,
    accounts: [account],
    identities: [],
    workspaces: [workspace],
    memberships: [createMembership(account.id, workspace.id, "owner")],
    invitations: [],
    assetShares: [],
    emailLoginCodes: [],
    oauthStates: [],
    deviceAuthorizations: [],
    sessions: [],
    workspaceAiConfigurations: [],
    forgeSessions: []
  };
}

function normalizeState(state: AppState): AppState {
  state.accounts ??= [];
  state.identities ??= [];
  state.workspaces ??= [];
  state.memberships ??= [];
  state.invitations ??= [];
  state.assetShares ??= [];
  state.emailLoginCodes ??= [];
  state.oauthStates ??= [];
  state.deviceAuthorizations ??= [];
  state.sessions ??= [];
  state.workspaceAiConfigurations ??= [];
  state.forgeSessions ??= [];

  if (state.accounts.length === 0 || state.workspaces.length === 0) {
    return createSeedState();
  }

  for (const account of state.accounts) {
    account.updatedAt ??= account.createdAt;
  }

  for (const membership of state.memberships) {
    membership.updatedAt ??= membership.createdAt;
  }

  for (const invitation of state.invitations) {
    invitation.updatedAt ??= invitation.createdAt;
  }

  for (const workspace of state.workspaces) {
    const legacyWorkspace = workspace as WorkspaceRecord & {
      defaultScanPaths?: unknown;
      skillRoot?: unknown;
    };
    delete legacyWorkspace.defaultScanPaths;
    delete legacyWorkspace.skillRoot;
    workspace.updatedAt ??= workspace.createdAt;
  }

  for (const session of state.forgeSessions) {
    if (session.followUp && session.followUp.mode !== "llm") delete session.followUp;
    if (session.template && session.template.mode !== "llm") {
      delete session.template;
      session.status = "interviewing";
    }
  }

  return state;
}

function hasLegacyWorkspacePaths(state: AppState): boolean {
  return (state.workspaces ?? []).some(
    (workspace) => "defaultScanPaths" in workspace || "skillRoot" in workspace
  );
}

function needsStateMigration(state: AppState): boolean {
  return !Array.isArray(state.assetShares) ||
    !Array.isArray(state.workspaceAiConfigurations) ||
    !Array.isArray(state.forgeSessions) ||
    hasLegacyForgeResponses(state) ||
    hasLegacyWorkspacePaths(state);
}

function hasLegacyForgeResponses(state: AppState): boolean {
  return (state.forgeSessions ?? []).some((session) =>
    (session.followUp && session.followUp.mode !== "llm") ||
    (session.template && session.template.mode !== "llm")
  );
}
