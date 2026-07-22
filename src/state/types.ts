import type {
  AccountProfile,
  AccountIdentity,
  AssetShareRecord,
  AuthProvider,
  WorkspaceInvitation,
  WorkspaceMembership,
  WorkspaceRecord,
  ForgeSessionDetail,
  HarhubProject,
  GitHubInstallation,
  ProjectBindingPolicy,
  ProjectChangeProposal,
  ProjectInventorySnapshot,
  ProjectRepositoryConnection,
  ProjectScanJob,
  ProjectSkillForkSummary,
  StoredObject,
  ValidationIssue,
  WorkspaceAuditEvent
} from "../shared/types.js";

export interface AccountRecord extends AccountProfile {
  passwordHash: string;
  emailVerifiedAt?: string;
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
  schemaVersion: 1 | 2;
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
  /** Local fallback records; hosted Postgres stores these in normalized tables. */
  githubInstallations: GitHubInstallation[];
  projectRepositoryConnections: ProjectRepositoryConnectionRecord[];
  projectScanJobs: ProjectScanJob[];
  projectInventorySnapshots: ProjectInventorySnapshot[];
  projectInventoryFiles: ProjectInventoryFileRecord[];
  projectBindingPolicies: ProjectBindingPolicy[];
  projectChangeProposals: ProjectChangeProposal[];
  githubWebhookDeliveries: GitHubWebhookDeliveryRecord[];
  githubInstallationAuthorizations: GitHubInstallationAuthorizationRecord[];
  /** Local fallback only; Postgres stores events in harhub_audit_events. */
  auditEvents: WorkspaceAuditEvent[];
}

export interface GitHubInstallationAuthorizationRecord {
  state: string;
  accountId: string;
  workspaceId: string;
  redirectPath: string;
  createdAt: string;
  expiresAt: string;
  installationId?: string;
}

export interface GitHubWebhookDeliveryRecord {
  deliveryId: string;
  event: string;
  action?: string;
  installationId?: string;
  repositoryId?: string;
  status: "received" | "processed" | "ignored" | "failed";
  receivedAt: string;
  processedAt?: string;
  error?: string;
}

export interface ProjectRepositoryConnectionRecord extends ProjectRepositoryConnection {
  workspaceId: string;
  projectId: string;
  repositoryId: string;
  repositoryNodeId: string;
  owner: string;
  name: string;
  defaultBranch: string;
}

export interface ProjectInventoryFileRecord {
  snapshotId: string;
  artifactId: string;
  path: string;
  contentBase64: string;
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
  syncTokenHash?: string;
  skillForkGeneration?: number;
  skillForks?: ProjectSkillForkRecord[];
}

export interface ProjectSkillForkRecord extends ProjectSkillForkSummary {
  path: string;
  storage: StoredObject;
  validationIssues: ValidationIssue[];
}
