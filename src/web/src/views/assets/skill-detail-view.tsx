import { ArrowLeft } from "lucide-react";

import type {
  AssetRecord,
  ValidationIssue,
  WorkspaceRecord
} from "../../../../shared/types";
import { Button } from "../../components/ui/button";
import { SkillFileExplorer } from "./skill-file-explorer";
import { SkillOverviewPanel } from "./skill-metadata-panel";

export function SkillDetailView({
  workspace,
  token,
  asset,
  issues,
  onBack,
  onChanged,
  onDeleted
}: {
  workspace: WorkspaceRecord;
  token: string;
  asset?: AssetRecord;
  issues: ValidationIssue[];
  onBack: () => void;
  onChanged: () => Promise<void>;
  onDeleted: () => void;
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
      <div className="shrink-0">
        <Button type="button" variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back
        </Button>
      </div>
      <div className="grid min-h-0 min-w-0 flex-1 gap-4 overflow-auto 2xl:grid-cols-[430px_minmax(0,1fr)] 2xl:overflow-hidden">
        <SkillOverviewPanel
          workspace={workspace}
          token={token}
          asset={asset}
          issues={issues}
          onChanged={onChanged}
          onDeleted={onDeleted}
          className="2xl:h-full"
        />
        <SkillFileExplorer workspace={workspace} token={token} asset={asset} />
      </div>
    </div>
  );
}
