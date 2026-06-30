import { Eye, FileArchive, Loader2, PackageOpen } from "lucide-react";

import type { AssetRecord } from "../../../../shared/types";
import { metadataNumber, metadataText } from "../../app/asset-utils";
import { formatBytes, formatDate, healthBadgeClass } from "../../app/format";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { cn } from "../../lib/utils";

export function SkillListTable({
  assets,
  selectedId,
  isLoading,
  onSelect,
  onOpenDetail
}: {
  assets: AssetRecord[];
  selectedId?: string;
  isLoading: boolean;
  onSelect: (id: string) => void;
  onOpenDetail: (id: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="flex min-h-60 min-w-0 items-center justify-center rounded-lg border bg-card text-sm text-muted-foreground xl:h-full xl:min-h-0">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
        Loading skills
      </div>
    );
  }

  if (assets.length === 0) {
    return (
      <div className="flex min-h-60 min-w-0 flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-card text-sm text-muted-foreground xl:h-full xl:min-h-0">
        <PackageOpen className="h-7 w-7" aria-hidden="true" />
        No uploaded skill zips matched the current filters.
      </div>
    );
  }

  return (
    <div className="min-h-[420px] w-full min-w-0 max-w-full overflow-hidden rounded-lg border bg-card xl:h-full xl:min-h-0">
      <div className="h-full w-full min-w-0 overflow-y-auto overflow-x-hidden overscroll-y-contain">
        <div className="sticky top-0 z-10 hidden min-w-0 grid-cols-[minmax(260px,1.5fr)_minmax(140px,.8fr)_minmax(140px,.7fr)_minmax(150px,.8fr)_108px] gap-3 border-b bg-muted/95 px-4 py-3 text-left text-xs uppercase text-muted-foreground backdrop-blur min-[1800px]:grid">
          <div className="font-medium">Skill</div>
          <div className="font-medium">Package / Owner</div>
          <div className="font-medium">Contents</div>
          <div className="font-medium">Archive</div>
          <div className="font-medium">Status</div>
        </div>
        <div className="min-w-0">
          {assets.map((asset) => {
            const zipEntries = metadataNumber(asset, "zipEntries");
            const scriptCount = metadataNumber(asset, "scripts");
            const referenceCount = metadataNumber(asset, "references");
            const assetCount = metadataNumber(asset, "assets");
            const uploadedAt = asset.storage?.uploadedAt ?? asset.updatedAt;
            const archiveName = asset.storage?.originalName ?? "-";
            const size = asset.storage ? formatBytes(asset.storage.size) : "-";

            return (
              <div
                key={asset.id}
                role="button"
                tabIndex={0}
                className={cn(
                  "grid min-w-0 cursor-pointer grid-cols-[minmax(0,1fr)_auto] gap-3 border-b px-4 py-4 text-sm transition-colors last:border-0 hover:bg-accent/45 min-[1800px]:grid-cols-[minmax(260px,1.5fr)_minmax(140px,.8fr)_minmax(140px,.7fr)_minmax(150px,.8fr)_108px]",
                  selectedId === asset.id && "bg-blue-50/80"
                )}
                onClick={() => onSelect(asset.id)}
                onDoubleClick={() => onOpenDetail(asset.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onOpenDetail(asset.id);
                }}
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-600 text-white">
                      <FileArchive className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{asset.displayName}</div>
                      <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                        {asset.description || asset.name}
                      </div>
                      <div className="mt-2 flex min-w-0 flex-wrap gap-1.5">
                        {asset.tags.slice(0, 4).map((tag) => (
                          <Badge key={tag} variant="outline" className="h-5 max-w-full rounded-md px-1.5 text-[11px]">
                            <span className="truncate">{tag}</span>
                          </Badge>
                        ))}
                        {asset.tags.length > 4 ? (
                          <Badge variant="outline" className="h-5 rounded-md px-1.5 text-[11px]">
                            +{asset.tags.length - 4}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="mt-3 grid min-w-0 gap-1 text-xs text-muted-foreground min-[1800px]:hidden">
                        <div className="truncate">
                          {asset.packageName ?? "-"} · {asset.owner ?? "Unassigned"}
                        </div>
                        <div className="truncate">
                          {zipEntries || "-"} file(s) · {scriptCount} scripts · {referenceCount} refs · {assetCount} assets
                        </div>
                        <div className="truncate">
                          {archiveName} · {size} · {formatDate(uploadedAt)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="hidden min-w-0 min-[1800px]:block">
                  <div className="truncate font-medium">{asset.packageName ?? "-"}</div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">
                    {asset.owner ?? "Unassigned"}
                  </div>
                </div>
                <div className="hidden min-w-0 min-[1800px]:block">
                  <div className="grid gap-1 text-xs text-muted-foreground">
                    <span>{zipEntries || "-"} file(s)</span>
                    <span className="truncate">{scriptCount} scripts · {referenceCount} refs · {assetCount} assets</span>
                    <span className="truncate">{metadataText(asset, "skillEntry") || "SKILL.md"}</span>
                  </div>
                </div>
                <div className="hidden min-w-0 min-[1800px]:block">
                  <div className="truncate font-medium">{archiveName}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{size}</div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">{formatDate(uploadedAt)}</div>
                </div>
                <div className="flex min-w-0 flex-col items-end gap-2 min-[1800px]:items-start">
                  <Badge variant="secondary" className={healthBadgeClass(asset.health)}>
                    {asset.health}
                  </Badge>
                  <Badge variant="outline" className="hidden rounded-md sm:inline-flex min-[1800px]:hidden">
                    {asset.lifecycleState}
                  </Badge>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenDetail(asset.id);
                    }}
                  >
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="hidden sm:inline">Open</span>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
