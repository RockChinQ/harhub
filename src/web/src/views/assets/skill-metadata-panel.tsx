import { Loader2, Save, ShieldCheck, Trash2 } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

import type {
  AssetRecord,
  ValidationIssue,
  WorkspaceRecord
} from "../../../../shared/types";
import { healthBadgeClass } from "../../app/format";
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
import {
  deleteWorkspaceAsset,
  updateWorkspaceAsset,
  validateWorkspaceAsset
} from "../../lib/api";
import { cn } from "../../lib/utils";
import { ValidationIssuesList } from "./validation-issues-list";

export function SkillMetadataPanel({
  workspace,
  token,
  asset,
  issues,
  onChanged,
  onDeleted,
  className
}: {
  workspace: WorkspaceRecord;
  token: string;
  asset?: AssetRecord;
  issues: ValidationIssue[];
  onChanged: () => Promise<void>;
  onDeleted?: () => void;
  className?: string;
}) {
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  useEffect(() => {
    setDescription(asset?.description ?? "");
    setMessage(undefined);
  }, [asset?.id]);

  if (!asset) {
    return (
      <div className={cn("flex min-h-48 items-center justify-center rounded-lg border border-dashed bg-card text-sm text-muted-foreground", className)}>
        Select a skill.
      </div>
    );
  }

  const selectedAsset = asset;
  const assetIssues = [
    ...(selectedAsset.validationIssues ?? []),
    ...issues.filter(
      (issue) => issue.assetId === selectedAsset.id
    )
  ].filter(
    (issue, index, allIssues) =>
      allIssues.findIndex(
        (item) =>
          item.code === issue.code &&
          item.message === issue.message &&
          item.path === issue.path
      ) === index
  );

  async function saveAsset(event: FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    setMessage(undefined);
    try {
      await updateWorkspaceAsset(token, workspace.id, selectedAsset.id, {
        description
      });
      setMessage("Saved.");
      await onChanged();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsSaving(false);
    }
  }

  async function removeAsset() {
    setIsDeleting(true);
    setMessage(undefined);
    try {
      await deleteWorkspaceAsset(token, workspace.id, selectedAsset.id);
      setMessage("Deleted.");
      setDeleteDialogOpen(false);
      await onChanged();
      onDeleted?.();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsDeleting(false);
    }
  }

  async function validateAsset() {
    setIsValidating(true);
    setMessage(undefined);
    try {
      const response = await validateWorkspaceAsset(token, workspace.id, selectedAsset.id);
      const issueCount =
        response.validatedIssues?.length ??
        ((response.validated?.validation.errors ?? 0) + (response.validated?.validation.warnings ?? 0));
      await onChanged();
      setMessage(issueCount > 0 ? `${issueCount} issue(s) found.` : "Valid.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsValidating(false);
    }
  }

  return (
    <form
      className={cn(
        "flex min-h-[520px] min-w-0 flex-col overflow-hidden rounded-lg border bg-card 2xl:min-h-0",
        className
      )}
      onSubmit={saveAsset}
    >
      <div className="flex shrink-0 flex-col gap-3 border-b bg-card p-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="truncate text-lg font-semibold">{selectedAsset.displayName}</h2>
          <Badge variant="secondary" className={healthBadgeClass(selectedAsset.health)}>
            {selectedAsset.health}
          </Badge>
        </div>
        <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">
          {selectedAsset.description || selectedAsset.name}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="grid gap-5">
          <div className="grid gap-3">
            <label className="grid gap-1.5 text-sm font-medium">
              Description
              <Input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={validateAsset} disabled={isValidating}>
              {isValidating ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              )}
              Validate
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="h-4 w-4" aria-hidden="true" />
              )}
              Save
            </Button>
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="outline" disabled={isDeleting}>
                  {isDeleting ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  )}
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete skill?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This removes {selectedAsset.displayName} from the workspace catalog.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90"
                    disabled={isDeleting}
                    onClick={(event) => {
                      event.preventDefault();
                      void removeAsset();
                    }}
                  >
                    {isDeleting ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    )}
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          <ValidationIssuesList issues={assetIssues} />
          {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
        </div>
      </div>
    </form>
  );
}
