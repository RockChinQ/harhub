import {
  FileArchive,
  Loader2,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  X
} from "lucide-react";
import { type DragEvent, useEffect, useMemo, useRef, useState } from "react";

import type {
  AssetRecord,
  StorageStatus,
  WorkspaceRecord
} from "../../../../shared/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "../../components/ui/alert-dialog";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { uploadStatusLabel } from "../../app/format";
import { bulkWorkspaceAssets } from "../../lib/api";
import { SkillListTable } from "./skill-list-table";
import { UploadSkillZipForm } from "./upload-skill-zip-form";

type BulkAction = "validate" | "delete";

type BulkMessage = {
  tone: "error" | "success" | "warning";
  text: string;
};

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
  const [isDragActive, setIsDragActive] = useState(false);
  const [droppedUploadFile, setDroppedUploadFile] = useState<File | undefined>();
  const [dropUploadError, setDropUploadError] = useState<string | undefined>();
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [bulkAction, setBulkAction] = useState<BulkAction | undefined>();
  const [bulkMessage, setBulkMessage] = useState<BulkMessage | undefined>();
  const dragDepth = useRef(0);
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
  const selectedBulkAssets = managedAssets.filter((asset) => selectedAssetIds.has(asset.id));
  const selectedBulkCount = selectedBulkAssets.length;

  useEffect(() => {
    const knownIds = new Set(managedAssets.map((asset) => asset.id));
    setSelectedAssetIds((current) => {
      const next = new Set(Array.from(current).filter((id) => knownIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [managedAssets]);

  function toggleAssetSelection(id: string, selected: boolean) {
    setBulkMessage(undefined);
    setSelectedAssetIds((current) => {
      const next = new Set(current);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleVisibleSelection(selected: boolean) {
    setBulkMessage(undefined);
    setSelectedAssetIds((current) => {
      const next = new Set(current);
      for (const asset of filteredAssets) {
        if (!asset.storage) continue;
        if (selected) next.add(asset.id);
        else next.delete(asset.id);
      }
      return next;
    });
  }

  function openUploadPopover(open: boolean) {
    setIsUploadOpen(open);
    if (!open) {
      setDroppedUploadFile(undefined);
      setDropUploadError(undefined);
    }
  }

  function handleDragEnter(event: DragEvent<HTMLDivElement>) {
    if (!dragHasFiles(event)) return;
    event.preventDefault();
    dragDepth.current += 1;
    setIsDragActive(true);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (!dragHasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDragActive(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    if (!dragHasFiles(event)) return;
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) {
      setIsDragActive(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    if (!dragHasFiles(event)) return;
    event.preventDefault();
    dragDepth.current = 0;
    setIsDragActive(false);

    const zipFile = firstZipFile(event.dataTransfer.files);
    setDroppedUploadFile(zipFile);
    setDropUploadError(zipFile ? undefined : "Drop a .zip skill package.");
    setIsUploadOpen(true);
  }

  async function runBulkAction(action: BulkAction) {
    if (selectedBulkCount === 0) return;

    setBulkAction(action);
    setBulkMessage(undefined);
    try {
      const result = await bulkWorkspaceAssets(token, workspace.id, {
        action,
        assetIds: selectedBulkAssets.map((asset) => asset.id)
      });
      const failedCount = result.bulk.failed.length;
      const succeededCount = result.bulk.succeeded.length;

      if (action === "delete") {
        const failedIds = new Set(result.bulk.failed.map((item) => item.id));
        setSelectedAssetIds(new Set(selectedBulkAssets.filter((asset) => failedIds.has(asset.id)).map((asset) => asset.id)));
        setIsBulkDeleteOpen(false);
      }

      setBulkMessage({
        tone: failedCount > 0 ? "warning" : "success",
        text: failedCount > 0
          ? `${bulkActionLabel(action)} finished: ${succeededCount} succeeded, ${failedCount} failed.`
          : `${bulkActionLabel(action)} finished for ${succeededCount} skill${succeededCount === 1 ? "" : "s"}.`
      });
      await onRefresh();
    } catch (error) {
      setBulkMessage({
        tone: "error",
        text: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setBulkAction(undefined);
    }
  }

  return (
    <div
      data-testid="skills-drop-zone"
      className="relative flex min-h-0 w-full min-w-0 max-w-full flex-1 flex-col gap-4 overflow-hidden"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragActive ? (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-xl border-2 border-dashed border-blue-400 bg-blue-500/10 p-6 backdrop-blur-[1px]">
          <div className="flex max-w-sm flex-col items-center gap-3 rounded-lg border bg-background px-5 py-4 text-center shadow-lg">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-600 text-white">
              <FileArchive className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <div className="text-sm font-medium">Drop skill package</div>
              <div className="mt-1 text-xs text-muted-foreground">Release the .zip file to preview upload.</div>
            </div>
          </div>
        </div>
      ) : null}
      <div className="flex shrink-0 min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-normal">Skills</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {managedAssets.length} uploaded
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <Popover open={isUploadOpen} onOpenChange={openUploadPopover}>
            <PopoverTrigger asChild>
              <Button>
                <Upload className="h-4 w-4" aria-hidden="true" />
                Upload
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={8}
              className="max-h-[min(640px,calc(100vh-1.5rem))] w-[min(420px,calc(100vw-2rem))] overflow-hidden p-0"
            >
              <div className="flex items-start gap-3 border-b bg-muted/30 px-4 py-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-background text-primary shadow-sm">
                  <FileArchive className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <div className="font-medium">Upload skill package</div>
                  <div className="mt-1 text-xs text-muted-foreground">{uploadStatusLabel(storage)}</div>
                </div>
              </div>
              <div className="max-h-[calc(100vh-8.5rem)] overflow-y-auto p-4">
                <UploadSkillZipForm
                  workspace={workspace}
                  token={token}
                  storage={storage}
                  initialFile={droppedUploadFile}
                  initialError={dropUploadError}
                  onUploaded={async () => {
                    setDroppedUploadFile(undefined);
                    setDropUploadError(undefined);
                    await onRefresh();
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
      {selectedBulkCount > 0 || bulkMessage ? (
        <div className="flex shrink-0 min-w-0 flex-col gap-3 rounded-lg border bg-card p-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            {selectedBulkCount > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="border-blue-200 bg-blue-50 text-blue-950">
                  {selectedBulkCount} selected
                </Badge>
                <span className="text-sm text-muted-foreground">
                  Bulk actions apply to uploaded skill packages only.
                </span>
              </div>
            ) : null}
            {bulkMessage ? (
              <p
                className={
                  bulkMessage.tone === "error"
                    ? "mt-1 text-sm text-destructive"
                    : bulkMessage.tone === "warning"
                      ? "mt-1 text-sm text-amber-700"
                      : "mt-1 text-sm text-blue-700"
                }
              >
                {bulkMessage.text}
              </p>
            ) : null}
          </div>
          {selectedBulkCount > 0 ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void runBulkAction("validate")}
                disabled={Boolean(bulkAction)}
              >
                {bulkAction === "validate" ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                )}
                Validate
              </Button>
              <AlertDialog open={isBulkDeleteOpen} onOpenChange={setIsBulkDeleteOpen}>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={Boolean(bulkAction)}
                  >
                    {bulkAction === "delete" ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    )}
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete selected skills?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This removes {selectedBulkCount} uploaded skill package{selectedBulkCount === 1 ? "" : "s"} from this workspace.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={bulkAction === "delete"}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      disabled={bulkAction === "delete"}
                      onClick={(event) => {
                        event.preventDefault();
                        void runBulkAction("delete");
                      }}
                    >
                      {bulkAction === "delete" ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : null}
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setSelectedAssetIds(new Set());
                  setBulkMessage(undefined);
                }}
                disabled={Boolean(bulkAction)}
              >
                <X className="h-4 w-4" aria-hidden="true" />
                Clear
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="min-h-0 min-w-0 flex-1 overflow-auto">
        <SkillListTable
          assets={filteredAssets}
          selectedId={selectedAsset?.id}
          selectedAssetIds={selectedAssetIds}
          isLoading={isLoading}
          onSelect={onSelect}
          onToggleSelection={toggleAssetSelection}
          onToggleAllVisible={toggleVisibleSelection}
          onOpenDetail={onOpenDetail}
        />
      </div>
    </div>
  );
}

function bulkActionLabel(action: BulkAction): string {
  return action === "delete" ? "Delete" : "Validate";
}

function dragHasFiles(event: DragEvent<HTMLDivElement>): boolean {
  return Array.from(event.dataTransfer.types).includes("Files");
}

function firstZipFile(files: FileList): File | undefined {
  return Array.from(files).find((file) => file.name.toLowerCase().endsWith(".zip"));
}
