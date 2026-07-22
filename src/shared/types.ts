export type SkillValidationSeverity = "error" | "warning";

export type WorkspaceRole = "owner" | "admin" | "member" | "viewer";

export type AuthProvider = "google" | "github";

export type AssetKind = "skill";

export type AssetHealth = "valid" | "warning" | "error" | "unknown";

export type AssetVersionSource = "upload" | "project-sync" | "migration" | "rollback" | "scan";

export type StorageProvider = "s3";
export const SKILL_FILES_CHECKSUM_ALGORITHM = "skill-files-v2" as const;

export interface StoredObject {
  provider: StorageProvider;
  layout: "files";
  bucket: string;
  /** S3 prefix containing one object per canonical Skill file. */
  key: string;
  region?: string;
  endpoint?: string;
  size: number;
  fileCount: number;
  contentType: "application/vnd.harhub.skill-directory";
  /** Digest of the sorted file paths and contents, used to key generated zip caches. */
  checksum: string;
  /** Absent for checksums created before canonical path ordering was versioned. */
  checksumAlgorithm?: typeof SKILL_FILES_CHECKSUM_ALGORITHM;
  uploadedAt: string;
}

export interface StorageStatus {
  provider: StorageProvider;
  configured: boolean;
  bucket?: string;
  region?: string;
  endpoint?: string;
  prefix?: string;
  publicBaseUrl?: string;
}

export interface AccountProfile {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  updatedAt?: string;
}

export interface AccountIdentity {
  id: string;
  accountId: string;
  provider: AuthProvider;
  providerAccountId: string;
  email: string;
  createdAt: string;
  updatedAt?: string;
}

export interface WorkspaceRecord {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt?: string;
}

export interface WorkspaceMembership {
  id: string;
  accountId: string;
  workspaceId: string;
  role: WorkspaceRole;
  createdAt: string;
  updatedAt?: string;
}

export type AiProvider = "openai-compatible";

export interface WorkspaceAiSettings {
  workspaceId: string;
  provider: AiProvider;
  baseUrl: string;
  model: string;
  configured: boolean;
  apiKeyHint?: string;
  updatedAt?: string;
  canManage: boolean;
}

export interface WorkspaceAiSettingsUpdate {
  provider: AiProvider;
  baseUrl: string;
  model: string;
  apiKey?: string;
  clearApiKey?: boolean;
}

export interface WorkspaceAiConnectionTestRequest {
  provider: AiProvider;
  baseUrl: string;
  model: string;
  apiKey?: string;
}

export interface WorkspaceAiConnectionTestResult {
  ok: true;
  model: string;
  latencyMs: number;
}

export type WorkspaceInvitationStatus = "pending" | "accepted" | "revoked";

export interface WorkspaceInvitation {
  id: string;
  workspaceId: string;
  email: string;
  role: WorkspaceRole;
  token: string;
  invitedByAccountId: string;
  status: WorkspaceInvitationStatus;
  createdAt: string;
  expiresAt: string;
  updatedAt?: string;
  acceptedAt?: string;
  acceptedByAccountId?: string;
}

export interface WorkspaceMember {
  account: AccountProfile;
  membership: WorkspaceMembership;
}

export interface SessionPayload {
  account: AccountProfile;
  workspaces: WorkspaceRecord[];
  memberships: WorkspaceMembership[];
}

export interface SkillSource {
  root: string;
  path: string;
  absolutePath: string;
  repository?: string;
  branch?: string;
  commit?: string;
}

export interface SkillRecord {
  id: string;
  name: string;
  displayName: string;
  slug: string;
  description: string;
  headings: string[];
  source: SkillSource;
}

export interface SkillCatalog {
  schemaVersion: 1;
  generatedAt: string;
  workspaceId?: string;
  skills: SkillRecord[];
}

export interface AssetRecord {
  id: string;
  kind: AssetKind;
  name: string;
  displayName: string;
  slug: string;
  description: string;
  health: AssetHealth;
  storage?: StoredObject;
  validation: {
    errors: number;
    warnings: number;
  };
  validationIssues?: ValidationIssue[];
  /** Monotonically increasing Harhub revision for this workspace asset. */
  version?: number;
  createdAt?: string;
  updatedAt?: string;
  /** Full audit history is returned by detail APIs and omitted from list payloads. */
  versionHistory?: AssetVersionRecord[];
}

