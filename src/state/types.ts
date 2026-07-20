import type {
  AccountProfile,
  AccountIdentity,
  AssetShareRecord,
  AuthProvider,
  WorkspaceInvitation,
  WorkspaceMembership,
  WorkspaceRecord,
  ForgeSessionDetail,
  HarhubProject
} from "../shared/types.js";

export interface AccountRecord extends AccountProfile {
  passwordHash: string;
}

export interface SessionRecord {
  token: string;
  accountId: string;
  createdAt: string;
}

export interface EmailLoginCodeRecord {
  id: string;
  email: string;
  codeHash: string;
  inviteToken?: string;
  attempts: number;
  createdAt: string;
  expiresAt: string;
  consumedAt?: string;
}

export interface OAuthStateRecord {
  state: string;
  provider: AuthProvider;
  redirectPath: string;
  inviteToken?: string;
  createdAt: string;
  expiresAt: string;
}

export interface OAuthDeviceAuthorizationRecord {
  deviceCodeHash: string;
  userCode: string;
  clientId: string;
  scope: string;
  status: "pending" | "approved" | "denied" | "consumed";
  accountId?: string;
  intervalSeconds: number;
  lastPolledAt?: string;
  createdAt: string;
  expiresAt: string;
  approvedAt?: string;
  deniedAt?: string;
  consumedAt?: string;
}

export interface AppState {
  schemaVersion: 1;
  accounts: AccountRecord[];
  identities: AccountIdentity[];
  workspaces: WorkspaceRecord[];
  memberships: WorkspaceMembership[];
  invitations: WorkspaceInvitation[];
  assetShares: AssetShareRecord[];
  emailLoginCodes: EmailLoginCodeRecord[];
  oauthStates: OAuthStateRecord[];
  deviceAuthorizations: OAuthDeviceAuthorizationRecord[];
  sessions: SessionRecord[];
  workspaceAiConfigurations: WorkspaceAiConfigurationRecord[];
  forgeSessions: ForgeSessionCacheRecord[];
  projects: ProjectStateRecord[];
}

export interface AuthContext {
  account: AccountProfile;
  session: SessionRecord;
}

export interface WorkspaceContext extends AuthContext {
  workspace: WorkspaceRecord;
  membership: WorkspaceMembership;
}

export interface WorkspaceAiConfigurationRecord {
  workspaceId: string;
  provider: "openai-compatible";
  baseUrl: string;
  model: string;
  encryptedApiKey?: string;
  apiKeyLastFour?: string;
  updatedAt: string;
  updatedByAccountId: string;
}

export interface ForgeSessionCacheRecord extends ForgeSessionDetail {
  workspaceId: string;
  accountId: string;
}

export interface ProjectStateRecord extends HarhubProject {
  syncTokenHash: string;
}
