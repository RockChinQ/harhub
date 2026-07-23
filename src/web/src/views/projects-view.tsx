import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArrowLeft,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  FileDiff,
  FileJson2,
  FolderGit2,
  Github,
  GitBranch,
  GitPullRequest,
  Loader2,
  PackagePlus,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload
} from "lucide-react";

import type {
  AssetRecord,
  HarhubProject,
  GitHubInstallation,
  GitHubIntegrationStatus,
  GitHubRepositorySummary,
  ProjectBinding,
  ProjectBindingStatus,
  ProjectChangeProposal,
  ProjectInventoryArtifact,
  ProjectInventoryResponse,
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
import { Checkbox } from "../components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from "../components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "../components/ui/tooltip";
import {
  archiveProject,
  authorizeGitHubInstallation,
  connectProjectRepository,
  connectProjectGitHubApp,
  createProjectBootstrapProposal,
  createProjectSkillAddProposal,
  createProjectSkillRemoveProposal,
  getGitHubIntegrationStatus,
  getProjectInventory,
  getProjectSkillDiff,
  importGitHubRepository,
  listGitHubInstallations,
  listGitHubRepositories,
  listProjects,
  getWorkspaceAssets,
  openProjectProposal,
  publishProjectSkillFork,
  rescanProjectRepository,
  rotateProjectSyncToken,
  updateProjectBindingPolicy
} from "../lib/api";
import { useDocumentTitle } from "../app/document-title";
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
  const [inventory, setInventory] = useState<ProjectInventoryResponse>();
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
  const [importOpen, setImportOpen] = useState(false);
  const [githubStatus, setGithubStatus] = useState<GitHubIntegrationStatus>();
  const [installations, setInstallations] = useState<GitHubInstallation[]>([]);
  const [selectedInstallationId, setSelectedInstallationId] = useState("");
  const [repositories, setRepositories] = useState<GitHubRepositorySummary[]>([]);
  const [repositorySearch, setRepositorySearch] = useState("");
  const [isLoadingGitHub, setIsLoadingGitHub] = useState(false);
  const [importingRepositoryId, setImportingRepositoryId] = useState<string>();
  const [isRescanning, setIsRescanning] = useState(false);
  const [policyPath, setPolicyPath] = useState<string>();
  const [proposal, setProposal] = useState<ProjectChangeProposal>();
  const [proposalOpen, setProposalOpen] = useState(false);
  const [isCreatingProposal, setIsCreatingProposal] = useState(false);
  const [isOpeningProposal, setIsOpeningProposal] = useState(false);
  const [connectingExistingProject, setConnectingExistingProject] = useState(false);
  const [projectSkillSearch, setProjectSkillSearch] = useState("");
  const [librarySkillOpen, setLibrarySkillOpen] = useState(false);
  const [librarySkills, setLibrarySkills] = useState<AssetRecord[]>([]);
  const [librarySkillSearch, setLibrarySkillSearch] = useState("");
  const [selectedLibrarySkillIds, setSelectedLibrarySkillIds] = useState<string[]>([]);
  const [isLoadingLibrarySkills, setIsLoadingLibrarySkills] = useState(false);
  const [removeSkillOpen, setRemoveSkillOpen] = useState(false);
  const [removeSkillBinding, setRemoveSkillBinding] = useState<ProjectBinding>();
  const [projectDetailTab, setProjectDetailTab] = useState("skills");
  const [scanHistoryOpen, setScanHistoryOpen] = useState(false);
  useDocumentTitle(
    routedProjectId
      ? project?.id === routedProjectId
        ? `${project.name} · Project`
        : "Project"
      : "Projects"
  );

  useEffect(() => {
    setSyncToken(undefined);
    setCopied(false);
    setProjectDetailTab("skills");
    setScanHistoryOpen(false);
    void refresh();
  }, [routedProjectId, token, workspace.id]);

  useEffect(() => {
    if (!routedProjectId || !inventory?.activeJob) return;
    const timer = window.setInterval(() => void refreshInventory(), 1500);
    return () => window.clearInterval(timer);
  }, [inventory?.activeJob?.id, routedProjectId, token, workspace.id]);

  const bindingCounts = useMemo(
    () => countBindings(project?.bindings ?? []),
    [project?.bindings]
  );
  const projectSkills = useMemo(
    () => (project?.bindings ?? []).filter((binding) =>
      binding.kind === "skill" && binding.status !== "missing"
    ),
    [project?.bindings]
  );
  const filteredProjectSkills = useMemo(() => {
    const query = projectSkillSearch.trim().toLowerCase();
    if (!query) return projectSkills;
    return projectSkills.filter((binding) =>
      `${binding.name} ${binding.path}`.toLowerCase().includes(query)
    );
  }, [projectSkillSearch, projectSkills]);
  const otherBindings = useMemo(
    () => (project?.bindings ?? []).filter((binding) => binding.kind !== "skill"),
    [project?.bindings]
  );
  const existingLibrarySkillIds = useMemo(() => new Set([
    ...projectSkills.flatMap((binding) => binding.assetId ? [binding.assetId] : []),
    ...(inventory?.latestSnapshot?.artifacts ?? []).flatMap((artifact) =>
      artifact.kind === "skill" && artifact.libraryAssetId ? [artifact.libraryAssetId] : []
    )
  ]), [inventory?.latestSnapshot?.artifacts, projectSkills]);
  const filteredLibrarySkills = useMemo(() => {
    const query = librarySkillSearch.trim().toLowerCase();
    return librarySkills.filter((asset) =>
      !existingLibrarySkillIds.has(asset.id) &&
      (!query || `${asset.displayName} ${asset.slug} ${asset.description}`.toLowerCase().includes(query))
    );
  }, [existingLibrarySkillIds, librarySkillSearch, librarySkills]);
  const bootstrapProposal = inventory?.proposals.find((candidate) => candidate.kind === "bootstrap");
  const activeSkillProposal = inventory?.proposals.find((candidate) =>
    candidate.kind !== "bootstrap" &&
    (candidate.status === "preview" || candidate.status === "creating" || candidate.status === "open")
  );
  const projectSkillManagementDisabledReason = getProjectSkillManagementDisabledReason(
    project,
    inventory
  );
  const projectSkillMutationDisabledReason = isCreatingProposal
    ? "A Skill change is being prepared."
    : activeSkillProposal?.status === "open"
      ? "Merge or close the current Skill change before starting another."
      : activeSkillProposal
        ? "Finish the current Skill change before starting another."
        : projectSkillManagementDisabledReason;

  async function refresh() {
    setIsLoading(true);
    setError(undefined);
    try {
      if (routedProjectId) {
        const result = await getProjectInventory(token, workspace.id, routedProjectId);
        setInventory(result);
        setProposal(result.proposals[0]);
        setProject(result.project);
        setRepository(result.project.repository
          ? `${result.project.repository.owner}/${result.project.repository.name}`
          : "");
        setDefaultBranch(result.project.repository?.defaultBranch ?? "main");
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

  async function refreshInventory() {
    if (!routedProjectId) return;
    try {
      const result = await getProjectInventory(token, workspace.id, routedProjectId);
      setInventory(result);
      setProposal(result.proposals[0]);
      setProject(result.project);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function openRepositoryImport(connectExisting = false) {
    setConnectingExistingProject(connectExisting);
    setImportOpen(true);
    setIsLoadingGitHub(true);
    setError(undefined);
    try {
      const [status, linked] = await Promise.all([
        getGitHubIntegrationStatus(token, workspace.id),
        listGitHubInstallations(token, workspace.id)
      ]);
      setGithubStatus(status);
      setInstallations(linked.installations);
      const installationId = linked.installations[0]?.id ?? "";
      setSelectedInstallationId(installationId);
      setRepositories(installationId
        ? (await listGitHubRepositories(token, workspace.id, installationId)).repositories
        : []);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsLoadingGitHub(false);
    }
  }

  async function installGitHubApp() {
    setIsLoadingGitHub(true);
    try {
      const result = await authorizeGitHubInstallation(token, workspace.id, "/projects");
      window.location.assign(result.url);
    } catch (caught) {
      setError(errorMessage(caught));
      setIsLoadingGitHub(false);
    }
  }

  async function selectInstallation(installationId: string) {
    setSelectedInstallationId(installationId);
    setIsLoadingGitHub(true);
    try {
      setRepositories((await listGitHubRepositories(token, workspace.id, installationId)).repositories);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsLoadingGitHub(false);
    }
  }

  async function importRepository(repositoryId: string) {
    if (!selectedInstallationId) return;
    setImportingRepositoryId(repositoryId);
    try {
      const result = connectingExistingProject && project
        ? await connectProjectGitHubApp(token, workspace.id, project.id, {
            installationId: selectedInstallationId,
            repositoryId
          })
        : await importGitHubRepository(token, workspace.id, {
            installationId: selectedInstallationId,
            repositoryId
          });
      setImportOpen(false);
      if (connectingExistingProject && project) {
        setProject(result.project);
        await refreshInventory();
      } else {
        onNavigateProject(result.project.id);
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setImportingRepositoryId(undefined);
    }
  }

  async function rescanRepository() {
    if (!project) return;
    setIsRescanning(true);
    try {
      await rescanProjectRepository(token, workspace.id, project.id);
      await refreshInventory();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsRescanning(false);
    }
  }

  async function changeArtifactPolicy(artifact: ProjectInventoryArtifact, ownership: "repository" | "library" | "ignored") {
    if (!project) return;
    setPolicyPath(artifact.path);
    try {
      await updateProjectBindingPolicy(token, workspace.id, project.id, {
        artifactPath: artifact.path,
        ownership,
        ...(ownership === "library" && artifact.libraryAssetId
          ? { libraryAssetId: artifact.libraryAssetId, ...(artifact.libraryVersion ? { pinnedVersion: artifact.libraryVersion } : {}) }
          : {})
      });
      await refreshInventory();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPolicyPath(undefined);
    }
  }

  async function previewBootstrapProposal() {
    if (!project) return;
    setIsCreatingProposal(true);
    try {
      const created = await createProjectBootstrapProposal(token, workspace.id, project.id);
      setProposal(created);
      setProposalOpen(true);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsCreatingProposal(false);
    }
  }

  async function openProposalPullRequest() {
    if (!project || !proposal) return;
    setIsOpeningProposal(true);
    try {
      const opened = await openProjectProposal(token, workspace.id, project.id, proposal.id);
      setProposal(opened);
      await refreshInventory();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsOpeningProposal(false);
    }
  }

  async function openLibrarySkillPicker() {
    setLibrarySkillOpen(true);
    setLibrarySkillSearch("");
    setSelectedLibrarySkillIds([]);
    setIsLoadingLibrarySkills(true);
    setError(undefined);
    try {
      const result = await getWorkspaceAssets(token, workspace.id, { kind: "skill" });
      setLibrarySkills(result.assets.filter((asset) => asset.health !== "error" && Boolean(asset.storage)));
    } catch (caught) {
      setError(errorMessage(caught));
      setLibrarySkillOpen(false);
    } finally {
      setIsLoadingLibrarySkills(false);
    }
  }

  function toggleLibrarySkill(assetId: string, checked: boolean) {
    setSelectedLibrarySkillIds((current) => {
      if (!checked) return current.filter((candidate) => candidate !== assetId);
      if (current.includes(assetId) || current.length >= 20) return current;
      return [...current, assetId];
    });
  }

  async function previewAddLibrarySkills() {
    if (!project || selectedLibrarySkillIds.length === 0) return;
    setIsCreatingProposal(true);
    setError(undefined);
    try {
      const created = await createProjectSkillAddProposal(
        token,
        workspace.id,
        project.id,
        selectedLibrarySkillIds
      );
      setProposal(created);
      setLibrarySkillOpen(false);
      setProposalOpen(true);
      await refreshInventory();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsCreatingProposal(false);
    }
  }

  function confirmRemoveSkill(binding: ProjectBinding) {
    setRemoveSkillBinding(binding);
    setRemoveSkillOpen(true);
  }

  async function previewRemoveSkill() {
    if (!project || !removeSkillBinding) return;
    setIsCreatingProposal(true);
    setError(undefined);
    try {
      const created = await createProjectSkillRemoveProposal(
        token,
        workspace.id,
        project.id,
        removeSkillBinding.id
      );
      setProposal(created);
      setRemoveSkillOpen(false);
      setRemoveSkillBinding(undefined);
      setProposalOpen(true);
      await refreshInventory();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsCreatingProposal(false);
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
                    <p className="mt-2 line-clamp-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                      {project.description}
                    </p>
                  </div>
                  {project.repository ? (
                    <a
                      href={project.repository.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-9 max-w-full shrink-0 items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium hover:bg-accent sm:max-w-xs"
                    >
                      <FolderGit2 className="h-4 w-4" aria-hidden="true" />
                      <span className="truncate">{project.repository.owner}/{project.repository.name}</span>
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                  ) : (
                    <Badge variant="outline" className="shrink-0">Repository not connected</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-x-10 gap-y-4 p-5">
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

            <Tabs value={projectDetailTab} onValueChange={setProjectDetailTab}>
              <TabsList className="h-auto w-full justify-start gap-6 overflow-x-auto rounded-none border-b bg-transparent p-0">
                <TabsTrigger
                  value="skills"
                  className="gap-2 rounded-none border-b-2 border-transparent px-0 py-3 data-[state=active]:border-blue-700 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                >
                  Skills
                  <Badge variant="secondary" className="h-5 min-w-5 justify-center px-1.5 text-[10px]">
                    {projectSkills.length}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger
                  value="inventory"
                  className="gap-2 rounded-none border-b-2 border-transparent px-0 py-3 data-[state=active]:border-blue-700 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                >
                  Inventory
                  <Badge variant="secondary" className="h-5 min-w-5 justify-center px-1.5 text-[10px]">
                    {inventory?.latestSnapshot?.artifacts.length ?? 0}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger
                  value="settings"
                  className="rounded-none border-b-2 border-transparent px-0 py-3 data-[state=active]:border-blue-700 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                >
                  Settings
                </TabsTrigger>
              </TabsList>

              <TabsContent value="inventory" className="mt-4">
                {inventory?.connection?.mode === "github-app" ? (
                  <Card className="shadow-sm">
                <CardHeader className="border-b">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <ScanSearch className="h-4 w-4 text-blue-700" aria-hidden="true" />
                      Repository inventory
                    </CardTitle>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">GitHub App</Badge>
                      {inventory.connection.status !== "active" ? (
                        <Badge variant="outline" className="border-red-300 text-red-700">
                          {inventory.connection.status === "permission-lost" ? "Permission lost" : "Disconnected"}
                        </Badge>
                      ) : null}
                      <Badge variant="outline">{inventory.connection.permissionMode === "write" ? "Managed changes" : "Read only"}</Badge>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={
                          isRescanning || Boolean(inventory.activeJob) || project.status === "archived" ||
                          inventory.connection.status !== "active"
                        }
                        onClick={() => void rescanRepository()}
                      >
                        {isRescanning || inventory.activeJob
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <RefreshCw className="h-4 w-4" />}
                        {inventory.activeJob ? "Scanning" : "Rescan"}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="grid gap-3 border-b p-5 sm:grid-cols-3">
                    <Metric label="Default branch" value={inventory.connection.defaultBranch} />
                    <Metric
                      label="Observed commit"
                      value={inventory.latestSnapshot?.commitSha.slice(0, 10) ?? "Initial scan pending"}
                    />
                    <Metric
                      label="Detected assets"
                      value={String(inventory.latestSnapshot?.artifacts.length ?? 0)}
                    />
                  </div>
                  {inventory.activeJob ? (
                    <p className="border-b bg-blue-50 px-5 py-3 text-sm text-blue-900">
                      Reading the latest repository state. You can leave this page; the scan continues on the server.
                    </p>
                  ) : null}
                  {!inventory.activeJob && inventory.latestJob?.status === "failed" ? (
                    <div className="border-b bg-red-50 px-5 py-3 text-sm text-red-900">
                      <p className="font-medium">Repository scan failed</p>
                      <p className="mt-1">{inventory.latestJob.failure?.message ?? "The repository could not be scanned."}</p>
                    </div>
                  ) : null}
                  {inventory.latestSnapshot?.artifacts.length ? (
                    <div className="max-h-[56vh] divide-y overflow-y-auto">
                      {inventory.latestSnapshot.artifacts.map((artifact) => (
                        <div
                          key={artifact.id}
                          className="grid gap-3 px-5 py-4 lg:grid-cols-[110px_minmax(0,1fr)_160px_190px] lg:items-center"
                        >
                          <Badge variant="outline" className="w-fit uppercase">{artifact.kind}</Badge>
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{artifact.name}</p>
                            <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{artifact.path}</p>
                            {artifact.issues[0] ? (
                              <p className="mt-1 text-xs text-destructive">{artifact.issues[0].message}</p>
                            ) : null}
                          </div>
                          <InventoryRelationshipBadge relationship={artifact.relationship} />
                          <select
                            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                            value={inventory.policies.find((policy) => policy.artifactPath === artifact.path)?.ownership ??
                              (artifact.relationship === "ignored" ? "ignored" : artifact.relationship.startsWith("library-") ? "library" : "repository")}
                            disabled={policyPath === artifact.path || artifact.relationship === "blocked"}
                            onChange={(event) => void changeArtifactPolicy(
                              artifact,
                              event.target.value as "repository" | "library" | "ignored"
                            )}
                          >
                            <option value="repository">Repository owned</option>
                            {artifact.libraryAssetId ? <option value="library">Use Library baseline</option> : null}
                            <option value="ignored">Ignore</option>
                          </select>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="p-6 text-sm text-muted-foreground">
                      {inventory.activeJob ? "The first inventory is being prepared." : "No supported harness assets were detected."}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/10 px-5 py-4">
                    <p className="text-xs text-muted-foreground">
                      Read-only tracking requires no workflow and no repository secret.
                    </p>
                    {inventory.connection.permissionMode === "write" && inventory.latestSnapshot ? (
                      bootstrapProposal?.status === "open" && bootstrapProposal.pullUrl ? (
                        <a
                          href={bootstrapProposal.pullUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-9 items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium hover:bg-accent"
                        >
                          <GitPullRequest className="h-4 w-4" />
                          Pull request #{bootstrapProposal.pullNumber}
                        </a>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={isCreatingProposal}
                          onClick={() => void previewBootstrapProposal()}
                        >
                          {isCreatingProposal ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileJson2 className="h-4 w-4" />}
                          Preview managed config PR
                        </Button>
                      )
                    ) : null}
                  </div>
                  {inventory.jobs.length > 0 ? (
                    <Collapsible
                      open={scanHistoryOpen}
                      onOpenChange={setScanHistoryOpen}
                      className="border-t"
                    >
                      <CollapsibleTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-auto w-full justify-between rounded-none px-5 py-4 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                        >
                          <span>Recent scans · {inventory.jobs.length}</span>
                          <ChevronDown
                            className={cn("h-4 w-4 transition-transform", scanHistoryOpen && "rotate-180")}
                            aria-hidden="true"
                          />
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="space-y-2 border-t px-5 py-4">
                          {inventory.jobs.slice(0, 5).map((job) => (
                            <div key={job.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                              <span>{job.trigger} · {formatTime(job.completedAt ?? job.startedAt ?? job.createdAt)}</span>
                              <Badge
                                variant="outline"
                                className={cn(
                                  job.status === "succeeded" && "border-emerald-300 text-emerald-800",
                                  job.status === "failed" && "border-red-300 text-red-700"
                                )}
                              >
                                {job.status}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  ) : null}
                </CardContent>
              </Card>
                ) : (
                  <Card className="shadow-sm">
                    <CardContent className="flex min-h-56 flex-col items-center justify-center p-8 text-center">
                      <ScanSearch className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
                      <p className="mt-4 text-sm font-medium">Repository inventory is not available yet</p>
                      <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">
                        Connect this Project through the GitHub App to scan and classify repository assets.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        className="mt-4"
                        onClick={() => setProjectDetailTab("settings")}
                      >
                        Open settings
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="skills" className="mt-4 space-y-4">

            <TooltipProvider delayDuration={250}>
              <Card className="shadow-sm">
                <CardHeader className="border-b">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <PackagePlus className="h-4 w-4 text-blue-700" aria-hidden="true" />
                        Project Skills
                      </CardTitle>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Search and manage the Skills included in this Project.
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <div className="relative min-w-0 sm:w-64">
                        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        <Input
                          value={projectSkillSearch}
                          onChange={(event) => setProjectSkillSearch(event.target.value)}
                          className="pl-9"
                          placeholder="Search Project Skills"
                        />
                      </div>
                      {activeSkillProposal?.status === "open" && activeSkillProposal.pullUrl ? (
                        <a
                          href={activeSkillProposal.pullUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md border bg-background px-3 text-sm font-medium hover:bg-accent"
                        >
                          <GitPullRequest className="h-4 w-4" aria-hidden="true" />
                          PR #{activeSkillProposal.pullNumber}
                        </a>
                      ) : activeSkillProposal?.status === "preview" ? (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setProposal(activeSkillProposal);
                            setProposalOpen(true);
                          }}
                        >
                          <FileDiff className="h-4 w-4" aria-hidden="true" />
                          Review pending change
                        </Button>
                      ) : (
                        <DisabledControlTooltip
                          label="Add Skills from Library"
                          reason={projectSkillMutationDisabledReason}
                        >
                          <Button
                            type="button"
                            disabled={Boolean(projectSkillMutationDisabledReason)}
                            onClick={() => void openLibrarySkillPicker()}
                          >
                            <Plus className="h-4 w-4" aria-hidden="true" />
                            Add from Library
                          </Button>
                        </DisabledControlTooltip>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {filteredProjectSkills.length ? (
                    <div className="max-h-[56vh] divide-y overflow-y-auto">
                      {filteredProjectSkills.map((binding) => (
                        <ProjectSkillRow
                          key={binding.id}
                          binding={binding}
                          onReview={() => void openSkillDiff(binding)}
                          onRemove={() => confirmRemoveSkill(binding)}
                          removeDisabledReason={binding.path === "."
                            ? "Repository-root Skills cannot be removed through Harhub."
                            : projectSkillMutationDisabledReason}
                        />
                      ))}
                    </div>
                  ) : projectSkills.length ? (
                    <p className="p-6 text-sm text-muted-foreground">
                      No Project Skills match “{projectSkillSearch}”.
                    </p>
                  ) : (
                    <p className="p-6 text-sm text-muted-foreground">
                      No Skills are present in the latest Project state.
                    </p>
                  )}
                </CardContent>
              </Card>
            </TooltipProvider>

                {otherBindings.length ? (
                  <Card className="shadow-sm">
                    <CardHeader className="border-b">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <GitBranch className="h-4 w-4 text-blue-700" aria-hidden="true" />
                        Other harness bindings
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="max-h-80 divide-y overflow-y-auto">
                    {otherBindings.map((binding) => (
                      <BindingRow
                        key={binding.id}
                        binding={binding}
                        onReview={() => void openSkillDiff(binding)}
                      />
                    ))}
                      </div>
                    </CardContent>
                  </Card>
                ) : null}
              </TabsContent>

              <TabsContent value="settings" className="mt-4">
                <Card className="shadow-sm">
              <CardHeader className="border-b">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck className="h-4 w-4 text-blue-700" aria-hidden="true" />
                  Repository connection
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
                ) : inventory?.connection?.mode === "github-app" ? (
                  <div className="space-y-3">
                    <p className="text-sm leading-6 text-muted-foreground">
                      Harhub tracks this repository through the GitHub App. No repository secret is required.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">
                        {inventory.connection.status === "active" ? "Connected" : inventory.connection.status}
                      </Badge>
                      <Badge variant="outline">
                        {inventory.connection.permissionMode === "write" ? "Managed changes" : "Read only"}
                      </Badge>
                      <Badge variant="outline">{inventory.connection.defaultBranch}</Badge>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm leading-6 text-muted-foreground">
                    Repository synchronization is handled by the generated GitHub Actions workflow.
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
                {project.repository && (
                  inventory?.connection?.mode !== "github-app" ||
                  inventory.connection.status !== "active"
                ) ? (
                  <div className="flex flex-wrap gap-2">
                  {project.repository && inventory?.connection?.mode !== "github-app" ? (
                    <Button
                      type="button"
                      disabled={project.status === "archived"}
                      onClick={() => void openRepositoryImport(true)}
                    >
                      <Github className="h-4 w-4" />
                      Switch to GitHub App
                    </Button>
                  ) : null}
                  {project.repository && inventory?.connection?.mode !== "github-app" ? (
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
                    {inventory?.connection?.mode === "github-app" && inventory.connection.status !== "active" ? (
                      <Button
                        type="button"
                        disabled={project.status === "archived"}
                        onClick={() => void openRepositoryImport(true)}
                      >
                        <Github className="h-4 w-4" />
                        Reconnect GitHub App
                      </Button>
                    ) : null}
                  </div>
                ) : null}
                <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium">Project lifecycle</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Archiving makes this Project read-only while preserving its history.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0"
                    disabled={project.status === "archived"}
                    onClick={() => setArchiveOpen(true)}
                  >
                    <Archive className="h-4 w-4" aria-hidden="true" />
                    Archive project
                  </Button>
                </div>
              </CardContent>
            </Card>
              </TabsContent>
            </Tabs>
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

        <Dialog open={librarySkillOpen} onOpenChange={setLibrarySkillOpen}>
          <DialogContent className="flex max-h-[80vh] max-w-3xl flex-col overflow-hidden">
            <DialogHeader>
              <DialogTitle>Add Skills from the Library</DialogTitle>
              <DialogDescription>
                Select one or more workspace Skills to add to this Project.
              </DialogDescription>
            </DialogHeader>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Input
                value={librarySkillSearch}
                onChange={(event) => setLibrarySkillSearch(event.target.value)}
                className="pl-9"
                placeholder="Search Library Skills"
              />
            </div>
            <div className="min-h-0 flex-1 overflow-auto rounded-lg border">
              {isLoadingLibrarySkills ? (
                <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Loading Library Skills…
                </div>
              ) : filteredLibrarySkills.length ? (
                <div className="divide-y">
                  {filteredLibrarySkills.map((asset) => (
                    <label key={asset.id} className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-muted/30">
                      <Checkbox
                        checked={selectedLibrarySkillIds.includes(asset.id)}
                        disabled={
                          selectedLibrarySkillIds.length >= 20 &&
                          !selectedLibrarySkillIds.includes(asset.id)
                        }
                        onCheckedChange={(checked) => toggleLibrarySkill(asset.id, checked === true)}
                        className="mt-0.5"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{asset.displayName}</span>
                          <Badge variant="outline">v{asset.version ?? 1}</Badge>
                        </span>
                        <span className="mt-1 block line-clamp-2 text-xs leading-5 text-muted-foreground">
                          {asset.description}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  {librarySkills.length
                    ? "No available Library Skills match this search."
                    : "Every available Library Skill is already linked to this Project."}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {selectedLibrarySkillIds.length}/20 selected
              </p>
              <Button
                type="button"
                disabled={selectedLibrarySkillIds.length === 0 || isCreatingProposal}
                onClick={() => void previewAddLibrarySkills()}
              >
                {isCreatingProposal ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitPullRequest className="h-4 w-4" />}
                Review addition
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <AlertDialog open={removeSkillOpen} onOpenChange={setRemoveSkillOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove {removeSkillBinding?.name} from this Project?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes the Skill package from the Project through a GitHub pull request.
                The workspace Library Skill, if any, is not deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isCreatingProposal}>Cancel</AlertDialogCancel>
              <AlertDialogAction disabled={isCreatingProposal} onClick={() => void previewRemoveSkill()}>
                {isCreatingProposal ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Review removal
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog open={proposalOpen} onOpenChange={setProposalOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>{proposalDialogTitle(proposal)}</DialogTitle>
              <DialogDescription>
                Review the exact repository changes. Nothing is written until you open the pull request, and the default branch changes only after merge.
              </DialogDescription>
            </DialogHeader>
            {proposal?.kind === "bootstrap" ? proposal.files.map((file) => (
              <div key={file.path} className="overflow-hidden rounded-lg border">
                <div className="border-b bg-muted/30 px-4 py-2 font-mono text-xs font-medium">{file.path}</div>
                <pre className="max-h-[48vh] overflow-auto whitespace-pre-wrap break-words bg-background p-4 text-xs leading-5">{file.content}</pre>
              </div>
            )) : (
              <div className="max-h-[52vh] overflow-auto rounded-lg border">
                <div className="divide-y">
                  {proposal?.files.map((file) => (
                    <div key={file.path} className="flex items-center gap-3 px-4 py-3">
                      <Badge
                        variant="outline"
                        className={cn(
                          "w-16 shrink-0 justify-center",
                          file.status === "added" && "border-emerald-300 text-emerald-800",
                          file.status === "deleted" && "border-red-300 text-red-700"
                        )}
                      >
                        {file.status}
                      </Badge>
                      <span className="min-w-0 flex-1 break-all font-mono text-xs">{file.path}</span>
                      {file.encoding === "base64" ? <Badge variant="secondary">binary</Badge> : null}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              {proposal?.status === "open" && proposal.pullUrl ? (
                <a href={proposal.pullUrl} target="_blank" rel="noreferrer" className="text-sm font-medium text-blue-700 hover:underline">
                  Open pull request #{proposal.pullNumber}
                </a>
              ) : <span />}
              <Button
                type="button"
                disabled={!proposal || proposal.status === "open" || proposal.status === "creating" || isOpeningProposal}
                onClick={() => void openProposalPullRequest()}
              >
                {isOpeningProposal ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitPullRequest className="h-4 w-4" />}
                {proposal?.status === "open" ? "Pull request opened" : "Open pull request"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <RepositoryImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          connectingExistingProject={connectingExistingProject}
          project={project}
          githubStatus={githubStatus}
          installations={installations}
          selectedInstallationId={selectedInstallationId}
          repositories={repositories}
          repositorySearch={repositorySearch}
          isLoading={isLoadingGitHub}
          importingRepositoryId={importingRepositoryId}
          onInstall={() => void installGitHubApp()}
          onSelectInstallation={(id) => void selectInstallation(id)}
          onSearch={setRepositorySearch}
          onImport={(id) => void importRepository(id)}
        />
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
          <Button type="button" variant="outline" onClick={onOpenForge}>
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            Forge a project
          </Button>
          <Button type="button" onClick={() => void openRepositoryImport()}>
            <Github className="h-4 w-4" aria-hidden="true" />
            Import repository
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
              Import an existing GitHub repository for a read-only harness inventory, or create a
              new framework with Forge.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Button type="button" onClick={() => void openRepositoryImport()}>
                <Github className="h-4 w-4" />
                Import repository
              </Button>
              <Button type="button" variant="outline" onClick={onOpenForge}>Open Forge</Button>
            </div>
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

      <RepositoryImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        connectingExistingProject={connectingExistingProject}
        githubStatus={githubStatus}
        installations={installations}
        selectedInstallationId={selectedInstallationId}
        repositories={repositories}
        repositorySearch={repositorySearch}
        isLoading={isLoadingGitHub}
        importingRepositoryId={importingRepositoryId}
        onInstall={() => void installGitHubApp()}
        onSelectInstallation={(id) => void selectInstallation(id)}
        onSearch={setRepositorySearch}
        onImport={(id) => void importRepository(id)}
      />
    </section>
  );
}

function RepositoryImportDialog({
  open,
  onOpenChange,
  connectingExistingProject,
  project,
  githubStatus,
  installations,
  selectedInstallationId,
  repositories,
  repositorySearch,
  isLoading,
  importingRepositoryId,
  onInstall,
  onSelectInstallation,
  onSearch,
  onImport
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connectingExistingProject: boolean;
  project?: HarhubProject;
  githubStatus?: GitHubIntegrationStatus;
  installations: GitHubInstallation[];
  selectedInstallationId: string;
  repositories: GitHubRepositorySummary[];
  repositorySearch: string;
  isLoading: boolean;
  importingRepositoryId?: string;
  onInstall: () => void;
  onSelectInstallation: (id: string) => void;
  onSearch: (value: string) => void;
  onImport: (id: string) => void;
}) {
  const expectedRepository = project?.repository
    ? `${project.repository.owner}/${project.repository.name}`.toLowerCase()
    : undefined;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[86vh] max-w-3xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>
            {connectingExistingProject ? "Switch this Project to GitHub App" : "Import an existing repository"}
          </DialogTitle>
          <DialogDescription>
            {connectingExistingProject
              ? "Select the repository already tracked by this Project. The legacy sync token will be revoked after connection."
              : "Harhub scans only supported harness files. It does not clone or retain the rest of the codebase."}
          </DialogDescription>
        </DialogHeader>
        {isLoading && !githubStatus ? (
          <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading GitHub connections…
          </div>
        ) : null}
        {githubStatus && !githubStatus.configured ? (
          <div className="rounded-lg border bg-muted/20 p-5">
            <p className="font-medium">GitHub App is not configured on this Harhub instance</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Configure the App ID, slug, OAuth credentials, private key, and webhook secret on the server first.
            </p>
          </div>
        ) : null}
        {githubStatus?.configured && installations.length === 0 ? (
          <div className="rounded-lg border p-5">
            <p className="font-medium">Connect the Harhub GitHub App</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Select only the repositories this workspace should be allowed to inventory.
            </p>
            <Button className="mt-4" disabled={isLoading} onClick={onInstall}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Github className="h-4 w-4" />}
              Install GitHub App
            </Button>
          </div>
        ) : null}
        {installations.length > 0 ? (
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              {installations.map((installation) => (
                <Button
                  key={installation.id}
                  type="button"
                  size="sm"
                  variant={installation.id === selectedInstallationId ? "default" : "outline"}
                  onClick={() => onSelectInstallation(installation.id)}
                >
                  {installation.accountLogin}
                </Button>
              ))}
              <Button type="button" size="sm" variant="ghost" onClick={onInstall}>Add installation</Button>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={repositorySearch}
                className="pl-9"
                placeholder="Search repositories"
                onChange={(event) => onSearch(event.target.value)}
              />
            </div>
            <div className="min-h-0 flex-1 divide-y overflow-auto rounded-lg border">
              {repositories
                .filter((candidate) => candidate.fullName.toLowerCase().includes(repositorySearch.trim().toLowerCase()))
                .map((candidate) => {
                  const mismatch = Boolean(connectingExistingProject && expectedRepository && candidate.fullName.toLowerCase() !== expectedRepository);
                  return (
                    <div key={candidate.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{candidate.fullName}</p>
                          {candidate.private ? <Badge variant="outline">Private</Badge> : null}
                          {candidate.archived ? <Badge variant="secondary">Archived</Badge> : null}
                        </div>
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                          {mismatch
                            ? "This Project tracks a different repository."
                            : candidate.description || `Default branch: ${candidate.defaultBranch}`}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        disabled={candidate.archived || mismatch || Boolean(importingRepositoryId)}
                        onClick={() => onImport(candidate.id)}
                      >
                        {importingRepositoryId === candidate.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {connectingExistingProject ? "Connect" : "Import"}
                      </Button>
                    </div>
                  );
                })}
              {!isLoading && repositories.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">No accessible repositories.</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
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

function ProjectSkillRow({
  binding,
  onReview,
  onRemove,
  removeDisabledReason
}: {
  binding: ProjectBinding;
  onReview: () => void;
  onRemove: () => void;
  removeDisabledReason?: string;
}) {
  const reviewable = Boolean(binding.fork) &&
    (binding.status === "added" || binding.status === "modified");
  return (
    <div className="grid gap-3 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium">{binding.name}</p>
          <Badge variant="outline" className="text-[10px]">
            {binding.assetId ? "Library linked" : "Repository owned"}
          </Badge>
        </div>
        <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{binding.path}</p>
      </div>
      <div className="flex items-center justify-self-end gap-1.5">
        <BindingStatusBadge status={binding.status} />
        {reviewable ? (
          <ProjectSkillIconAction label="Review changes" onClick={onReview}>
            <FileDiff className="h-4 w-4" aria-hidden="true" />
          </ProjectSkillIconAction>
        ) : null}
        <ProjectSkillIconAction
          label="Remove Skill"
          disabledReason={removeDisabledReason}
          className="hover:text-destructive"
          onClick={onRemove}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </ProjectSkillIconAction>
      </div>
    </div>
  );
}

function ProjectSkillIconAction({
  label,
  disabledReason,
  className,
  onClick,
  children
}: {
  label: string;
  disabledReason?: string;
  className?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  const button = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("h-8 w-8 text-muted-foreground", className)}
      aria-label={label}
      disabled={Boolean(disabledReason)}
      onClick={onClick}
    >
      {children}
    </Button>
  );
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {disabledReason ? (
          <span
            className="inline-flex"
            tabIndex={0}
            aria-label={`${label} unavailable: ${disabledReason}`}
          >
            {button}
          </span>
        ) : button}
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-72 text-center">
        {disabledReason ? `${label} unavailable: ${disabledReason}` : label}
      </TooltipContent>
    </Tooltip>
  );
}

function DisabledControlTooltip({
  label,
  reason,
  children
}: {
  label: string;
  reason?: string;
  children: ReactNode;
}) {
  if (!reason) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="inline-flex"
          tabIndex={0}
          aria-label={`${label} unavailable: ${reason}`}
        >
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-72 text-center">
        {reason}
      </TooltipContent>
    </Tooltip>
  );
}

function getProjectSkillManagementDisabledReason(
  project?: HarhubProject,
  inventory?: ProjectInventoryResponse
): string | undefined {
  if (!project) return "Open a Project before managing its Skills.";
  if (project.status === "archived") return "Archived Projects cannot be changed.";
  if (!inventory?.connection || inventory.connection.mode !== "github-app") {
    return "Connect this Project with the GitHub App to manage its Skills.";
  }
  if (inventory.connection.status === "permission-lost") {
    return "Restore the GitHub App permissions before changing Project Skills.";
  }
  if (inventory.connection.status === "disconnected") {
    return "Reconnect the GitHub App before changing Project Skills.";
  }
  if (inventory.connection.permissionMode !== "write") {
    return "Grant managed change permissions before changing Project Skills.";
  }
  if (!inventory.latestSnapshot) {
    return "Wait for the first repository scan before changing Project Skills.";
  }
  return undefined;
}

function proposalDialogTitle(proposal?: ProjectChangeProposal): string {
  if (proposal?.kind === "add-library-skills") return "Add Library Skills";
  if (proposal?.kind === "remove-skill") return "Remove Project Skill";
  return "Managed repository configuration";
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

function InventoryRelationshipBadge({
  relationship
}: {
  relationship: ProjectInventoryArtifact["relationship"];
}) {
  const label = relationship === "library-synced"
    ? "Library synced"
    : relationship === "library-modified"
      ? "Library changed"
      : relationship === "repository-owned"
        ? "Repository owned"
        : relationship === "review-required"
          ? "Review required"
          : relationship === "blocked"
            ? "Blocked"
            : "Ignored";
  return (
    <Badge
      variant="outline"
      className={cn(
        "w-fit",
        relationship === "library-synced" && "border-emerald-300 text-emerald-800",
        relationship === "library-modified" && "border-amber-300 text-amber-800",
        relationship === "blocked" && "border-red-300 text-red-700"
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
      <code className="min-w-0 flex-1 whitespace-pre-wrap break-words px-1.5 text-foreground [overflow-wrap:anywhere]">
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
    <div className="min-w-28">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold" title={value}>{value}</p>
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