export interface AssetVersionRecord {
  version: number;
  createdAt: string;
  source: AssetVersionSource;
  createdByAccountId?: string;
  summary: string;
  changes: string[];
  checksum?: string;
  fileCount?: number;
  size?: number;
  displayName: string;
  description: string;
  health: AssetHealth;
  validation: AssetRecord["validation"];
  /** Retained package snapshot used for version download and rollback. */
  storage?: StoredObject;
}

export interface AssetShareRecord {
  token: string;
  workspaceId: string;
  assetId: string;
  createdByAccountId: string;
  createdAt: string;
}

export interface PublicSharedAsset {
  id: string;
  kind: AssetKind;
  name: string;
  displayName: string;
  slug: string;
  description: string;
  health: AssetHealth;
  validation: AssetRecord["validation"];
  version?: number;
  updatedAt?: string;
  fileCount: number;
  size: number;
}

export interface AssetShareResponse {
  token: string;
  createdAt: string;
  shareUrl: string;
  downloadUrl: string;
  cliCommand: string;
  skillsCliCommand: string;
  fileName: string;
  asset: PublicSharedAsset;
}

export interface AgentSkillsDiscoveryIndex {
  $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json";
  skills: Array<{
    name: string;
    type: "archive";
    description: string;
    url: string;
    digest: `sha256:${string}`;
  }>;
}

export interface AssetCatalog {
  schemaVersion: 1 | 2;
  generatedAt: string;
  workspaceId?: string;
  assets: AssetRecord[];
  skills: SkillRecord[];
}

export interface AssetFileTreeNode {
  name: string;
  path: string;
  type: "directory" | "file";
  size?: number;
  children?: AssetFileTreeNode[];
}

export interface AssetFileSummary {
  path: string;
  name: string;
  size: number;
  isText: boolean;
}

export interface AssetFilePreview {
  path: string;
  name: string;
  size: number;
  isText: boolean;
  truncated: boolean;
  content?: string;
}

export interface AssetContentPreview {
  tree: AssetFileTreeNode[];
  files: AssetFileSummary[];
  selectedFile?: AssetFilePreview;
}

export interface AssetPreview extends AssetContentPreview {
  asset: AssetRecord;
}

export interface SkillImportCandidate {
  skillPath: string;
  rootPath: string;
  name: string;
  displayName: string;
  description: string;
  health: AssetHealth;
  validation: AssetRecord["validation"];
  validationIssues: ValidationIssue[];
  fileCount: number;
  size: number;
}

export interface SkillImportPreview {
  fileName: string;
  fileSize: number;
  candidates: SkillImportCandidate[];
}

export interface ValidationIssue {
  severity: SkillValidationSeverity;
  code: string;
  message: string;
  path?: string;
  skillId?: string;
  assetId?: string;
}

export type HarnessBuilderMode = "llm";

export interface HarnessInterviewAnswer {
  question: string;
  answer: string;
}

export type HarnessFollowUpComponentType = "single-select" | "multi-select" | "text";

export interface HarnessFollowUpOption {
  label: string;
  description?: string;
}

export interface HarnessFollowUpComponent {
  type: HarnessFollowUpComponentType;
  options: HarnessFollowUpOption[];
  placeholder?: string;
  allowCustom?: boolean;
  maxSelections?: number;
}

export interface HarnessFollowUpQuestion {
  question: string;
  component: HarnessFollowUpComponent;
}

export interface HarnessFollowUpRequest {
  requirement: string;
  answers: HarnessInterviewAnswer[];
  sessionId?: string;
}

export interface HarnessFollowUpResponse {
  mode: HarnessBuilderMode;
  /** AI-generated semantic name for the session. Optional for legacy persisted sessions. */
  sessionTitle?: string;
  ready: boolean;
  questions?: HarnessFollowUpQuestion[];
  /** Legacy single-question fields retained for persisted sessions created before question batches. */
  question?: string;
  component?: HarnessFollowUpComponent;
}

