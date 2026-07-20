import {
  Check,
  Copy,
  ExternalLink,
  Link2Off,
  Loader2,
  Share2,
  ShieldCheck,
  Trash2
} from "lucide-react";
import { useEffect, useState } from "react";

import type {
  AssetRecord,
  AssetShareResponse,
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
  createWorkspaceAssetShare,
  deleteWorkspaceAsset,
  getWorkspaceAssetShare,
  revokeWorkspaceAssetShare,
  validateWorkspaceAsset
} from "../../lib/api";
import { cn } from "../../lib/utils";
import { ValidationIssuesList } from "./validation-issues-list";

export function SkillOverviewPanel({
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
  const [message, setMessage] = useState<string | undefined>();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [share, setShare] = useState<AssetShareResponse | undefined>();
  const [copied, setCopied] = useState<"url" | "cli" | "skills" | undefined>();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  useEffect(() => {
    setMessage(undefined);
    setShare(undefined);
    setCopied(undefined);
    if (!asset) return;

    let active = true;
    setIsSharing(true);
    getWorkspaceAssetShare(token, workspace.id, asset.id)
      .then((nextShare) => {
        if (active) setShare(nextShare);
      })
      .catch((caught) => {
        if (active) setMessage(caught instanceof Error ? caught.message : String(caught));
      })
      .finally(() => {
        if (active) setIsSharing(false);
      });
    return () => {
      active = false;
    };
  }, [asset?.id, token, workspace.id]);

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

  async function publishShare() {
    setIsSharing(true);
    setMessage(undefined);
    try {
      const nextShare = await createWorkspaceAssetShare(token, workspace.id, selectedAsset.id);
      setShare(nextShare);
      setMessage("Public share link created.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsSharing(false);
    }
  }

  async function stopSharing() {
    setIsSharing(true);
    setMessage(undefined);
    try {
      await revokeWorkspaceAssetShare(token, workspace.id, selectedAsset.id);
      setShare(undefined);
      setMessage("Public share link revoked.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsSharing(false);
    }
  }

  async function copyShareValue(kind: "url" | "cli" | "skills", value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied(undefined), 1800);
    } catch {
      setMessage("Could not copy to the clipboard.");
    }
  }

  return (
    <div
      className={cn(
        "flex min-w-0 shrink-0 flex-col rounded-lg border bg-card",
        className
      )}
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

      <div className="p-4">
        <div className="grid gap-5">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={validateAsset} disabled={isValidating}>
              {isValidating ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              )}
              Validate
            </Button>
            {!share ? (
              <Button type="button" variant="outline" onClick={publishShare} disabled={isSharing}>
                {isSharing ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Share2 className="h-4 w-4" aria-hidden="true" />
                )}
                Share
              </Button>
            ) : null}
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

          {share ? (
            <div className="grid gap-3 rounded-lg border bg-muted/20 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium">Public share</div>
                  <div className="text-xs text-muted-foreground">Anyone with this link can download the zip.</div>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={stopSharing} disabled={isSharing}>
                  {isSharing ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Link2Off aria-hidden="true" />}
                  Revoke
                </Button>
              </div>
              <div className="flex gap-2">
                <Input readOnly value={share.shareUrl} className="min-w-0 text-xs" />
                <Button type="button" variant="outline" size="icon" onClick={() => copyShareValue("url", share.shareUrl)} aria-label="Copy public share URL">
                  {copied === "url" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                </Button>
                <Button asChild variant="outline" size="icon">
                  <a href={share.shareUrl} target="_blank" rel="noreferrer" aria-label="Open public share page">
                    <ExternalLink aria-hidden="true" />
                  </a>
                </Button>
              </div>
              <div className="flex gap-2">
                <Input readOnly value={share.cliCommand} className="min-w-0 font-mono text-xs" />
                <Button type="button" variant="outline" size="icon" onClick={() => copyShareValue("cli", share.cliCommand)} aria-label="Copy CLI install command">
                  {copied === "cli" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                </Button>
              </div>
              <div className="flex gap-2">
                <Input readOnly value={share.skillsCliCommand} className="min-w-0 font-mono text-xs" />
                <Button type="button" variant="outline" size="icon" onClick={() => copyShareValue("skills", share.skillsCliCommand)} aria-label="Copy Agent Skills CLI install command">
                  {copied === "skills" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                </Button>
              </div>
            </div>
          ) : null}

          <ValidationIssuesList issues={assetIssues} />
          {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
        </div>
      </div>
    </div>
  );
}
