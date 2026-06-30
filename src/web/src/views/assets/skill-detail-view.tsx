import { ArrowLeft } from "lucide-react";

import type {
  AssetRecord,
  ValidationIssue,
  WorkspaceRecord
} from "../../../../shared/types";
import { healthBadgeClass } from "../../app/format";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { SkillFileExplorer } from "./skill-file-explorer";
import { SkillMetadataPanel } from "./skill-metadata-panel";

export function SkillDetailView({
  workspace,
  token,
  asset,
  issues,
  onBack,
  onChanged
}: {
  workspace: WorkspaceRecord;
  token: string;
  asset?: AssetRecord;
  issues: ValidationIssue[];
  onBack: () => void;
  onChanged: () => Promise<void>;
}) {
  if (!asset) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden">
        <Button type="button" variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back
        </Button>
        <div className="flex min-h-0 flex-1 items-center justify-center rounded-lg border border-dashed bg-card text-sm text-muted-foreground">
          Select a skill from the list first.
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden">
      <div className="flex shrink-0 min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <Button type="button" variant="outline" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back
          </Button>
          <div className="mt-4 flex min-w-0 flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-semibold tracking-normal">{asset.displayName}</h1>
            <Badge variant="secondary" className={healthBadgeClass(asset.health)}>
              {asset.health}
            </Badge>
            <Badge variant="outline">{asset.lifecycleState}</Badge>
          </div>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">
            {asset.description || "No description."}
          </p>
        </div>
      </div>
      <div className="grid min-h-0 min-w-0 flex-1 gap-4 overflow-auto 2xl:grid-cols-[430px_minmax(0,1fr)] 2xl:overflow-hidden">
        <SkillMetadataPanel
          workspace={workspace}
          token={token}
          asset={asset}
          issues={issues}
          onChanged={onChanged}
          className="2xl:h-full"
        />
        <SkillFileExplorer workspace={workspace} token={token} asset={asset} />
      </div>
    </div>
  );
}
