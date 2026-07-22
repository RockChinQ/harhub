import { createHash, randomBytes, randomUUID } from "node:crypto";
import { toPublicAccount } from "./records.js";
import {
  acceptMatchingPendingInvitations,
  ensureAccountHasWorkspace
} from "./invitations.js";
import { hashPassword, verifyPassword } from "./passwords.js";
import { serializeStateAccess } from "./access.js";
import { loadState, saveState } from "./store.js";
import type {
  AccountProfile,
  AuthProvider,
  WorkspaceMembership,
  WorkspaceRecord
} from "../shared/types.js";
import type {
  AccountRecord,
  AppState,
  AuthContext,
  OAuthStateRecord
} from "./types.js";

const EMAIL_CODE_TTL_MS = 10 * 60 * 1000;
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

interface AuthenticatedSignInResult {
  account: AccountProfile;
  token: string;
}

interface PasswordSignInInput {
  email: string;
  password: string;
  inviteToken?: string;
}

interface DevelopmentSignInInput {
  email: string;
  inviteToken?: string;
}

interface EmailCodeVerificationInput {
  email: string;
  code: string;
  inviteToken?: string;
}

interface OAuthProfileSignInInput {
  provider: AuthProvider;
  providerAccountId: string;
  email: string;
  emailVerified: boolean;
  name: string;
  inviteToken?: string;
}

function appendSession(state: AppState, accountId: string): string {
  const token = randomBytes(32).toString("hex");
  state.sessions.push({
    token,
    accountId,
    createdAt: new Date().toISOString()
  });
  return token;
}

export async function createSession(accountId: string): Promise<string> {
  return serializeStateAccess(async () => {
    const state = await loadState();
    const token = appendSession(state, accountId);
    await saveState(state);
    return token;
  });
}

export async function deleteSession(token: string): Promise<void> {
  return serializeStateAccess(async () => {
    const state = await loadState();
    state.sessions = state.sessions.filter((session) => session.token !== token);
    await saveState(state);
  });
}

export async function authenticate(token: string | undefined): Promise<AuthContext | undefined> {
  if (!token) return undefined;
  const state = await loadState();
  const session = state.sessions.find((item) => item.token === token);
  if (!session) return undefined;

  const account = state.accounts.find((item) => item.id === session.accountId);
  if (!account) return undefined;

  return {
    account: toPublicAccount(account),
    session
  };
}

export async function listAccountWorkspaces(accountId: string): Promise<{
  account: AccountProfile;
  workspaces: WorkspaceRecord[];
  memberships: WorkspaceMembership[];
}> {
  const state = await loadState();
  const account = state.accounts.find((item) => item.id === accountId);
  if (!account) {
    throw new Error("Account not found.");
  }

  const memberships = state.memberships.filter((item) => item.accountId === accountId);
  const workspaceIds = new Set(memberships.map((item) => item.workspaceId));

  return {
    account: toPublicAccount(account),
    memberships,
    workspaces: state.workspaces.filter((item) => workspaceIds.has(item.id))
  };
}

