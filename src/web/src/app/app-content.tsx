import type {
  AssetRecord,
  StorageStatus,
  ValidationIssue,
  WorkspaceRecord
} from "../../../shared/types";
import type { SessionResponse } from "../lib/api";
import { AccountView } from "../views/account-view";
import { AssetsView } from "../views/assets/assets-view";
import { SkillDetailView } from "../views/assets/skill-detail-view";
import { WorkspaceView } from "../views/workspace-view";
import { ForgeView } from "../views/forge-view";
import type { AppRoute, AppShellView } from "./types";

export function AppContent({
  error,
  view,
  activeWorkspace,
  token,
  assets,
  storage,
  issues,
  query,
  isLoading,
  selectedId,
  selectedAsset,
  session,
  onQueryChange,
  onSelectAsset,
  onOpenAssetDetail,
  onRefreshAssets,
  onNavigate,
  onSessionChange,
  onSessionSet,
  onPasswordChanged
}: {
  error?: string;
  view: AppShellView;
  activeWorkspace?: WorkspaceRecord;
  token: string;
  assets: AssetRecord[];
  storage?: StorageStatus;
  issues: ValidationIssue[];
  query: string;
  isLoading: boolean;
  selectedId?: string;
  selectedAsset?: AssetRecord;
  session: SessionResponse;
  onQueryChange: (value: string) => void;
  onSelectAsset: (id: string) => void;
  onOpenAssetDetail: (id: string) => void;
  onRefreshAssets: () => Promise<void>;
  onNavigate: (route: AppRoute) => void;
  onSessionChange: (session: SessionResponse, workspace?: WorkspaceRecord) => Promise<void>;
  onSessionSet: (session: SessionResponse) => void;
  onPasswordChanged: () => Promise<void>;
}) {
  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col items-center overflow-hidden p-4 sm:p-6 lg:p-8">
      <div className="flex min-h-0 w-full max-w-[1440px] flex-1 flex-col overflow-hidden">
        {error ? (
          <div className="mb-4 shrink-0 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        {view === "assets" && activeWorkspace ? (
          <AssetsView
            workspace={activeWorkspace}
            token={token}
            assets={assets}
            storage={storage}
            query={query}
            isLoading={isLoading}
            selectedId={selectedId}
            onQueryChange={onQueryChange}
            onSelect={onSelectAsset}
            onOpenDetail={onOpenAssetDetail}
            onRefresh={onRefreshAssets}
          />
        ) : null}
        {view === "asset-detail" && activeWorkspace ? (
          <SkillDetailView
            workspace={activeWorkspace}
            token={token}
            asset={selectedAsset}
            issues={issues}
            onBack={() => onNavigate({ view: "assets" })}
            onChanged={onRefreshAssets}
            onDeleted={() => onNavigate({ view: "assets" })}
          />
        ) : null}
        {view === "forge" && activeWorkspace ? (
          <ForgeView
            token={token}
            workspace={activeWorkspace}
            assets={assets}
            onOpenWorkspaceSettings={() => onNavigate({ view: "workspace" })}
          />
        ) : null}
        {view === "workspace" && activeWorkspace ? (
          <WorkspaceView
            token={token}
            workspace={activeWorkspace}
            onSessionChange={onSessionChange}
          />
        ) : null}
        {view === "account" ? (
          <AccountView
            token={token}
            account={session.account}
            memberships={session.memberships}
            onSessionChange={onSessionSet}
            onPasswordChanged={onPasswordChanged}
          />
        ) : null}
      </div>
    </main>
  );
}
