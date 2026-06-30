import { Eye, FileArchive } from "lucide-react";

import type { AssetRecord, ValidationIssue } from "../../../../shared/types";
import { metadataNumber } from "../../app/asset-utils";
import { formatBytes, formatDate, healthBadgeClass } from "../../app/format";
import { KeyValue } from "../../components/common/key-value";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";

export function SkillQuickPreview({
  asset,
  issues,
  onOpenDetail
}: {
  asset?: AssetRecord;
  issues: ValidationIssue[];
  onOpenDetail: (id: string) => void;
}) {
  if (!asset) {
    return (
      <aside className="flex min-h-72 min-w-0 items-center justify-center rounded-lg border border-dashed bg-card text-sm text-muted-foreground xl:h-full xl:min-h-0">
        Select a skill to preview.
      </aside>
    );
  }

  const assetIssues = issues.filter(
    (issue) => issue.assetId === asset.id || issue.skillId === asset.skill?.id
  );

  return (
    <aside className="min-h-72 min-w-0 overflow-auto rounded-lg border bg-card p-4 xl:h-full xl:min-h-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-600 text-white">
              <FileArchive className="h-4 w-4" aria-hidden="true" />
            </div>
            <h2 className="truncate text-lg font-semibold">{asset.displayName}</h2>
          </div>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {asset.description || "No description."}
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5">
        <Badge variant="secondary" className={healthBadgeClass(asset.health)}>
          {asset.health}
        </Badge>
        <Badge variant="outline">{asset.lifecycleState}</Badge>
        {asset.tags.slice(0, 6).map((tag) => (
          <Badge key={tag} variant="outline">
            {tag}
          </Badge>
        ))}
      </div>
      <div className="mt-5 grid gap-2 text-sm">
        <KeyValue label="Package" value={asset.packageName ?? "-"} />
        <KeyValue label="Owner" value={asset.owner ?? "-"} />
        <KeyValue label="Files" value={metadataNumber(asset, "zipEntries").toString()} />
        <KeyValue label="Scripts" value={metadataNumber(asset, "scripts").toString()} />
        <KeyValue label="References" value={metadataNumber(asset, "references").toString()} />
        <KeyValue label="Assets" value={metadataNumber(asset, "assets").toString()} />
        <KeyValue label="Archive" value={asset.storage?.originalName ?? "-"} />
        <KeyValue label="Size" value={asset.storage ? formatBytes(asset.storage.size) : "-"} />
        <KeyValue label="Uploaded" value={asset.storage ? formatDate(asset.storage.uploadedAt) : "-"} />
      </div>
      {assetIssues.length > 0 ? (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {assetIssues.length} validation issue(s)
        </div>
      ) : null}
      <Button className="mt-5 w-full" onClick={() => onOpenDetail(asset.id)}>
        <Eye className="h-4 w-4" aria-hidden="true" />
        Open details
      </Button>
    </aside>
  );
}