export function signInWithPassword(
  input: PasswordSignInInput,
  issueSession: true
): Promise<AuthenticatedSignInResult>;
export function signInWithPassword(
  input: PasswordSignInInput,
  issueSession?: false
): Promise<AccountProfile>;
export async function signInWithPassword(
  input: PasswordSignInInput,
  issueSession = false
): Promise<AccountProfile | AuthenticatedSignInResult> {
  return serializeStateAccess(async () => {
    const state = await loadState();
    const email = normalizeEmail(input.email);
    if (!email) throw new Error("A valid email is required.");

    const matchingAccounts = state.accounts.filter(
      (item) => normalizeEmail(item.email) === email
    );
    const passwordCandidates = matchingAccounts.some((item) => item.emailVerifiedAt)
      ? matchingAccounts.filter((item) => item.emailVerifiedAt)
      : matchingAccounts;
    let account = passwordCandidates.find((item) =>
      verifyPassword(input.password, item.passwordHash)
    );

    if (matchingAccounts.length > 0) {
      if (!account) throw new Error("Invalid email or password.");
      account.email = email;
      account.updatedAt = new Date().toISOString();
    } else {
      if (input.password.length < 6) {
        throw new Error("Password must be at least 6 characters.");
      }

      account = {
        id: randomUUID(),
        email,
        name: email.split("@")[0] ?? "User",
        passwordHash: hashPassword(input.password),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      state.accounts.push(account);
    }

    acceptMatchingPendingInvitations(state, account, input.inviteToken);
    ensureAccountHasWorkspace(state, account);
    const profile = toPublicAccount(account);
    const token = issueSession ? appendSession(state, account.id) : undefined;
    await saveState(state);
    return token ? { account: profile, token } : profile;
  });
}

export function signInForDevelopment(
  input: DevelopmentSignInInput,
  issueSession: true
): Promise<AuthenticatedSignInResult>;
export function signInForDevelopment(
  input: DevelopmentSignInInput,
  issueSession?: false
): Promise<AccountProfile>;
export async function signInForDevelopment(
  input: DevelopmentSignInInput,
  issueSession = false
): Promise<AccountProfile | AuthenticatedSignInResult> {
  return serializeStateAccess(async () => {
    const state = await loadState();
    const email = normalizeEmail(input.email);
    if (!email) throw new Error("A valid email is required.");

    const { account, mergedAccountIds } = resolveAccountByEmail(state, {
      email,
      name: email.split("@")[0] ?? "User"
    }, true);
    acceptMatchingPendingInvitations(state, account, input.inviteToken);
    ensureAccountHasWorkspace(state, account);
    account.updatedAt = new Date().toISOString();
    const profile = toPublicAccount(account);
    const token = issueSession ? appendSession(state, account.id) : undefined;
    await saveState(state, accountReferenceReplacement(mergedAccountIds, account.id));
    return token ? { account: profile, token } : profile;
  });
}

export async function createEmailLoginCode(input: {
  email: string;
  inviteToken?: string;
}): Promise<{ email: string; code: string; expiresAt: string }> {
  return serializeStateAccess(async () => {
    const state = await loadState();
    const email = normalizeEmail(input.email);
    if (!email) throw new Error("A valid email is required.");

    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const expiresAt = new Date(Date.now() + EMAIL_CODE_TTL_MS).toISOString();
    state.emailLoginCodes = state.emailLoginCodes.filter(
      (item) => !item.consumedAt && new Date(item.expiresAt).getTime() > Date.now()
    );
    state.emailLoginCodes.push({
      id: randomUUID(),
      email,
      codeHash: hashCode(email, code),
      inviteToken: input.inviteToken,
      attempts: 0,
      createdAt: new Date().toISOString(),
      expiresAt
    });
    await saveState(state);
    return { email, code, expiresAt };
  });
}

export function verifyEmailLoginCode(
  input: EmailCodeVerificationInput,
  issueSession: true
): Promise<AuthenticatedSignInResult>;
export function verifyEmailLoginCode(
  input: EmailCodeVerificationInput,
  issueSession?: false
): Promise<AccountProfile>;
export async function verifyEmailLoginCode(
  input: EmailCodeVerificationInput,
  issueSession = false
): Promise<AccountProfile | AuthenticatedSignInResult> {
  return serializeStateAccess(async () => {
    const state = await loadState();
  const email = normalizeEmail(input.email);
  if (!email) throw new Error("A valid email is required.");

  const record = [...state.emailLoginCodes]
    .reverse()
    .find((item) => item.email === email && !item.consumedAt);
  if (!record || new Date(record.expiresAt).getTime() <= Date.now()) {
    throw new Error("Verification code is invalid or expired.");
  }
  if (record.attempts >= 5) {
    throw new Error("Verification code has too many failed attempts.");
  }
  if (record.codeHash !== hashCode(email, input.code.trim())) {
    record.attempts += 1;
    await saveState(state);
    throw new Error("Verification code is invalid or expired.");
  }

  record.consumedAt = new Date().toISOString();
  const { account, mergedAccountIds } = resolveAccountByEmail(state, {
    email,
    name: email.split("@")[0] ?? "User"
  }, true);
  acceptMatchingPendingInvitations(state, account, input.inviteToken ?? record.inviteToken);
  ensureAccountHasWorkspace(state, account);
  account.updatedAt = new Date().toISOString();
  const profile = toPublicAccount(account);
  const token = issueSession ? appendSession(state, account.id) : undefined;
  await saveState(state, accountReferenceReplacement(mergedAccountIds, account.id));
  return token ? { account: profile, token } : profile;
  });
}

export async function createOAuthState(input: {
  provider: AuthProvider;
  redirectPath: string;
  inviteToken?: string;
}): Promise<OAuthStateRecord> {
  return serializeStateAccess(async () => {
    const state = await loadState();
    const record: OAuthStateRecord = {
      state: randomBytes(32).toString("base64url"),
      provider: input.provider,
      redirectPath: normalizeRedirectPath(input.redirectPath),
      inviteToken: input.inviteToken,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS).toISOString()
    };
    state.oauthStates = state.oauthStates.filter(
      (item) => new Date(item.expiresAt).getTime() > Date.now()
    );
    state.oauthStates.push(record);
    await saveState(state);
    return record;
  });
}

