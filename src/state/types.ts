import type {
  AccountProfile,
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

export interface AppState {
  schemaVersion: 1;
  accounts: AccountRecord[];
  workspaces: WorkspaceRecord[];
  memberships: WorkspaceMembership[];
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
