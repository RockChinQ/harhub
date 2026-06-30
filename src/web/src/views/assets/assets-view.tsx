import { Clock3, HardDriveUpload, Search, Tag, Upload } from "lucide-react";
import { useMemo, useState } from "react";

import type {
  AssetRecord,
  StorageStatus,
  ValidationIssue,
  WorkspaceRecord
} from "../../../../shared/types";
import { metadataList } from "../../app/asset-utils";
import { formatDate, uploadStatusLabel } from "../../app/format";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "../../components/ui/select";
import { SkillListTable } from "./skill-list-table";
import { SkillQuickPreview } from "./skill-quick-preview";
import { SkillSummaryPill } from "./skill-summary-pill";
import { UploadSkillZipForm } from "./upload-skill-zip-form";

export function AssetsView({
  workspace,
  token,
  assets,
  storage,
  issues,
  query,
  tagFilter,
  isLoading,
  selectedId,
  onQueryChange,
  onTagFilterChange,
  onSelect,
  onOpenDetail,
  onRefresh
}: {
  workspace: WorkspaceRecord;
  token: string;
  assets: AssetRecord[];
  storage?: StorageStatus;
  issues: ValidationIssue[];
  query: string;
  tagFilter: string;
  isLoading: boolean;
  selectedId?: string;
  onQueryChange: (value: string) => void;
  onTagFilterChange: (value: string) => void;
  onSelect: (id: string) => void;
  onOpenDetail: (id: string) => void;
  onRefresh: () => Promise<void>;
}) {
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const managedAssets = useMemo(
    () => assets.filter((asset) => asset.storage),
    [assets]
  );
  const tags = useMemo(
    () => Array.from(new Set(managedAssets.flatMap((asset) => asset.tags))).sort(),
    [managedAssets]
  );
  const skillAssets = managedAssets.filter((asset) => asset.kind === "skill");
  const filteredAssets = managedAssets.filter((asset) => {
    const normalizedQuery = query.trim().toLowerCase();
    const searchableMetadata = [
      asset.storage?.originalName,
      asset.storage?.key,
      ...metadataList(asset, "agents"),
      ...metadataList(asset, "headings"),
      ...asset.tags
    ].join(" ");
    const matchesQuery =
      !normalizedQuery ||
      asset.name.toLowerCase().includes(normalizedQuery) ||
      asset.displayName.toLowerCase().includes(normalizedQuery) ||
      asset.description.toLowerCase().includes(normalizedQuery) ||
      asset.kind.toLowerCase().includes(normalizedQuery) ||
      asset.packageName?.toLowerCase().includes(normalizedQuery) ||
      asset.owner?.toLowerCase().includes(normalizedQuery) ||
      searchableMetadata.toLowerCase().includes(normalizedQuery);
    const matchesTag = !tagFilter || asset.tags.includes(tagFilter);
    return matchesQuery && matchesTag;
  });
  const selectedAsset =
    filteredAssets.find((asset) => asset.id === selectedId) ?? filteredAssets[0];
  const errorCount =
    managedAssets.reduce((count, asset) => count + asset.validation.errors, 0) ||
    issues.filter((issue) => issue.severity === "error").length;
  const warningCount =
    managedAssets.reduce((count, asset) => count + asset.validation.warnings, 0) ||
    issues.filter((issue) => issue.severity === "warning").length;
  const uploadDates = managedAssets
    .map((asset) => asset.storage?.uploadedAt ?? asset.updatedAt)
    .sort();
  const latestUpload = uploadDates[uploadDates.length - 1];

  return (
    <div className="flex min-h-0 w-full min-w-0 max-w-full flex-1 flex-col gap-4 overflow-hidden">
      <div className="flex shrink-0 min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-normal">Skills</h1>
            <Badge variant="secondary" className="bg-blue-600 text-white hover:bg-blue-600">
              {skillAssets.length} managed
            </Badge>
            {errorCount + warningCount > 0 ? (
              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
                {errorCount + warningCount} issue(s)
              </Badge>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <SkillSummaryPill
              icon={HardDriveUpload}
              label="Uploaded"
              value={`${managedAssets.length} package(s)`}
            />
            <SkillSummaryPill icon={Tag} label="Tags" value={tags.length.toString()} />
            <SkillSummaryPill
              icon={Clock3}
              label="Latest upload"
              value={latestUpload ? formatDate(latestUpload) : "-"}
            />
          </div>
        </div>
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
      <div className="flex shrink-0 min-w-0 flex-col gap-3 rounded-lg border bg-card p-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search skills, packages, owners, tags"
            aria-label="Search skills"
            className="pl-9"
          />
        </div>
        <Select
          value={tagFilter || "all"}
          onValueChange={(value) => onTagFilterChange(value === "all" ? "" : value)}
        >
          <SelectTrigger className="sm:w-48" aria-label="Filter by tag">
            <SelectValue placeholder="All tags" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tags</SelectItem>
            {tags.map((tag) => (
              <SelectItem key={tag} value={tag}>
                {tag}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(query || tagFilter) ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onQueryChange("");
              onTagFilterChange("");
            }}
          >
            Clear
          </Button>
        ) : null}
      </div>
      <div className="grid min-h-0 min-w-0 flex-1 gap-4 overflow-auto xl:grid-cols-[minmax(0,1fr)_420px] xl:overflow-hidden">
        <SkillListTable
          assets={filteredAssets}
          selectedId={selectedAsset?.id}
          isLoading={isLoading}
          onSelect={onSelect}
          onOpenDetail={onOpenDetail}
        />
        <SkillQuickPreview
          asset={selectedAsset}
          issues={issues}
          onOpenDetail={onOpenDetail}
        />
      </div>
    </div>
  );
}
