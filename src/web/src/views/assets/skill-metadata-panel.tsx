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
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "../../components/ui/dialog";
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
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareMessage, setShareMessage] = useState<string | undefined>();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  useEffect(() => {
    setMessage(undefined);
    setShare(undefined);
    setCopied(undefined);
    setShareDialogOpen(false);
    setShareMessage(undefined);
    if (!asset) return;

    let active = true;
    setIsSharing(true);
    getWorkspaceAssetShare(token, workspace.id, asset.id)
      .then((nextShare) => {
        if (active) setShare(nextShare);
      })
      .catch((caught) => {
        if (active) setShareMessage(caught instanceof Error ? caught.message : String(caught));
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
    setShareMessage(undefined);
    try {
      const nextShare = await createWorkspaceAssetShare(token, workspace.id, selectedAsset.id);
      setShare(nextShare);
      setShareMessage("Public sharing is active.");
    } catch (caught) {
      setShareMessage(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsSharing(false);
    }
  }

  async function stopSharing() {
    setIsSharing(true);
    setShareMessage(undefined);
    try {
      await revokeWorkspaceAssetShare(token, workspace.id, selectedAsset.id);
      setShare(undefined);
      setShareMessage("Public sharing has been revoked.");
    } catch (caught) {
      setShareMessage(caught instanceof Error ? caught.message : String(caught));
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
      setShareMessage("Could not copy to the clipboard.");
    }
  }

  return (
    <div
      className={cn(
        "flex h-full min-w-0 flex-col overflow-hidden rounded-lg border bg-card",
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

      <div className="min-h-0 flex-1 overflow-auto p-4">
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
            <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  type="button"
                  variant={share ? "secondary" : "outline"}
                  disabled={isSharing && !share}
                >
                  {isSharing && !share ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : share ? (
                    <Check className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Share2 className="h-4 w-4" aria-hidden="true" />
                  )}
                  {isSharing && !share ? "Checking…" : share ? "Shared" : "Share"}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>{share ? "Manage public sharing" : "Share this Skill"}</DialogTitle>
                  <DialogDescription>
                    {share
                      ? "Anyone with this link can view and download the current Skill package."
                      : "Create a public link and install commands for this Skill package."}
                  </DialogDescription>
                </DialogHeader>

                {share ? (
                  <div className="grid gap-4">
                    <ShareValue
                      label="Public link"
                      value={share.shareUrl}
                      copied={copied === "url"}
                      onCopy={() => void copyShareValue("url", share.shareUrl)}
                      openUrl={share.shareUrl}
                    />
                    <ShareValue
                      label="Harhub CLI"
                      value={share.cliCommand}
                      copied={copied === "cli"}
                      onCopy={() => void copyShareValue("cli", share.cliCommand)}
                    />
                    <ShareValue
                      label="Agent Skills CLI"
                      value={share.skillsCliCommand}
                      copied={copied === "skills"}
                      onCopy={() => void copyShareValue("skills", share.skillsCliCommand)}
                    />
                    {shareMessage ? (
                      <p className="text-sm text-muted-foreground">{shareMessage}</p>
                    ) : null}
                    <DialogFooter className="gap-2 sm:justify-between sm:space-x-0">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={isSharing}
                        onClick={() => void stopSharing()}
                      >
                        {isSharing ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <Link2Off className="h-4 w-4" aria-hidden="true" />
                        )}
                        Revoke sharing
                      </Button>
                      <DialogClose asChild>
                        <Button type="button" variant="outline">Done</Button>
                      </DialogClose>
                    </DialogFooter>
                  </div>
                ) : (
                  <div className="grid gap-4">
                    <div className="rounded-lg border bg-muted/20 p-4 text-sm leading-6 text-muted-foreground">
                      The generated link is public and does not require a Harhub account. You can
                      revoke it here at any time.
                    </div>
                    {shareMessage ? (
                      <p className="text-sm text-muted-foreground">{shareMessage}</p>
                    ) : null}
                    <DialogFooter>
                      <DialogClose asChild>
                        <Button type="button" variant="outline" disabled={isSharing}>Cancel</Button>
                      </DialogClose>
                      <Button
                        type="button"
                        disabled={isSharing}
                        onClick={() => void publishShare()}
                      >
                        {isSharing ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <Share2 className="h-4 w-4" aria-hidden="true" />
                        )}
                        Create public share
                      </Button>
                    </DialogFooter>
                  </div>
                )}
              </DialogContent>
            </Dialog>
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
    </div>
  );
}

function ShareValue({
  label,
  value,
  copied,
  onCopy,
  openUrl
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
  openUrl?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="flex min-w-0 gap-2">
        <Input readOnly value={value} className="min-w-0 font-mono text-xs" />
        <Button type="button" variant="outline" size="icon" onClick={onCopy} aria-label={`Copy ${label}`}>
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        </Button>
        {openUrl ? (
          <Button asChild variant="outline" size="icon">
            <a href={openUrl} target="_blank" rel="noreferrer" aria-label="Open public share page">
              <ExternalLink aria-hidden="true" />
            </a>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