export async function consumeOAuthState(
  provider: AuthProvider,
  stateValue: string
): Promise<OAuthStateRecord> {
  return serializeStateAccess(async () => {
    const state = await loadState();
    const record = state.oauthStates.find(
      (item) => item.provider === provider && item.state === stateValue
    );
    if (!record || new Date(record.expiresAt).getTime() <= Date.now()) {
      throw new Error("OAuth state is invalid or expired.");
    }
    state.oauthStates = state.oauthStates.filter((item) => item.state !== stateValue);
    await saveState(state);
    return record;
  });
}

export function signInWithOAuthProfile(
  input: OAuthProfileSignInInput,
  issueSession: true
): Promise<AuthenticatedSignInResult>;
export function signInWithOAuthProfile(
  input: OAuthProfileSignInInput,
  issueSession?: false
): Promise<AccountProfile>;
export async function signInWithOAuthProfile(
  input: OAuthProfileSignInInput,
  issueSession = false
): Promise<AccountProfile | AuthenticatedSignInResult> {
  return serializeStateAccess(async () => {
    const state = await loadState();
  const email = normalizeEmail(input.email);
  if (!email) throw new Error("OAuth provider did not return an email.");
  if (!input.emailVerified) {
    throw new Error("OAuth provider did not return a verified email.");
  }

  const existingIdentity = state.identities.find(
    (identity) =>
      identity.provider === input.provider &&
      identity.providerAccountId === input.providerAccountId
  );
  const now = new Date().toISOString();
  const { account, mergedAccountIds } = resolveAccountByEmail(state, {
    email,
    name: input.name
  }, true, now);

  if (!existingIdentity) {
    state.identities.push({
      id: randomUUID(),
      accountId: account.id,
      provider: input.provider,
      providerAccountId: input.providerAccountId,
      email,
      createdAt: now,
      updatedAt: now
    });
  } else {
    existingIdentity.accountId = account.id;
    existingIdentity.email = email;
    existingIdentity.updatedAt = now;
  }

  account.email = email;
  account.name = input.name.trim() || account.name;
  account.updatedAt = now;
  acceptMatchingPendingInvitations(state, account, input.inviteToken);
  ensureAccountHasWorkspace(state, account);
  const profile = toPublicAccount(account);
  const token = issueSession ? appendSession(state, account.id) : undefined;
  await saveState(state, accountReferenceReplacement(mergedAccountIds, account.id));
  return token ? { account: profile, token } : profile;
  });
}