export interface HarnessTemplateFile {
  path: string;
  content: string;
}

export interface HarnessTemplateProfile {
  name: string;
  slug: string;
  summary: string;
  targetUsers: string[];
  goals: string[];
  constraints: string[];
  successCriteria: string[];
  stackNotes: string[];
}

export interface HarnessWorkspaceAssetSummary {
  id: string;
  kind: AssetKind;
  name: string;
  displayName: string;
  slug: string;
  description: string;
  health: AssetHealth;
  fileCount: number;
  size: number;
}

export interface HarnessTemplateAssetSelection extends HarnessWorkspaceAssetSummary {
  reason: string;
  installPath: string;
}

export interface HarnessTemplateResponse {
  mode: HarnessBuilderMode;
  generatedAt: string;
  profile: HarnessTemplateProfile;
  selectedAssets: HarnessTemplateAssetSelection[];
  files: HarnessTemplateFile[];
}

export type ForgeAiOperation = "connection-test" | "follow-up" | "generate";

export type ForgeAiFailureCode =
  | "configuration"
  | "cancelled"
  | "timeout"
  | "network"
  | "rate_limited"
  | "provider_auth"
  | "provider_rejected"
  | "provider_unavailable"
  | "invalid_response"
  | "unknown";

export interface ForgeAiOperationFailure {
  operationId: string;
  operation: ForgeAiOperation;
  code: ForgeAiFailureCode;
  message: string;
  retryable: boolean;
  attempts: number;
  durationMs: number;
  occurredAt: string;
}

export interface ForgeSessionOperation {
  operationId: string;
  operation: Exclude<ForgeAiOperation, "connection-test">;
  startedAt: string;
  lastActivityAt: string;
  attempt: number;
  maxAttempts?: number;
  /** Number of times an interrupted persisted operation was restarted by a new runtime. */
  recoveryCount: number;
  progress?: Partial<Record<ForgeGenerationProgressStep, ForgeGenerationProgressStatus>>;
}

export type ForgeGenerationProgressStep = "context" | "assets" | "compose" | "save";
export type ForgeGenerationProgressStatus = "active" | "complete";

export type ForgeOperationStreamEvent =
  | {
      type: "operation";
      operationId: string;
      operation: Exclude<ForgeAiOperation, "connection-test">;
    }
  | {
      type: "attempt";
      operationId: string;
      operation: Exclude<ForgeAiOperation, "connection-test">;
      attempt: number;
      maxAttempts: number;
    }
  | {
      type: "session";
      operationId: string;
      operation: Exclude<ForgeAiOperation, "connection-test">;
      session: ForgeSessionDetail;
    }
  | {
      type: "progress";
      operationId: string;
      operation: "generate";
      step: ForgeGenerationProgressStep;
      status: ForgeGenerationProgressStatus;
    }
  | {
      type: "delta";
      operationId: string;
      operation: Exclude<ForgeAiOperation, "connection-test">;
      attempt: number;
      delta: string;
    }
  | {
      type: "complete";
      operationId: string;
      operation: "follow-up";
      followUp: HarnessFollowUpResponse;
      session: ForgeSessionDetail;
    }
  | {
      type: "complete";
      operationId: string;
      operation: "generate";
      template: HarnessTemplateResponse;
      session: ForgeSessionDetail;
    }
  | {
      type: "error";
      operationId: string;
      operation: Exclude<ForgeAiOperation, "connection-test">;
      failure: ForgeAiOperationFailure;
      session?: ForgeSessionDetail;
    };

export type ForgeSessionStatus = "interviewing" | "working" | "failed" | "complete";

export type ProjectStatus = "active" | "archived";
export type ProjectBindingKind = "skill" | "mcp" | "rule";
export type ProjectBindingSource = "harhub" | "framework" | "repository";
export type ProjectBindingStatus = "pending" | "synced" | "added" | "modified" | "missing";

export interface ProjectSkillForkSummary {
  digest: string;
  fileCount: number;
  size: number;
  validation: {
    errors: number;
    warnings: number;
  };
  updatedAt: string;
}

export interface ProjectRepository {
  provider: "github";
  owner: string;
  name: string;
  url: string;
  defaultBranch: string;
}

