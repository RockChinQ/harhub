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
    if (state) return normalizeState(state);

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
  return normalizeState(parsed);
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
    defaultScanPaths: ["examples"],
    skillRoot: "skills",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  return {
    schemaVersion: 1,
    accounts: [account],
    workspaces: [workspace],
    memberships: [createMembership(account.id, workspace.id, "owner")],
    sessions: []
  };
}

function normalizeState(state: AppState): AppState {
  state.accounts ??= [];
  state.workspaces ??= [];
  state.memberships ??= [];
  state.sessions ??= [];

  if (state.accounts.length === 0 || state.workspaces.length === 0) {
    return createSeedState();
  }

  for (const account of state.accounts) {
    account.updatedAt ??= account.createdAt;
  }

  for (const membership of state.memberships) {
    membership.updatedAt ??= membership.createdAt;
  }

  for (const workspace of state.workspaces) {
    workspace.updatedAt ??= workspace.createdAt;
  }

  return state;
}
