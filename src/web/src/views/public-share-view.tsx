import {
  AlertCircle,
  CalendarDays,
  Check,
  Copy,
  Download,
  FileCode2,
  Files,
  HardDrive,
  Loader2,
  PackageOpen,
  ShieldCheck,
  type LucideIcon
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

import type {
  AssetContentPreview,
  AssetShareResponse
} from "../../../shared/types";
import { useDocumentTitle } from "../app/document-title";
import { healthBadgeClass } from "../app/format";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "../components/ui/card";
import { Input } from "../components/ui/input";
import {
  getPublicAssetShare,
  getPublicAssetSharePreview
} from "../lib/api";
import { FilePreviewPane } from "./assets/file-preview-pane";
import { FileTree } from "./assets/file-tree";

export function PublicShareView({ shareToken }: { shareToken: string }) {
  const [share, setShare] = useState<AssetShareResponse>();
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState<"harhub" | "skills">();
  const [selectedPath, setSelectedPath] = useState<string>();
  const [preview, setPreview] = useState<AssetContentPreview>();
  const [previewError, setPreviewError] = useState<string>();
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  useDocumentTitle(
    share?.token === shareToken && share.asset.displayName
      ? `${share.asset.displayName} · Shared Skill`
      : error
        ? "Share unavailable"
        : "Shared Skill"
  );

  useEffect(() => {
    let active = true;
    setShare(undefined);
    setError(undefined);
    setSelectedPath(undefined);
    setPreview(undefined);
    getPublicAssetShare(shareToken)
      .then((nextShare) => {
        if (active) setShare(nextShare);
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : String(caught));
      });
    return () => {
      active = false;
    };
  }, [shareToken]);

  useEffect(() => {
    if (!share) return;
    let active = true;
    setIsPreviewLoading(true);
    setPreviewError(undefined);
    getPublicAssetSharePreview(shareToken, selectedPath)
      .then((nextPreview) => {
        if (active) setPreview(nextPreview);
      })
      .catch((caught) => {
        if (active) setPreviewError(caught instanceof Error ? caught.message : String(caught));
      })
      .finally(() => {
        if (active) setIsPreviewLoading(false);
      });
    return () => {
      active = false;
    };
  }, [share?.token, shareToken, selectedPath]);

  async function copyInstallCommand(kind: "harhub" | "skills", command: string) {
    await navigator.clipboard.writeText(command);
    setCopied(kind);
    window.setTimeout(() => setCopied(undefined), 1800);
  }

  if (!share && !error) {
    return (
      <SharePageShell>
        <Card className="w-full max-w-2xl">
          <CardContent className="flex min-h-72 items-center justify-center pt-6 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
            Loading shared Skill…
          </CardContent>
        </Card>
      </SharePageShell>
    );
  }

  if (error) {
    return (
      <SharePageShell>
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <PackageOpen className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            </div>
            <CardTitle>Share unavailable</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm text-muted-foreground">
            <p>The owner may have revoked this link or deleted the Skill.</p>
            <Button asChild variant="outline" className="w-fit">
              <a href="/">Visit Harhub</a>
            </Button>
          </CardContent>
        </Card>
      </SharePageShell>
    );
  }

  if (!share) return null;
  const currentPath = selectedPath ?? preview?.selectedFile?.path;
  const validation = share.asset.validation;
  const isValidationClean = validation.errors === 0 && validation.warnings === 0;

  return (
    <SharePageShell align="start">
      <div className="mx-auto grid w-full max-w-5xl gap-5">
        <Card className="overflow-hidden shadow-sm">
          <CardHeader className="border-b p-6 sm:px-8">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Agent Skill</Badge>
              <Badge variant="secondary" className={healthBadgeClass(share.asset.health)}>
                {share.asset.health}
              </Badge>
              {share.asset.version ? (
                <Badge variant="outline">v{share.asset.version}</Badge>
              ) : null}
            </div>
            <CardTitle className="break-words pt-2 text-2xl leading-tight">
              {share.asset.displayName}
            </CardTitle>
            <div className="break-all font-mono text-xs text-muted-foreground">
              {share.asset.name}
            </div>
            <CardDescription className="max-w-4xl whitespace-pre-line pt-2 text-sm leading-6">
              {share.asset.description || share.asset.name}
            </CardDescription>
          </CardHeader>

          <CardContent className="grid gap-6 p-6 sm:p-8">
            <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
              <PackageFact icon={FileCode2} label="Standard name" value={share.asset.name} mono />
              <PackageFact icon={Files} label="Files" value={String(share.asset.fileCount)} />
              <PackageFact icon={HardDrive} label="Package size" value={formatBytes(share.asset.size)} />
              <PackageFact icon={CalendarDays} label="Shared" value={formatSharedDate(share.createdAt)} />
            </div>

            <div className="flex items-start gap-2 border-y py-3 text-sm text-muted-foreground">
              {isValidationClean ? (
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
              ) : (
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
              )}
              <div className="min-w-0">
                <div className="font-medium text-foreground">
                  {isValidationClean ? "Validated with no issues" : "Validation findings reported"}
                </div>
                <div className="mt-0.5 text-xs">
                  {validation.errors} error{validation.errors === 1 ? "" : "s"} · {validation.warnings} warning{validation.warnings === 1 ? "" : "s"}
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <InstallCommand
                title="Install with the Harhub CLI"
                description="Downloads the verified package and installs it into your selected Agent."
                command={share.cliCommand}
                copied={copied === "harhub"}
                onCopy={() => copyInstallCommand("harhub", share.cliCommand)}
              />
              <InstallCommand
                title="Install with the Agent Skills CLI"
                description="Works with Codex, Claude Code, Cursor, OpenCode, and other compatible Agents."
                command={share.skillsCliCommand}
                copied={copied === "skills"}
                onCopy={() => copyInstallCommand("skills", share.skillsCliCommand)}
              />
            </div>
          </CardContent>

          <CardFooter className="flex flex-wrap items-center justify-between gap-3 border-t p-6 sm:px-8">
            <Button asChild>
              <a href={share.downloadUrl}>
                <Download aria-hidden="true" />
                Download {share.fileName}
              </a>
            </Button>
            <span className="text-xs text-muted-foreground">
              Shared from{" "}
              <a
                href="/"
                className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                Harhub
              </a>
            </span>
          </CardFooter>
        </Card>

        <Card className="min-w-0 overflow-hidden shadow-sm">
          <div className="flex min-w-0 items-center justify-between gap-4 border-b px-5 py-4 sm:px-6">
            <div className="min-w-0">
              <h2 className="font-semibold">Package contents</h2>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {currentPath ?? `${share.asset.fileCount} files available for review`}
              </p>
            </div>
            {isPreviewLoading ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
            ) : null}
          </div>
          {previewError ? (
            <div className="m-4 flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{previewError}</span>
            </div>
          ) : null}
          <div className="grid min-h-[520px] min-w-0 md:grid-cols-[260px_minmax(0,1fr)]">
            <div className="flex min-h-0 min-w-0 flex-col border-b md:border-b-0 md:border-r">
              <div className="max-h-72 min-h-0 flex-1 overflow-auto p-2 md:max-h-none">
                {preview?.tree.length ? (
                  <FileTree
                    nodes={preview.tree}
                    selectedPath={currentPath}
                    onSelect={setSelectedPath}
                  />
                ) : (
                  <div className="px-2 py-8 text-center text-sm text-muted-foreground">
                    {isPreviewLoading ? "Loading files…" : "No files available."}
                  </div>
                )}
              </div>
            </div>
            <FilePreviewPane file={preview?.selectedFile} />
          </div>
        </Card>
      </div>
    </SharePageShell>
  );
}