function mergeAccountInto(
  state: AppState,
  sourceAccountId: string,
  targetAccountId: string,
  now: string
): void {
  if (sourceAccountId === targetAccountId) return;
  requireAccountRecord(state, sourceAccountId);
  requireAccountRecord(state, targetAccountId);

  for (const sourceMembership of state.memberships.filter(
    (membership) => membership.accountId === sourceAccountId
  )) {
    const targetMembership = state.memberships.find(
      (membership) =>
        membership.accountId === targetAccountId &&
        membership.workspaceId === sourceMembership.workspaceId
    );
    if (!targetMembership) {
      sourceMembership.accountId = targetAccountId;
      sourceMembership.updatedAt = now;
      continue;
    }
    if (workspaceRoleRank(sourceMembership.role) > workspaceRoleRank(targetMembership.role)) {
      targetMembership.role = sourceMembership.role;
    }
    if (sourceMembership.createdAt < targetMembership.createdAt) {
      targetMembership.createdAt = sourceMembership.createdAt;
    }
    targetMembership.updatedAt = now;
    state.memberships = state.memberships.filter(
      (membership) => membership.id !== sourceMembership.id
    );
  }

  for (const identity of state.identities) {
    if (identity.accountId === sourceAccountId) identity.accountId = targetAccountId;
  }
  for (const session of state.sessions) {
    if (session.accountId === sourceAccountId) session.accountId = targetAccountId;
  }
  for (const invitation of state.invitations) {
    if (invitation.invitedByAccountId === sourceAccountId) {
      invitation.invitedByAccountId = targetAccountId;
    }
    if (invitation.acceptedByAccountId === sourceAccountId) {
      invitation.acceptedByAccountId = targetAccountId;
    }
  }
  for (const share of state.assetShares) {
    if (share.createdByAccountId === sourceAccountId) share.createdByAccountId = targetAccountId;
  }
  for (const authorization of state.deviceAuthorizations) {
    if (authorization.accountId === sourceAccountId) authorization.accountId = targetAccountId;
  }
  for (const configuration of state.workspaceAiConfigurations) {
    if (configuration.updatedByAccountId === sourceAccountId) {
      configuration.updatedByAccountId = targetAccountId;
    }
  }
  for (const session of state.forgeSessions) {
    if (session.accountId === sourceAccountId) session.accountId = targetAccountId;
  }
  for (const authorization of state.githubInstallationAuthorizations) {
    if (authorization.accountId === sourceAccountId) authorization.accountId = targetAccountId;
  }
  for (const installation of state.githubInstallations) {
    if (installation.linkedByAccountId === sourceAccountId) {
      installation.linkedByAccountId = targetAccountId;
    }
  }
  const installationsByAccount = new Map<
    string,
    (typeof state.githubInstallations)[number]
  >();
  for (const installation of state.githubInstallations) {
    const key = `${installation.linkedByAccountId}\u0000${installation.id}`;
    const existing = installationsByAccount.get(key);
    if (!existing || installation.linkedAt > existing.linkedAt) {
      installationsByAccount.set(key, installation);
    }
  }
  state.githubInstallations = [...installationsByAccount.values()];
  for (const policy of state.projectBindingPolicies) {
    if (policy.decidedByAccountId === sourceAccountId) policy.decidedByAccountId = targetAccountId;
  }
  for (const proposal of state.projectChangeProposals) {
    if (proposal.createdByAccountId === sourceAccountId) {
      proposal.createdByAccountId = targetAccountId;
    }
  }
  for (const event of state.auditEvents) {
    if (event.actorAccountId === sourceAccountId) event.actorAccountId = targetAccountId;
  }

  state.accounts = state.accounts.filter((candidate) => candidate.id !== sourceAccountId);
}

function workspaceRoleRank(role: WorkspaceMembership["role"]): number {
  return { viewer: 0, member: 1, admin: 2, owner: 3 }[role];
}

export async function updateAccountProfile(
  accountId: string,
  input: { name?: string; email?: string }
): Promise<AccountProfile> {
  return serializeStateAccess(async () => {
    const state = await loadState();
    const account = state.accounts.find((item) => item.id === accountId);
    if (!account) throw new Error("Account not found.");

    const nextEmail = input.email === undefined ? undefined : normalizeEmail(input.email);
    if (nextEmail !== undefined) {
      if (!nextEmail) throw new Error("A valid email is required.");
      if (nextEmail !== normalizeEmail(account.email)) {
        throw new Error("Account email is managed by sign-in and cannot be changed here.");
      }
    }

    if (input.name?.trim()) {
      account.name = input.name.trim();
    }

    account.updatedAt = new Date().toISOString();
    await saveState(state);
    return toPublicAccount(account);
  });
}

