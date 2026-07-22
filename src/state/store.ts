import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import path from "node:path";
import { createMembership } from "./records.js";
import { getStatePath } from "./paths.js";
import { hashPassword } from "./passwords.js";
import {
  isDatabaseStateEnabled,
  readDatabaseState,
  writeDatabaseState
} from "./database.js";
import type { DatabaseStateWriteOptions } from "./database.js";
import type { AccountRecord, AppState } from "./types.js";
import type { WorkspaceRecord } from "../shared/types.js";

const localStateRevisions = new WeakMap<AppState, string>();

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

  const source = readFileSync(statePath, "utf8");
  const parsed = JSON.parse(source) as AppState;
  localStateRevisions.set(parsed, stateDigest(source));
  const needsMigration = needsStateMigration(parsed);
  const normalized = normalizeState(parsed);
  if (needsMigration) await saveState(normalized);
  return normalized;
}

export async function saveState(
  state: AppState,
  options: DatabaseStateWriteOptions = {}
): Promise<void> {
  if (isDatabaseStateEnabled()) {
    await writeDatabaseState(state, options);
    return;
  }

  const statePath = getStatePath();
  writeLocalState(statePath, state);
}

function writeLocalState(statePath: string, state: AppState): void {
  mkdirSync(path.dirname(statePath), { recursive: true });
  const lockPath = `${statePath}.lock`;
  const lockDescriptor = acquireLocalStateLock(lockPath);
  try {
    const currentSource = existsSync(statePath) ? readFileSync(statePath, "utf8") : undefined;
    const currentRevision = currentSource === undefined ? undefined : stateDigest(currentSource);
    const expectedRevision = localStateRevisions.get(state);
    if (currentRevision !== expectedRevision) {
      throw new Error("State changed during this operation. Retry the request.");
    }

    const serialized = `${JSON.stringify(state, null, 2)}\n`;
    const temporaryPath = `${statePath}.${process.pid}.${Date.now()}.tmp`;
    try {
      writeFileSync(temporaryPath, serialized);
      renameSync(temporaryPath, statePath);
    } finally {
      if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
    }
    localStateRevisions.set(state, stateDigest(serialized));
  } finally {
    closeSync(lockDescriptor);
    if (existsSync(lockPath)) unlinkSync(lockPath);
  }
}

function acquireLocalStateLock(lockPath: string): number {
  const deadline = Date.now() + 5_000;
  const waitArray = new Int32Array(new SharedArrayBuffer(4));
  while (true) {
    try {
      const descriptor = openSync(lockPath, "wx");
      writeFileSync(descriptor, String(process.pid));
      return descriptor;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const ownerPid = Number.parseInt(readFileSync(lockPath, "utf8"), 10);
      if (Number.isInteger(ownerPid)) {
        try {
          process.kill(ownerPid, 0);
        } catch (ownerError) {
          if ((ownerError as NodeJS.ErrnoException).code === "ESRCH") {
            unlinkSync(lockPath);
            continue;
          }
        }
      }
      if (Date.now() >= deadline) {
        throw new Error("State is busy. Retry the request.");
      }
      Atomics.wait(waitArray, 0, 0, 10);
    }
  }
}

function stateDigest(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

function createSeedState(): AppState {
  const now = new Date().toISOString();
  const account: AccountRecord = {
    id: "acct_demo",
    email: "admin@harhub.local",
    name: "Harhub Admin",
    passwordHash: hashPassword("harhub"),
    emailVerifiedAt: now,
    createdAt: now,
    updatedAt: now
  };
  const workspace: WorkspaceRecord = {
    id: "ws_demo",
    name: "Engineering Platform",
    slug: "engineering-platform",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  return {
    schemaVersion: 2,
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
    forgeSessions: [],
    projects: [],
    githubInstallations: [],
    projectRepositoryConnections: [],
    projectScanJobs: [],
    projectInventorySnapshots: [],
    projectInventoryFiles: [],
    projectBindingPolicies: [],
    projectChangeProposals: [],
    githubWebhookDeliveries: [],
    githubInstallationAuthorizations: [],
    auditEvents: []
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
  state.projects ??= [];
  state.githubInstallations ??= [];
  state.projectRepositoryConnections ??= [];
  state.projectScanJobs ??= [];
  state.projectInventorySnapshots ??= [];
  state.projectInventoryFiles ??= [];
  state.projectBindingPolicies ??= [];
  state.projectChangeProposals ??= [];
  state.githubWebhookDeliveries ??= [];
  state.githubInstallationAuthorizations ??= [];
  state.auditEvents ??= [];

  if (state.accounts.length === 0 || state.workspaces.length === 0) {
    return createSeedState();
  }

  for (const account of state.accounts) {
    account.updatedAt ??= account.createdAt;
  }
  state.schemaVersion = 2;

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
    session.viewState ??= {
      followUpDrafts: [],
      markdownView: "preview"
    };
    session.viewState.followUpDrafts ??= [];
    session.viewState.markdownView = session.viewState.markdownView === "code"
      ? "code"
      : "preview";
    if (session.activeOperation) {
      session.activeOperation.lastActivityAt ??= session.activeOperation.startedAt;
      session.activeOperation.recoveryCount ??= 0;
    }
    if (session.lastOperation) {
      session.lastOperation.lastActivityAt ??= session.lastOperation.startedAt;
      session.lastOperation.recoveryCount ??= 0;
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
  return state.schemaVersion !== 2 ||
    !Array.isArray(state.assetShares) ||
    !Array.isArray(state.workspaceAiConfigurations) ||
    !Array.isArray(state.forgeSessions) ||
    !Array.isArray(state.projects) ||
    !Array.isArray(state.githubInstallations) ||
    !Array.isArray(state.projectRepositoryConnections) ||
    !Array.isArray(state.projectScanJobs) ||
    !Array.isArray(state.projectInventorySnapshots) ||
    !Array.isArray(state.projectInventoryFiles) ||
    !Array.isArray(state.projectBindingPolicies) ||
    !Array.isArray(state.projectChangeProposals) ||
    !Array.isArray(state.githubWebhookDeliveries) ||
    !Array.isArray(state.githubInstallationAuthorizations) ||
    !Array.isArray(state.auditEvents) ||
    hasLegacyForgeResponses(state) ||
    hasLegacyForgeSessionPersistence(state) ||
    hasLegacyWorkspacePaths(state);
}

function hasLegacyForgeResponses(state: AppState): boolean {
  return (state.forgeSessions ?? []).some((session) =>
    (session.followUp && session.followUp.mode !== "llm") ||
    (session.template && session.template.mode !== "llm")
  );
}

function hasLegacyForgeSessionPersistence(state: AppState): boolean {
  return (state.forgeSessions ?? []).some((session) =>
    !session.viewState ||
    (session.activeOperation && (
      !session.activeOperation.lastActivityAt ||
      session.activeOperation.recoveryCount === undefined
    )) ||
    (session.lastOperation && (
      !session.lastOperation.lastActivityAt ||
      session.lastOperation.recoveryCount === undefined
    ))
  );
}
