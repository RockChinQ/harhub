export type SkillValidationSeverity = "error" | "warning";

export type WorkspaceRole = "owner" | "admin" | "member" | "viewer";

export type AuthProvider = "google" | "github";

export type AssetKind = "skill";

export type AssetHealth = "valid" | "warning" | "error" | "unknown";

export type StorageProvider = "s3";

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
  schemaVersion: 1;
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
