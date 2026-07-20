import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  FileDiff,
  FolderGit2,
  GitBranch,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Upload
} from "lucide-react";

import type {
  HarhubProject,
  ProjectBinding,
  ProjectBindingStatus,
  ProjectListResponse,
  ProjectSkillDiffResponse,
  WorkspaceRecord
} from "../../../shared/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "../components/ui/alert-dialog";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import {
  archiveProject,
  connectProjectRepository,
  getProject,
  getProjectSkillDiff,
  listProjects,
  publishProjectSkillFork,
  rotateProjectSyncToken
} from "../lib/api";
import { cn } from "../lib/utils";
import {
  buildProjectSkillLineDiff,
  type ProjectSkillLineDiffRow
} from "./project-skill-diff";

export function ProjectsView({
  token,
  workspace,
  routedProjectId,
  onNavigateProject,
  onOpenForge
}: {
  token: string;
  workspace: WorkspaceRecord;
  routedProjectId?: string;
  onNavigateProject: (projectId?: string) => void;
  onOpenForge: () => void;
}) {
  const [projects, setProjects] = useState<ProjectListResponse>();
  const [project, setProject] = useState<HarhubProject>();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [syncToken, setSyncToken] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [repository, setRepository] = useState("");
  const [defaultBranch, setDefaultBranch] = useState("main");
  const [isConnecting, setIsConnecting] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [diffBinding, setDiffBinding] = useState<ProjectBinding>();
  const [skillDiff, setSkillDiff] = useState<ProjectSkillDiffResponse>();
  const [diffError, setDiffError] = useState<string>();
  const [isLoadingDiff, setIsLoadingDiff] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  useEffect(() => {
    setSyncToken(undefined);
    setCopied(false);
    void refresh();
  }, [routedProjectId, token, workspace.id]);

  const bindingCounts = useMemo(
    () => countBindings(project?.bindings ?? []),
    [project?.bindings]
  );

  async function refresh() {
    setIsLoading(true);
    setError(undefined);
    try {
      if (routedProjectId) {
        const result = await getProject(token, workspace.id, routedProjectId);
        setProject(result);
        setRepository(result.repository
          ? `${result.repository.owner}/${result.repository.name}`
          : "");
        setDefaultBranch(result.repository?.defaultBranch ?? "main");
      } else {
        setProject(undefined);
        setProjects(await listProjects(token, workspace.id));
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsLoading(false);
    }
  }

  async function rotateToken() {
    if (!project) return;
    setIsRotating(true);
    setError(undefined);
    try {
      const result = await rotateProjectSyncToken(token, workspace.id, project.id);
      setProject(result.project);
      setSyncToken(result.syncToken);
      setCopied(false);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsRotating(false);
    }
  }

  async function connectRepository() {
    if (!project || !repository.trim()) return;
    setIsConnecting(true);
    setError(undefined);
    try {
      const result = await connectProjectRepository(token, workspace.id, project.id, {
        repository: repository.trim(),
        defaultBranch: defaultBranch.trim() || "main"
      });
      setProject(result.project);
      setSyncToken(result.syncToken);
      setCopied(false);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsConnecting(false);
    }
  }

  async function archiveCurrentProject() {
    if (!project) return;
    setIsArchiving(true);
    setError(undefined);
    try {
      await archiveProject(token, workspace.id, project.id);
      setArchiveOpen(false);
      onNavigateProject(undefined);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsArchiving(false);
    }
  }

  async function copyToken() {
    if (!syncToken) return;
    await navigator.clipboard.writeText(syncToken);
    setCopied(true);
  }

  async function openSkillDiff(binding: ProjectBinding) {
    if (!project) return;
    setDiffBinding(binding);
    setSkillDiff(undefined);
    setDiffError(undefined);
    setDiffOpen(true);
    await loadSkillDiff(binding);
  }

  async function loadSkillDiff(binding: ProjectBinding, selectedPath?: string) {
    if (!project) return;
    setIsLoadingDiff(true);
    setDiffError(undefined);
    try {
      const result = await getProjectSkillDiff(
        token,
        workspace.id,
        project.id,
        binding.id,
        selectedPath
      );
      setSkillDiff(result);
      if (!selectedPath && result.files[0]) {
        setSkillDiff(await getProjectSkillDiff(
          token,
          workspace.id,
          project.id,
          binding.id,
          result.files[0].path
        ));
      }
    } catch (caught) {
      setDiffError(errorMessage(caught));
    } finally {
      setIsLoadingDiff(false);
    }
  }

  async function publishSkillFork() {
    if (!project || !diffBinding) return;
    setIsPublishing(true);
    setDiffError(undefined);
    try {
      const result = await publishProjectSkillFork(
        token,
        workspace.id,
        project.id,
        diffBinding.id
      );
      setProject(result.project);
      setPublishOpen(false);
      setDiffOpen(false);
      setSkillDiff(undefined);
      setDiffBinding(undefined);
    } catch (caught) {
      setDiffError(errorMessage(caught));
    } finally {
      setIsPublishing(false);
    }
  }

  if (routedProjectId) {
    return (
      <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto pb-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button type="button" variant="outline" onClick={() => onNavigateProject(undefined)}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Projects
          </Button>
          <Button type="button" variant="outline" onClick={() => void refresh()}>
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} aria-hidden="true" />
            Refresh
          </Button>
        </div>

        {error ? <ErrorNotice message={error} /> : null}
        {isLoading && !project ? <LoadingCard /> : null}
        {project ? (
          <>
            <Card className="shadow-sm">
              <CardHeader className="border-b">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-xl">{project.name}</CardTitle>
                      <ProjectStatusBadge project={project} />
                    </div>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                      {project.description}
                    </p>
                  </div>
                  {project.repository ? (
                    <a
                      href={project.repository.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium hover:bg-accent"
                    >
                      <FolderGit2 className="h-4 w-4" aria-hidden="true" />
                      {project.repository.owner}/{project.repository.name}
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                  ) : (
                    <Badge variant="outline" className="shrink-0">Repository not connected</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
                <Metric label="Bindings" value={String(project.bindings.length)} />
                <Metric label="Synced" value={String(bindingCounts.synced)} />
                <Metric label="Changed" value={String(bindingCounts.added + bindingCounts.modified)} />
                <Metric
                  label="Last sync"
                  value={project.sync.lastSyncedAt
                    ? formatTime(project.sync.lastSyncedAt)
                    : project.repository
                      ? "Waiting for GitHub"
                      : "Not connected"}
                />
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="border-b">
                <CardTitle className="flex items-center gap-2 text-base">
                  <GitBranch className="h-4 w-4 text-blue-700" aria-hidden="true" />
                  Harness bindings
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {project.bindings.length ? (
                  <div className="divide-y">
                    {project.bindings.map((binding) => (
                      <BindingRow
                        key={binding.id}
                        binding={binding}
                        onReview={() => void openSkillDiff(binding)}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="p-6 text-sm text-muted-foreground">
                    No bindings have been reported by this repository yet.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="border-b">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck className="h-4 w-4 text-blue-700" aria-hidden="true" />
                  GitHub repository connection
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 p-5">
                {!project.repository ? (
                  <div className="space-y-4">
                    <p className="text-sm leading-6 text-muted-foreground">
                      Connect the repository that contains this framework when you are ready to
                      enable GitHub Actions synchronization.
                    </p>
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
                      <div className="space-y-1.5">
                        <label htmlFor="project-repository" className="text-xs font-medium">
                          GitHub repository
                        </label>
                        <Input
                          id="project-repository"
                          value={repository}
                          placeholder="owner/repository"
                          disabled={isConnecting || project.status === "archived"}
                          onChange={(event) => setRepository(event.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label htmlFor="project-default-branch" className="text-xs font-medium">
                          Default branch
                        </label>
                        <Input
                          id="project-default-branch"
                          value={defaultBranch}
                          placeholder="main"
                          disabled={isConnecting || project.status === "archived"}
                          onChange={(event) => setDefaultBranch(event.target.value)}
                        />
                      </div>
                    </div>
                    <Button
                      type="button"
                      disabled={
                        isConnecting ||
                        project.status === "archived" ||
                        !repository.trim()
                      }
                      onClick={() => void connectRepository()}
                    >
                      {isConnecting
                        ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        : <FolderGit2 className="h-4 w-4" aria-hidden="true" />}
                      Connect repository
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm leading-6 text-muted-foreground">
                    The generated framework watches harness Skills, MCP definitions, and Rules.
                    Add the sync token as the repository secret
                    {" "}<code>HARHUB_PROJECT_TOKEN</code>.
                  </p>
                )}
                {syncToken ? (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
                    <p className="text-sm font-medium text-amber-950">Copy this token now</p>
                    <p className="mt-1 text-xs text-amber-800">
                      Harhub stores only its hash and cannot show this value again.
                    </p>
                    <div className="mt-3 flex min-w-0 items-center gap-2">
                      <code className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap rounded border bg-background px-3 py-2 text-xs">
                        {syncToken}
                      </code>
                      <Button type="button" variant="outline" size="sm" onClick={() => void copyToken()}>
                        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        {copied ? "Copied" : "Copy"}
                      </Button>
                    </div>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {project.repository ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isRotating || project.status === "archived"}
                      onClick={() => void rotateToken()}
                    >
                      {isRotating
                        ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        : <RotateCcw className="h-4 w-4" aria-hidden="true" />}
                      Rotate sync token
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    disabled={project.status === "archived"}
                    onClick={() => setArchiveOpen(true)}
                  >
                    <Archive className="h-4 w-4" aria-hidden="true" />
                    Archive project
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        ) : null}

        <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Archive this Project?</AlertDialogTitle>
              <AlertDialogDescription>
                The Project will become read-only and any repository sync requests will stop.
                Its tracked binding history remains available in Harhub.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isArchiving}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={isArchiving}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => void archiveCurrentProject()}
              >
                {isArchiving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Archive
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog
          open={diffOpen}
          onOpenChange={(open) => {
            setDiffOpen(open);
            if (!open) {
              setDiffBinding(undefined);
              setSkillDiff(undefined);
              setDiffError(undefined);
            }
          }}
        >
          <DialogContent className="flex max-h-[88vh] max-w-5xl flex-col overflow-hidden p-0">
            <DialogHeader className="border-b px-6 py-5 pr-12">
              <DialogTitle>{diffBinding?.name ?? "Project Skill changes"}</DialogTitle>
              <DialogDescription>
                Review the repository fork against the current workspace Library version.
                Nothing is published until you confirm it.
              </DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
              {isLoadingDiff && !skillDiff ? (
                <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Loading file differences…
                </div>
              ) : null}
              {diffError ? <ErrorNotice message={diffError} /> : null}
              {skillDiff ? <SkillDiffView
                diff={skillDiff}
                loading={isLoadingDiff}
                onSelect={(path) => diffBinding && void loadSkillDiff(diffBinding, path)}
              /> : null}
            </div>
            {skillDiff ? (
              <div className="flex flex-col gap-3 border-t bg-muted/20 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">
                  {skillDiff.fork.validation.errors} errors · {skillDiff.fork.validation.warnings} warnings
                </p>
                <Button
                  type="button"
                  disabled={skillDiff.fork.validation.errors > 0 || isPublishing}
                  onClick={() => setPublishOpen(true)}
                >
                  <Upload className="h-4 w-4" aria-hidden="true" />
                  Sync to Library
                </Button>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>

        <AlertDialog open={publishOpen} onOpenChange={setPublishOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Sync this Project Skill to the Library?</AlertDialogTitle>
              <AlertDialogDescription>
                This replaces the current global Skill with the reviewed repository fork, or adds
                it as a new global Skill. The Project binding will then be marked as synced.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {diffError ? <ErrorNotice message={diffError} /> : null}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPublishing}>Cancel</AlertDialogCancel>
              <AlertDialogAction disabled={isPublishing} onClick={() => void publishSkillFork()}>
                {isPublishing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Confirm sync
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </section>
    );
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto pb-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Track repository relationships with Skills, MCP definitions, and Rules over time.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => void refresh()}>
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} aria-hidden="true" />
            Refresh
          </Button>
          <Button type="button" onClick={onOpenForge}>
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            Forge a project
          </Button>
        </div>
      </div>

      {error ? <ErrorNotice message={error} /> : null}
      {isLoading && !projects ? <LoadingCard /> : null}
      {projects && projects.projects.length === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="flex min-h-72 flex-col items-center justify-center p-8 text-center">
            <FolderGit2 className="h-8 w-8 text-blue-700" aria-hidden="true" />
            <h2 className="mt-4 text-lg font-semibold">No tracked Projects yet</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              Complete a Forge session, then freeze the generated framework into a Project and
              connect its GitHub repository.
            </p>
            <Button type="button" className="mt-5" onClick={onOpenForge}>
              Open Forge
            </Button>
          </CardContent>
        </Card>
      ) : null}
      {projects?.projects.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {projects.projects.map((item) => (
            <Button
              key={item.id}
              type="button"
              variant="outline"
              className="h-auto min-w-0 flex-col items-stretch rounded-xl bg-card p-5 text-left font-normal shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50/30"
              onClick={() => onNavigateProject(item.id)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate font-semibold">{item.name}</h2>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {item.repository
                      ? `${item.repository.owner}/${item.repository.name}`
                      : "Repository not connected"}
                  </p>
                </div>
                <ProjectStatusBadge project={item} />
              </div>
              <p className="mt-3 line-clamp-2 text-sm leading-6 text-muted-foreground">
                {item.description}
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span>{item.bindings.length} bindings</span>
                <span>·</span>
                <span>{item.sync.revision ? `Revision ${item.sync.revision}` : "Awaiting sync"}</span>
              </div>
            </Button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function BindingRow({
  binding,
  onReview
}: {
  binding: ProjectBinding;
  onReview: () => void;
}) {
  const reviewable = binding.kind === "skill" && Boolean(binding.fork) &&
    (binding.status === "added" || binding.status === "modified");
  return (
    <div className="grid gap-2 px-5 py-4 sm:grid-cols-[110px_minmax(0,1fr)_120px_110px] sm:items-center">
      <Badge variant="outline" className="w-fit uppercase">{binding.kind}</Badge>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{binding.name}</p>
        <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{binding.path}</p>
      </div>
      {reviewable ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          onClick={onReview}
        >
          <FileDiff className="h-4 w-4" aria-hidden="true" />
          Review
        </Button>
      ) : <span />}
      <div className="sm:justify-self-end">
        <BindingStatusBadge status={binding.status} />
      </div>
    </div>
  );
}

function ProjectStatusBadge({ project }: { project: HarhubProject }) {
  if (project.status === "archived") return <Badge variant="secondary">Archived</Badge>;
  if (!project.repository) return <Badge variant="outline">Unlinked</Badge>;
  return project.sync.status === "synced"
    ? <Badge className="bg-emerald-600">Synced</Badge>
    : <Badge variant="outline">Awaiting sync</Badge>;
}

function BindingStatusBadge({ status }: { status: ProjectBindingStatus }) {
  const label = status === "pending"
    ? "Pending"
    : status === "synced"
      ? "Synced"
      : status === "added"
        ? "Added"
      : status === "modified"
        ? "Modified"
        : "Missing";
  return (
    <Badge
      variant={status === "synced" ? "default" : "outline"}
      className={cn(
        "w-fit",
        status === "synced" && "bg-emerald-600",
        status === "added" && "border-blue-300 text-blue-800",
        status === "modified" && "border-amber-300 text-amber-800",
        status === "missing" && "border-red-300 text-red-700"
      )}
    >
      {label}
    </Badge>
  );
}

function SkillDiffView({
  diff,
  loading,
  onSelect
}: {
  diff: ProjectSkillDiffResponse;
  loading: boolean;
  onSelect: (path: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="outline">{diff.files.length} changed files</Badge>
        <span className="font-mono text-xs text-muted-foreground">{diff.path}</span>
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
      </div>
      <div className="grid min-h-[360px] overflow-hidden rounded-lg border md:grid-cols-[240px_minmax(0,1fr)]">
        <div className="max-h-[58vh] overflow-auto border-b bg-muted/20 p-2 md:border-b-0 md:border-r">
          {diff.files.map((file) => (
            <Button
              key={file.path}
              type="button"
              variant="ghost"
              className={cn(
                "mb-1 h-auto w-full justify-start gap-2 whitespace-normal px-2 py-2 text-left font-mono text-xs",
                diff.selectedFile?.path === file.path && "bg-accent"
              )}
              onClick={() => onSelect(file.path)}
            >
              <span className={cn(
                "w-4 shrink-0 text-center font-sans font-semibold uppercase",
                file.status === "added" && "text-emerald-700",
                file.status === "modified" && "text-amber-700",
                file.status === "removed" && "text-red-700"
              )}>
                {file.status[0]}
              </span>
              <span className="break-all">{file.path}</span>
            </Button>
          ))}
        </div>
        <div className="min-w-0 bg-background">
          {diff.selectedFile ? (
            <>
              <div className="border-b px-4 py-3 font-mono text-xs font-medium">
                {diff.selectedFile.path}
              </div>
              {diff.selectedFile.binary ? (
                <p className="p-5 text-sm text-muted-foreground">
                  Binary content cannot be previewed. The complete file will still be published.
                </p>
              ) : (
                <SideBySideLineDiff
                  beforeContent={diff.selectedFile.baseContent}
                  afterContent={diff.selectedFile.forkContent}
                />
              )}
              {diff.selectedFile.truncated ? (
                <p className="border-t bg-amber-50 px-4 py-2 text-xs text-amber-900">
                  Preview truncated at 256 KB; publishing still uses the complete file.
                </p>
              ) : null}
            </>
          ) : (
            <p className="p-5 text-sm text-muted-foreground">Select a changed file to compare.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function SideBySideLineDiff({
  beforeContent,
  afterContent
}: {
  beforeContent?: string;
  afterContent?: string;
}) {
  const rows = useMemo(
    () => buildProjectSkillLineDiff(beforeContent, afterContent),
    [afterContent, beforeContent]
  );
  const counts = rows.reduce(
    (result, row) => ({ ...result, [row.kind]: result[row.kind] + 1 }),
    { unchanged: 0, modified: 0, added: 0, removed: 0 }
  );

  return (
    <div className="min-h-[320px] min-w-0">
      <div className="flex flex-wrap items-center gap-2 border-b bg-muted/10 px-4 py-2 text-[11px]">
        {counts.modified ? <DiffCount label="modified" count={counts.modified} tone="amber" /> : null}
        {counts.added ? <DiffCount label="added" count={counts.added} tone="green" /> : null}
        {counts.removed ? <DiffCount label="removed" count={counts.removed} tone="red" /> : null}
      </div>
      <div className="max-h-[52vh] min-h-[280px] overflow-auto bg-background font-mono text-xs leading-5">
        <div className="min-w-[800px]">
          <div className="sticky top-0 z-10 grid grid-cols-2 border-b bg-background font-sans text-xs font-medium text-muted-foreground shadow-sm">
            <div className="border-r px-4 py-2">Library</div>
            <div className="px-4 py-2">Project fork</div>
          </div>
          {rows.map((row, index) => (
            <div
              key={`${row.before?.line ?? "x"}:${row.after?.line ?? "x"}:${index}`}
              className="grid min-h-6 grid-cols-2 border-b border-border/50 last:border-b-0"
            >
              <DiffLineCell row={row} side="before" />
              <DiffLineCell row={row} side="after" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DiffCount({
  label,
  count,
  tone
}: {
  label: string;
  count: number;
  tone: "amber" | "green" | "red";
}) {
  return (
    <span className={cn(
      "rounded border px-1.5 py-0.5",
      tone === "amber" && "border-amber-200 bg-amber-50 text-amber-800",
      tone === "green" && "border-emerald-200 bg-emerald-50 text-emerald-800",
      tone === "red" && "border-red-200 bg-red-50 text-red-800"
    )}>
      {count} {label}
    </span>
  );
}

function DiffLineCell({
  row,
  side
}: {
  row: ProjectSkillLineDiffRow;
  side: "before" | "after";
}) {
  const line = side === "before" ? row.before : row.after;
  const other = side === "before" ? row.after : row.before;
  const removed = side === "before" && (row.kind === "removed" || row.kind === "modified");
  const added = side === "after" && (row.kind === "added" || row.kind === "modified");
  const marker = removed ? "−" : added ? "+" : "";
  return (
    <div className={cn(
      "flex min-w-0 border-r last:border-r-0",
      removed && "bg-red-50/80",
      added && "bg-emerald-50/80",
      !line && row.kind !== "unchanged" && "bg-muted/20"
    )}>
      <span className="w-10 shrink-0 select-none border-r bg-muted/10 px-2 text-right text-muted-foreground/70">
        {line?.line ?? ""}
      </span>
      <span className={cn(
        "w-5 shrink-0 select-none text-center font-semibold",
        removed && "text-red-700",
        added && "text-emerald-700"
      )}>
        {marker}
      </span>
      <code className="min-w-0 whitespace-pre px-1.5 text-foreground">
        {line ? (
          row.kind === "modified" && other
            ? <ChangedLineText text={line.text} other={other.text} added={side === "after"} />
            : line.text || " "
        ) : " "}
      </code>
    </div>
  );
}

function ChangedLineText({
  text,
  other,
  added
}: {
  text: string;
  other: string;
  added: boolean;
}) {
  let prefixLength = 0;
  while (
    prefixLength < text.length &&
    prefixLength < other.length &&
    text[prefixLength] === other[prefixLength]
  ) {
    prefixLength += 1;
  }
  let suffixLength = 0;
  while (
    suffixLength < text.length - prefixLength &&
    suffixLength < other.length - prefixLength &&
    text[text.length - suffixLength - 1] === other[other.length - suffixLength - 1]
  ) {
    suffixLength += 1;
  }
  const changedEnd = text.length - suffixLength;
  return (
    <>
      {text.slice(0, prefixLength)}
      <span className={added ? "bg-emerald-200 text-emerald-950" : "bg-red-200 text-red-950"}>
        {text.slice(prefixLength, changedEnd) || " "}
      </span>
      {text.slice(changedEnd)}
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-sm font-semibold">{value}</p>
    </div>
  );
}

function LoadingCard() {
  return (
    <Card className="shadow-sm">
      <CardContent className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin text-blue-700" aria-hidden="true" />
        Loading Projects…
      </CardContent>
    </Card>
  );
}

function ErrorNotice({ message }: { message: string }) {
  return <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{message}</div>;
}

function countBindings(bindings: ProjectBinding[]) {
  const result = { pending: 0, synced: 0, added: 0, modified: 0, missing: 0 };
  for (const binding of bindings) result[binding.status] += 1;
  return result;
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
}

function errorMessage(caught: unknown): string {
  return caught instanceof Error ? caught.message : String(caught);
}
