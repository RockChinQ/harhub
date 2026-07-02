import { Eye, FileArchive, Loader2, PackageOpen } from "lucide-react";

import type { AssetRecord } from "../../../../shared/types";
import { healthBadgeClass } from "../../app/format";
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
        <div className="sticky top-0 z-10 hidden min-w-0 grid-cols-[minmax(260px,1fr)_120px] gap-3 border-b bg-muted/95 px-4 py-3 text-left text-xs uppercase text-muted-foreground backdrop-blur md:grid">
          <div className="font-medium">Skill</div>
          <div className="font-medium">Status</div>
        </div>
        <div className="min-w-0">
          {assets.map((asset) => {
            return (
              <div
                key={asset.id}
                role="button"
                tabIndex={0}
                className={cn(
                  "grid min-w-0 cursor-pointer grid-cols-[minmax(0,1fr)_auto] gap-3 border-b px-4 py-4 text-sm transition-colors last:border-0 hover:bg-accent/45 md:grid-cols-[minmax(260px,1fr)_120px]",
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
                    </div>
                  </div>
                </div>
                <div className="flex min-w-0 flex-col items-end gap-2 md:items-start">
                  <Badge variant="secondary" className={healthBadgeClass(asset.health)}>
                    {asset.health}
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