export interface ProjectBinding {
  id: string;
  kind: ProjectBindingKind;
  name: string;
  path: string;
  source: ProjectBindingSource;
  status: ProjectBindingStatus;
  assetId?: string;
  sourceDigest?: string;
  repositoryDigest?: string;
  lastSeenAt?: string;
  fork?: ProjectSkillForkSummary;
}

export interface ProjectSyncState {
  status: "awaiting-first-sync" | "synced";
  revision: number;
  lastSyncedAt?: string;
  lastCommitSha?: string;
  lastRef?: string;
  lastRunId?: string;
}

export interface HarhubProject {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  description: string;
  status: ProjectStatus;
  repository?: ProjectRepository;
  bindings: ProjectBinding[];
  sync: ProjectSyncState;
  sourceForgeSessionId?: string;
  syncTokenConfigured: boolean;
  syncTokenLastFour?: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

export interface ProjectListResponse {
  projects: HarhubProject[];
}

export interface ProjectTokenResponse {
  project: HarhubProject;
  syncToken?: string;
}

export interface ProjectRepositoryBindingInput {
  kind: ProjectBindingKind;
  name: string;
  path: string;
  digest: string;
  /** Absent for collectors generated before Skill digest ordering was versioned. */
  digestAlgorithm?: typeof SKILL_FILES_CHECKSUM_ALGORITHM;
}

export type ProjectSkillDiffStatus = "added" | "modified" | "removed";

export interface ProjectSkillDiffFile {
  path: string;
  status: ProjectSkillDiffStatus;
}

export interface ProjectSkillDiffResponse {
  bindingId: string;
  name: string;
  path: string;
  status: Extract<ProjectBindingStatus, "added" | "modified">;
  baseAssetId?: string;
  fork: ProjectSkillForkSummary;
  files: ProjectSkillDiffFile[];
  selectedFile?: {
    path: string;
    status: ProjectSkillDiffStatus;
    baseContent?: string;
    forkContent?: string;
    binary: boolean;
    truncated: boolean;
  };
}

export interface ProjectSkillPublishResponse {
  project: HarhubProject;
  asset: AssetRecord;
}

export interface ProjectSyncRequest {
  schemaVersion: 1;
  repository: string;
  commitSha: string;
  ref: string;
  runId?: string;
  bindings: ProjectRepositoryBindingInput[];
}

export interface ProjectSyncResponse {
  projectId: string;
  revision: number;
  syncedAt: string;
  counts: Record<ProjectBindingStatus, number>;
}

export interface ForgeFrozenProjectReference {
  id: string;
  name: string;
  frozenAt: string;
}

export type ForgeMarkdownViewMode = "preview" | "code";

export interface ForgeSessionFollowUpDraft {
  question: string;
  selectedOptions: string[];
  customAnswer: string;
}

/**
 * Durable, user-controlled Forge view state. Runtime streams, partial model output,
 * request controllers, cached file bodies, and open overlays intentionally stay ephemeral.
 */
export interface ForgeSessionViewState {
  followUpDrafts: ForgeSessionFollowUpDraft[];
  markdownView: ForgeMarkdownViewMode;
  selectedPath?: string;
  /** Undefined uses the product defaults; an empty array means every directory is expanded. */
  collapsedTreePaths?: string[];
  projectDraft?: {
    name: string;
  };
}

export interface ForgeSessionSummary {
  id: string;
  title: string;
  status: ForgeSessionStatus;
  answerCount: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export interface ForgeSessionDetail extends ForgeSessionSummary {
  requirement: string;
  answers: HarnessInterviewAnswer[];
  followUp?: HarnessFollowUpResponse;
  template?: HarnessTemplateResponse;
  failure?: ForgeAiOperationFailure;
  activeOperation?: ForgeSessionOperation;
  /** Last terminal or interrupted operation checkpoint retained for diagnostics. */
  lastOperation?: ForgeSessionOperation;
  frozenProject?: ForgeFrozenProjectReference;
  viewState: ForgeSessionViewState;
}

export interface ForgeSessionListResponse {
  sessions: ForgeSessionSummary[];
  cache: {
    maxSessions: number;
    ttlDays: number;
  };
}
