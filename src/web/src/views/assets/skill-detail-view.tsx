import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";

import type {
  AssetRecord,
  ValidationIssue,
  WorkspaceRecord
} from "../../../../shared/types";
import { Button } from "../../components/ui/button";
import { getWorkspaceAsset } from "../../lib/api";
import { SkillFileExplorer } from "./skill-file-explorer";
import { SkillOverviewPanel } from "./skill-metadata-panel";

export function SkillDetailView({
  workspace,
  token,
  asset,
  issues,
  canEdit,
  onBack,
  onChanged,
  onDeleted
}: {
  workspace: WorkspaceRecord;
  token: string;
  asset?: AssetRecord;
  issues: ValidationIssue[];
  canEdit: boolean;
  onBack: () => void;
  onChanged: () => Promise<void>;
  onDeleted: () => void;
}) {
  const [detailAsset, setDetailAsset] = useState(asset);

  useEffect(() => {
    setDetailAsset(asset);
    if (!asset) return;

    let active = true;
    getWorkspaceAsset(token, workspace.id, asset.id)
      .then((nextAsset) => {
        if (active) setDetailAsset(nextAsset);
      })
      .catch(() => {
        // Keep the list summary usable if the detail refresh fails transiently.
      });
    return () => {
      active = false;
    };
  }, [asset, token, workspace.id]);

  if (!asset) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden">
        <Button type="button" variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back
        </Button>
        <div className="flex min-h-0 flex-1 items-center justify-center rounded-lg border border-dashed bg-card text-sm text-muted-foreground">
          Select an asset from the list first.
        </div>
      </div>
    );
  }

  const selectedAsset = detailAsset ?? asset;

  async function refreshDetail(): Promise<void> {
    await onChanged();
    const nextAsset = await getWorkspaceAsset(token, workspace.id, selectedAsset.id);
    setDetailAsset(nextAsset);
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden">
      <div className="shrink-0">
        <Button type="button" variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back
        </Button>
      </div>
      <div className="grid min-h-0 min-w-0 flex-1 grid-rows-[220px_minmax(420px,1fr)] gap-4 overflow-auto pb-2">
        <SkillOverviewPanel
          workspace={workspace}
          token={token}
          asset={selectedAsset}
          issues={issues}
          onChanged={refreshDetail}
          onDeleted={onDeleted}
        />
        <SkillFileExplorer
          workspace={workspace}
          token={token}
          asset={selectedAsset}
          canEdit={canEdit}
          onChanged={async (nextAsset) => {
            setDetailAsset(nextAsset);
            await onChanged();
          }}
        />
      </div>
    </div>
  );
}