function SharePageShell({
  children,
  align = "center"
}: {
  children: ReactNode;
  align?: "center" | "start";
}) {
  return (
    <main className={
      `flex h-full overflow-y-auto justify-center bg-muted/20 px-4 py-6 sm:px-6 sm:py-8 ${
        align === "center" ? "items-center" : "items-start"
      }`
    }>
      {children}
    </main>
  );
}

function PackageFact({
  icon: Icon,
  label,
  value,
  mono = false
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`mt-1 truncate text-sm font-medium ${mono ? "font-mono text-xs" : ""}`} title={value}>
          {value}
        </div>
      </div>
    </div>
  );
}

function InstallCommand({
  title,
  description,
  command,
  copied,
  onCopy
}: {
  title: string;
  description: string;
  command: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="grid min-w-0 gap-3 rounded-lg border p-4">
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="mt-1 text-xs leading-5 text-muted-foreground">{description}</div>
      </div>
      <div className="flex min-w-0 gap-2">
        <Input readOnly value={command} className="min-w-0 font-mono text-xs" />
        <Button type="button" variant="outline" size="icon" className="shrink-0" onClick={onCopy} aria-label={`Copy ${title}`}>
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        </Button>
      </div>
    </div>
  );
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  const units = ["KB", "MB", "GB"];
  let value = size / 1024;
  let unit = units[0] ?? "KB";
  for (const nextUnit of units) {
    unit = nextUnit;
    if (value < 1024 || nextUnit === units[units.length - 1]) break;
    value /= 1024;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${unit}`;
}

function formatSharedDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}
