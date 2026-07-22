import {
  Check,
  Copy,
  Download,
  ExternalLink,
  History,
  Link2Off,
  Loader2,
  RotateCcw,
  Share2,
  ShieldCheck,
  Trash2
} from "lucide-react";
import { useEffect, useState } from "react";

import type {
  AssetRecord,
  AssetShareResponse,
  AssetVersionRecord,
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
  downloadWorkspaceAssetVersion,
  getWorkspaceAssetShare,
  rollbackWorkspaceAssetVersion,
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
  const [validationMessage, setValidationMessage] = useState<string | undefined>();
  const [deleteMessage, setDeleteMessage] = useState<string | undefined>();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [share, setShare] = useState<AssetShareResponse | undefined>();
  const [copied, setCopied] = useState<"url" | "cli" | "skills" | undefined>();
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareMessage, setShareMessage] = useState<string | undefined>();
  const [validationDialogOpen, setValidationDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [versionAction, setVersionAction] = useState<string | undefined>();
  const [versionMessage, setVersionMessage] = useState<string | undefined>();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  useEffect(() => {
    setValidationMessage(undefined);
    setDeleteMessage(undefined);
    setShare(undefined);
    setCopied(undefined);
    setShareDialogOpen(false);
    setShareMessage(undefined);
    setValidationDialogOpen(false);
    setHistoryDialogOpen(false);
    setVersionAction(undefined);
    setVersionMessage(undefined);
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
  const issueErrorCount = assetIssues.filter((issue) => issue.severity === "error").length;
  const issueWarningCount = assetIssues.filter((issue) => issue.severity === "warning").length;
  const validationErrors = Math.max(selectedAsset.validation.errors, issueErrorCount);
  const validationWarnings = Math.max(selectedAsset.validation.warnings, issueWarningCount);
  const validationSummary = `${validationErrors} errors · ${validationWarnings} warnings`;
  const versionHistory = [...(selectedAsset.versionHistory ?? [])].sort(
    (left, right) => right.version - left.version
  );
  const currentVersion = selectedAsset.version ?? versionHistory[0]?.version ?? 1;

  async function removeAsset() {
    setIsDeleting(true);
    setDeleteMessage(undefined);
    try {
      await deleteWorkspaceAsset(token, workspace.id, selectedAsset.id);
      setDeleteDialogOpen(false);
      await onChanged();
      onDeleted?.();
    } catch (caught) {
      setDeleteMessage(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsDeleting(false);
    }
  }

  async function validateAsset() {
    setIsValidating(true);
    setValidationMessage(undefined);
    try {
      const response = await validateWorkspaceAsset(token, workspace.id, selectedAsset.id);
      const issueCount =
        response.validatedIssues?.length ??
        ((response.validated?.validation.errors ?? 0) + (response.validated?.validation.warnings ?? 0));
      await onChanged();
      setValidationMessage(issueCount > 0 ? `${issueCount} issue(s) found.` : "Validation passed.");
    } catch (caught) {
      setValidationMessage(caught instanceof Error ? caught.message : String(caught));
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

  async function downloadVersion(entry: AssetVersionRecord) {
    const action = `download:${entry.version}`;
    setVersionAction(action);
    setVersionMessage(undefined);
    try {
      const download = await downloadWorkspaceAssetVersion(
        token,
        workspace.id,
        selectedAsset.id,
        entry.version
      );
      const url = URL.createObjectURL(download.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = download.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setVersionMessage(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setVersionAction(undefined);
    }
  }

  async function rollbackVersion(entry: AssetVersionRecord) {
    const action = `rollback:${entry.version}`;
    setVersionAction(action);
    setVersionMessage(undefined);
    try {
      await rollbackWorkspaceAssetVersion(
        token,
        workspace.id,
        selectedAsset.id,
        entry.version
      );
      setVersionMessage(`Restored v${entry.version} as a new current version.`);
      await onChanged();
    } catch (caught) {
      setVersionMessage(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setVersionAction(undefined);
    }
  }

  return (
    <div
      className={cn(
        "grid h-full min-w-0 grid-cols-[minmax(0,1fr)_13rem] overflow-hidden rounded-lg border bg-card",
        className
      )}
    >
      <div className="min-w-0 overflow-auto p-5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="truncate text-lg font-semibold">{selectedAsset.displayName}</h2>
          <Badge variant="secondary" className={healthBadgeClass(selectedAsset.health)}>
            {selectedAsset.health}
          </Badge>
          <Badge variant="outline">v{currentVersion}</Badge>
        </div>
        <p className="mt-3 line-clamp-4 text-sm leading-6 text-muted-foreground">
          {selectedAsset.description || selectedAsset.name}
        </p>
        <p className="mt-4 truncate font-mono text-xs text-muted-foreground">
          {selectedAsset.name}
        </p>
        {selectedAsset.updatedAt ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Updated {formatVersionDate(selectedAsset.updatedAt)}
          </p>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-col justify-center gap-1.5 border-l bg-muted/10 p-3">
            <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 w-full justify-start px-3 text-left"
                >
                  <History className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">Version history</span>
                    <span className="block truncate text-[11px] font-normal text-muted-foreground">
                      v{currentVersion} · {versionHistory.length || 1} retained version(s)
                    </span>
                  </span>
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Version history</DialogTitle>
                  <DialogDescription>
                    The current package and four previous versions are retained. A rollback creates
                    a new version instead of rewriting history.
                  </DialogDescription>
                </DialogHeader>
                <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
                  {versionHistory.length > 0 ? versionHistory.map((entry) => (
                    <SkillVersionEntry
                      key={entry.version}
                      entry={entry}
                      current={entry.version === currentVersion}
                      busyAction={versionAction}
                      onDownload={() => void downloadVersion(entry)}
                      onRollback={() => void rollbackVersion(entry)}
                    />
                  )) : (
                    <div className="rounded-md border p-4 text-sm text-muted-foreground">
                      This Skill is currently at v{currentVersion}. Its detailed history will be
                      recorded the next time the package changes.
                    </div>
                  )}
                </div>
                {versionMessage ? (
                  <p className="text-sm text-muted-foreground">{versionMessage}</p>
                ) : null}
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="outline">Close</Button>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Dialog open={validationDialogOpen} onOpenChange={setValidationDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 w-full justify-start px-3 text-left"
                >
                  {isValidating ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
                  ) : (
                    <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
                  )}
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">Validation</span>
                    <span className="block truncate text-[11px] font-normal text-muted-foreground">
                      {validationSummary}
                    </span>
                  </span>
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
                <DialogHeader>
                  <DialogTitle>Validation details</DialogTitle>
                  <DialogDescription>{validationSummary}</DialogDescription>
                </DialogHeader>
                <div className="max-h-[50vh] overflow-auto pr-1">
                  {assetIssues.length > 0 ? (
                    <ValidationIssuesList issues={assetIssues} />
                  ) : (
                    <div className="rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">
                      No validation errors or warnings were found.
                    </div>
                  )}
                </div>
                {validationMessage ? (
                  <p className="text-sm text-muted-foreground">{validationMessage}</p>
                ) : null}
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="outline" disabled={isValidating}>Close</Button>
                  </DialogClose>
                  <Button
                    type="button"
                    disabled={isValidating}
                    onClick={() => void validateAsset()}
                  >
                    {isValidating ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                    )}
                    Run validation
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  type="button"
                  variant={share ? "secondary" : "outline"}
                  disabled={isSharing && !share}
                  className="h-10 w-full justify-start px-3 text-left"
                >
                  {isSharing && !share ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : share ? (
                    <Check className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Share2 className="h-4 w-4" aria-hidden="true" />
                  )}
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">
                      {isSharing && !share ? "Checking…" : share ? "Shared" : "Share"}
                    </span>
                    <span className="block truncate text-[11px] font-normal text-muted-foreground">
                      {share ? "Public link active" : "Manage public access"}
                    </span>
                  </span>
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
                <Button
                  type="button"
                  variant="outline"
                  disabled={isDeleting}
                  className="h-10 w-full justify-start px-3"
                >
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
                {deleteMessage ? (
                  <p className="text-sm text-destructive">{deleteMessage}</p>
                ) : null}
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
    </div>
  );
}

function SkillVersionEntry({
  entry,
  current,
  busyAction,
  onDownload,
  onRollback
}: {
  entry: AssetVersionRecord;
  current: boolean;
  busyAction?: string;
  onDownload: () => void;
  onRollback: () => void;
}) {
  const available = Boolean(entry.storage);
  const downloading = busyAction === `download:${entry.version}`;
  const rollingBack = busyAction === `rollback:${entry.version}`;
  return (
    <div className="rounded-md border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Badge variant="outline">v{entry.version}</Badge>
            {current ? <Badge variant="secondary">Current</Badge> : null}
            <span className="text-sm font-medium">{entry.summary}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {versionSourceLabel(entry.source)} · {formatVersionDate(entry.createdAt)}
          </p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          {entry.fileCount !== undefined ? <div>{entry.fileCount} files</div> : null}
          {entry.size !== undefined ? <div>{formatVersionBytes(entry.size)}</div> : null}
        </div>
      </div>
      {entry.changes.length > 0 ? (
        <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
          {entry.changes.map((change) => (
            <li key={change}>• {change}</li>
          ))}
        </ul>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {available ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={Boolean(busyAction)}
              onClick={onDownload}
            >
              {downloading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              Download
            </Button>
            {!current ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={Boolean(busyAction)}
                  >
                    {rollingBack ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    Restore
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Restore Skill v{entry.version}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      The retained package will become a new current version. Existing history is
                      preserved until it exceeds the five-version retention limit.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={onRollback}>
                      Restore as new version
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
          </>
        ) : (
          <span className="text-xs text-muted-foreground">
            Package unavailable; this record predates retained version storage.
          </span>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
        <span>{entry.validation.errors} errors</span>
        <span>{entry.validation.warnings} warnings</span>
        {entry.checksum ? (
          <span className="font-mono">sha256 {entry.checksum.slice(0, 10)}…</span>
        ) : null}
      </div>
    </div>
  );
}

function versionSourceLabel(source: AssetVersionRecord["source"]): string {
  if (source === "project-sync") return "Project sync";
  if (source === "migration") return "Existing Skill";
  if (source === "rollback") return "Version restore";
  if (source === "scan") return "Local scan";
  return "Package upload";
}

function formatVersionDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown time" : date.toLocaleString();
}

function formatVersionBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
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
