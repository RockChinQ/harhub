import { Search, Upload } from "lucide-react";
import { useMemo, useState } from "react";

import type {
  AssetRecord,
  StorageStatus,
  WorkspaceRecord
} from "../../../../shared/types";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { uploadStatusLabel } from "../../app/format";
import { SkillListTable } from "./skill-list-table";
import { UploadSkillZipForm } from "./upload-skill-zip-form";

export function AssetsView({
  workspace,
  token,
  assets,
  storage,
  query,
  isLoading,
  selectedId,
  onQueryChange,
  onSelect,
  onOpenDetail,
  onRefresh
}: {
  workspace: WorkspaceRecord;
  token: string;
  assets: AssetRecord[];
  storage?: StorageStatus;
  query: string;
  isLoading: boolean;
  selectedId?: string;
  onQueryChange: (value: string) => void;
  onSelect: (id: string) => void;
  onOpenDetail: (id: string) => void;
  onRefresh: () => Promise<void>;
}) {
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const managedAssets = useMemo(
    () => assets.filter((asset) => asset.storage),
    [assets]
  );
  const filteredAssets = managedAssets.filter((asset) => {
    const normalizedQuery = query.trim().toLowerCase();
    const matchesQuery =
      !normalizedQuery ||
      asset.name.toLowerCase().includes(normalizedQuery) ||
      asset.displayName.toLowerCase().includes(normalizedQuery) ||
      asset.description.toLowerCase().includes(normalizedQuery);
    return matchesQuery;
  });
  const selectedAsset =
    filteredAssets.find((asset) => asset.id === selectedId) ?? filteredAssets[0];

  return (
    <div className="flex min-h-0 w-full min-w-0 max-w-full flex-1 flex-col gap-4 overflow-hidden">
      <div className="flex shrink-0 min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-normal">Skills</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {managedAssets.length} uploaded
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <Popover open={isUploadOpen} onOpenChange={setIsUploadOpen}>
            <PopoverTrigger asChild>
              <Button>
                <Upload className="h-4 w-4" aria-hidden="true" />
                Upload
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-[min(440px,calc(100vw-2rem))] p-0"
            >
              <div className="border-b px-4 py-3">
                <div className="font-medium">Upload skill zip</div>
                <div className="mt-1 text-xs text-muted-foreground">{uploadStatusLabel(storage)}</div>
              </div>
              <div className="p-4">
                <UploadSkillZipForm
                  workspace={workspace}
                  token={token}
                  storage={storage}
                  onUploaded={async () => {
                    await onRefresh();
                    setIsUploadOpen(false);
                  }}
                />
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
      <div className="flex shrink-0 min-w-0 items-center gap-2 rounded-lg border bg-card p-3">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search skills"
            aria-label="Search skills"
            className="pl-9"
          />
        </div>
        {query ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => onQueryChange("")}
          >
            Clear
          </Button>
        ) : null}
      </div>
      <div className="min-h-0 min-w-0 flex-1 overflow-auto">
        <SkillListTable
          assets={filteredAssets}
          selectedId={selectedAsset?.id}
          isLoading={isLoading}
          onSelect={onSelect}
          onOpenDetail={onOpenDetail}
        />
      </div>
    </div>
  );
}
