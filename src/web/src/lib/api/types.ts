import type {
  AccountProfile,
  AuthProvider,
  AssetRecord,
  SkillRecord,
  StorageStatus,
  ValidationIssue,
  WorkspaceInvitation,
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

export interface AuthConfigResponse {
  password: boolean;
  emailCode: boolean;
  oauth: Record<AuthProvider, boolean>;
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
  invitations: WorkspaceInvitation[];
}

export interface WorkspaceMemberMutationResponse extends WorkspaceMembersResponse {
  member?: WorkspaceMember;
  invitation?: WorkspaceInvitation;
  invitationUrl?: string;
  email?: {
    sent: boolean;
    error?: string;
  };
}
