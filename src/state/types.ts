import type {
  AccountProfile,
  AccountIdentity,
  AssetShareRecord,
  AuthProvider,
  WorkspaceInvitation,
  WorkspaceMembership,
  WorkspaceRecord
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
}

export interface AuthContext {
  account: AccountProfile;
  session: SessionRecord;
}

export interface WorkspaceContext extends AuthContext {
  workspace: WorkspaceRecord;
  membership: WorkspaceMembership;
}
