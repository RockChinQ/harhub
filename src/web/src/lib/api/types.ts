import type {
  AccountProfile,
  AssetRecord,
  SkillRecord,
  StorageStatus,
  ValidationIssue,
  WorkspaceMember,
  WorkspaceMembership,
  WorkspaceRecord
} from "../../../../shared/types";

export interface SessionResponse {
  account: AccountProfile;
  workspaces: WorkspaceRecord[];
  memberships: WorkspaceMembership[];
}

export interface AuthResponse extends SessionResponse {
  token: string;
}

export interface SkillListResponse {
  workspace: WorkspaceRecord;
  catalogPath: string;
  generatedAt: string;
  storage?: StorageStatus;
  issues?: ValidationIssue[];
  assets?: AssetRecord[];
  skills: SkillRecord[];
}

export interface SkillScanResponse extends SkillListResponse {
  issues: ValidationIssue[];
}

export interface AssetListResponse {
  workspace: WorkspaceRecord;
  catalogPath: string;
  generatedAt: string;
  storage: StorageStatus;
  issues: ValidationIssue[];
  assets: AssetRecord[];
  skills: SkillRecord[];
}

export interface AssetScanResponse extends AssetListResponse {
  assetCatalogPath?: string;
  issues: ValidationIssue[];
  validated?: AssetRecord;
  validatedIssues?: ValidationIssue[];
}

export interface AssetBulkResponse extends AssetScanResponse {
  bulk: {
    action: "validate" | "delete";
    requested: number;
    succeeded: string[];
    failed: Array<{
      id: string;
      error: string;
    }>;
  };
}

export interface AssetUploadResponse extends AssetScanResponse {
  uploaded: AssetRecord;
}

export interface WorkspaceMutationResponse extends SessionResponse {
  workspace: WorkspaceRecord;
}

export interface WorkspaceMembersResponse {
  workspace: WorkspaceRecord;
  members: WorkspaceMember[];
}

export interface WorkspaceMemberMutationResponse extends WorkspaceMembersResponse {
  member: WorkspaceMember;
}