export async function changeAccountPassword(
  accountId: string,
  input: { currentPassword: string; newPassword: string }
): Promise<void> {
  return serializeStateAccess(async () => {
    const state = await loadState();
    const account = state.accounts.find((item) => item.id === accountId);
    if (!account) throw new Error("Account not found.");

    if (!verifyPassword(input.currentPassword, account.passwordHash)) {
      throw new Error("Current password is incorrect.");
    }

    if (input.newPassword.length < 6) {
      throw new Error("Password must be at least 6 characters.");
    }

    account.passwordHash = hashPassword(input.newPassword);
    account.updatedAt = new Date().toISOString();
    state.sessions = state.sessions.filter((session) => session.accountId !== accountId);
    await saveState(state);
  });
}

function resolveAccountByEmail(
  state: Awaited<ReturnType<typeof loadState>>,
  input: { email: string; name: string },
  emailVerified: boolean,
  now = new Date().toISOString()
): { account: AccountRecord; mergedAccountIds: string[] } {
  const matches = state.accounts
    .filter((item) => normalizeEmail(item.email) === input.email)
    .sort((left, right) =>
      Number(Boolean(right.emailVerifiedAt)) - Number(Boolean(left.emailVerifiedAt)) ||
      left.createdAt.localeCompare(right.createdAt) ||
      left.id.localeCompare(right.id)
    );
  const account = matches[0] ?? createAccount(state, input);
  if (emailVerified) {
    const unverifiedMatches = matches.filter((candidate) => !candidate.emailVerifiedAt);
    const unverifiedAccountIds = new Set(unverifiedMatches.map((candidate) => candidate.id));
    for (const candidate of unverifiedMatches) {
      candidate.passwordHash = hashPassword(randomBytes(32).toString("hex"));
    }
    state.sessions = state.sessions.filter(
      (session) => !unverifiedAccountIds.has(session.accountId)
    );
  }
  const mergedAccountIds = matches.slice(1).map((candidate) => candidate.id);
  for (const duplicateAccountId of mergedAccountIds) {
    mergeAccountInto(state, duplicateAccountId, account.id, now);
  }
  if (emailVerified && !account.emailVerifiedAt) {
    account.emailVerifiedAt = now;
    account.passwordHash = hashPassword(randomBytes(32).toString("hex"));
    state.sessions = state.sessions.filter((session) => session.accountId !== account.id);
  }
  account.email = input.email;
  return { account, mergedAccountIds };
}

function accountReferenceReplacement(sourceAccountIds: string[], targetAccountId: string): {
  accountReferenceReplacement?: {
    sourceAccountIds: string[];
    targetAccountId: string;
  };
} {
  return sourceAccountIds.length > 0
    ? { accountReferenceReplacement: { sourceAccountIds, targetAccountId } }
    : {};
}

function createAccount(
  state: Awaited<ReturnType<typeof loadState>>,
  input: { email: string; name: string }
): AccountRecord {
  const account: AccountRecord = {
    id: randomUUID(),
    email: input.email,
    name: input.name.trim() || (input.email.split("@")[0] ?? "User"),
    passwordHash: hashPassword(randomBytes(32).toString("hex")),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  state.accounts.push(account);
  return account;
}

function requireAccountRecord(
  state: Awaited<ReturnType<typeof loadState>>,
  accountId: string
): AccountRecord {
  const account = state.accounts.find((item) => item.id === accountId);
  if (!account) throw new Error("Account not found.");
  return account;
}

function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  return normalized.includes("@") ? normalized : "";
}

function normalizeRedirectPath(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/api")) {
    return "/skills";
  }
  return path;
}

function randomInt(min: number, max: number): number {
  const range = max - min;
  const value = Number.parseInt(randomBytes(4).toString("hex"), 16);
  return min + (value % range);
}

function hashCode(email: string, code: string): string {
  return createHash("sha256").update(`${email}:${code}`).digest("hex");
}
