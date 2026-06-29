export type SkillLifecycleState =
  | "experimental"
  | "stable"
  | "deprecated"
  | "archived";

export type SkillValidationSeverity = "error" | "warning";

export type WorkspaceRole = "owner" | "admin" | "member" | "viewer";

export type AssetKind = "skill";

export type AssetLifecycleState = SkillLifecycleState;

export type AssetHealth = "valid" | "warning" | "error" | "unknown";

export type StorageProvider = "s3";

export interface StoredObject {
  provider: StorageProvider;
  bucket: string;
  key: string;
  region?: string;
  endpoint?: string;
  url?: string;
  size: number;
  contentType: string;
  checksum?: string;
  etag?: string;
  uploadedAt: string;
  originalName?: string;
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

export interface WorkspaceRecord {
  id: string;
  name: string;
  slug: string;
  defaultScanPaths: string[];
  skillRoot: string;
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
  owner?: string;
  packageName?: string;
  lifecycleState: SkillLifecycleState;
  tags: string[];
  agents: string[];
  contentHash: string;
  headings: string[];
  resources: {
    scripts: string[];
    references: string[];
    assets: string[];
  };
  source: SkillSource;
  discoveredAt: string;
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
  owner?: string;
  packageName?: string;
  lifecycleState: AssetLifecycleState;
  health: AssetHealth;
  tags: string[];
  contentHash?: string;
  source?: SkillSource;
  storage?: StoredObject;
  validation: {
    errors: number;
    warnings: number;
  };
  metadata: Record<string, string | number | boolean | string[] | undefined>;
  skill?: SkillRecord;
  discoveredAt: string;
  updatedAt: string;
}

export interface AssetCatalog {
  schemaVersion: 1;
  generatedAt: string;
  workspaceId?: string;
  assets: AssetRecord[];
  skills: SkillRecord[];
}

export interface ValidationIssue {
  severity: SkillValidationSeverity;
  code: string;
  message: string;
  path?: string;
  skillId?: string;
  assetId?: string;
}

export interface SkillPackageManifest {
  apiVersion?: string;
  kind?: string;
  metadata?: {
    name?: string;
    owner?: string;
    description?: string;
    tags?: string[];
  };
  spec?: {
    version?: string;
    maturity?: SkillLifecycleState;
    compatibility?: {
      agents?: string[];
    };
    artifacts?: Array<{
      type?: string;
      path?: string;
      tags?: string[];
      owner?: string;
    }>;
  };
}
