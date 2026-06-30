import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Eye,
  FileArchive,
  FileText,
  Folder,
  FolderOpen,
  HardDriveUpload,
  KeyRound,
  Loader2,
  PackageOpen,
  Plus,
  Save,
  Search,
  Tag,
  Trash2,
  Upload,
  UserPlus,
  type LucideIcon
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import type {
  AccountProfile,
  AssetFileTreeNode,
  AssetPreview,
  AssetRecord,
  StorageStatus,
  ValidationIssue,
  WorkspaceMember,
  WorkspaceMembership,
  WorkspaceRecord,
  WorkspaceRole
} from "../../types";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "./components/ui/card";
import { Input } from "./components/ui/input";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger
} from "./components/ui/sidebar";
import { AppSidebar } from "./components/app-sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from "./components/ui/breadcrumb";
import { Separator } from "./components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "./components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "./components/ui/popover";
import {
  addWorkspaceMember,
  changePassword,
  createWorkspace,
  deleteWorkspaceAsset,
  getSession,
  getWorkspaceAssetPreview,
  getWorkspaceAssets,
  getWorkspaceMembers,
  login,
  logout,
  removeWorkspaceMember,
  signUp,
  updateAccount,
  updateWorkspaceAsset,
  updateWorkspaceMember,
  updateWorkspace,
  uploadWorkspaceSkillZip,
  type AuthResponse,
  type SessionResponse
} from "./lib/api";
import { cn } from "./lib/utils";

const TOKEN_KEY = "harhub.token";
const WORKSPACE_KEY = "harhub.workspace";
const roleOptions: WorkspaceRole[] = ["owner", "admin", "member", "viewer"];

type View = "assets" | "asset-detail" | "workspace" | "account";

interface AppRoute {
  view: View;
  assetQuery?: string;
}

export function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) ?? "");
  const [session, setSession] = useState<SessionResponse | undefined>();
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(
    () => localStorage.getItem(WORKSPACE_KEY) ?? ""
  );
  const [route, setRoute] = useState<AppRoute>(() => readRouteFromLocation());
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [storageStatus, setStorageStatus] = useState<StorageStatus | undefined>();
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const view = route.view;

  useEffect(() => {
    if (!token) {
      setIsLoading(false);
      return;
    }

    void loadSession(token);
  }, [token]);

  useEffect(() => {
    const nextRoute = readRouteFromLocation();
    replaceBrowserRoute(nextRoute);
    setRoute(nextRoute);

    function handlePopState() {
      setRoute(readRouteFromLocation());
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const activeWorkspace = useMemo(() => {
    if (!session) return undefined;
    return (
      session.workspaces.find((workspace) => workspace.id === activeWorkspaceId) ??
      session.workspaces[0]
    );
  }, [activeWorkspaceId, session]);
  const routedAsset = useMemo(
    () => route.assetQuery ? findUiAsset(assets, route.assetQuery) : undefined,
    [assets, route.assetQuery]
  );
  const selectedAsset = useMemo(
    () => routedAsset ?? assets.find((asset) => asset.id === selectedId),
    [assets, routedAsset, selectedId]
  );

  useEffect(() => {
    if (!activeWorkspace || !token) return;
    localStorage.setItem(WORKSPACE_KEY, activeWorkspace.id);
    void refreshAssets(activeWorkspace.id);
  }, [activeWorkspace?.id, token]);

  useEffect(() => {
    if (routedAsset && routedAsset.id !== selectedId) {
      setSelectedId(routedAsset.id);
    }
  }, [routedAsset?.id, selectedId]);

  function navigate(nextRoute: AppRoute, options: { replace?: boolean } = {}) {
    const normalizedRoute = normalizeRoute(nextRoute);
    const path = pathForRoute(normalizedRoute);

    if (options.replace) {
      window.history.replaceState(null, "", path);
    } else if (window.location.pathname !== path) {
      window.history.pushState(null, "", path);
    }

    setRoute(normalizedRoute);
  }

  async function loadSession(nextToken: string) {
    setIsLoading(true);
    setError(undefined);
    try {
      const nextSession = await getSession(nextToken);
      setSession(nextSession);
      const preferredWorkspace =
        nextSession.workspaces.find((workspace) => workspace.id === activeWorkspaceId) ??
        nextSession.workspaces[0];
      setActiveWorkspaceId(preferredWorkspace?.id ?? "");
    } catch (caught) {
      localStorage.removeItem(TOKEN_KEY);
      setToken("");
      setSession(undefined);
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsLoading(false);
    }
  }

  async function refreshAssets(workspaceId = activeWorkspace?.id) {
    if (!token || !workspaceId) return;
    setIsLoading(true);
    setError(undefined);
    try {
      const result = await getWorkspaceAssets(token, workspaceId);
      setAssets(result.assets);
      setStorageStatus(result.storage);
      const storedAssets = result.assets.filter((asset) => asset.storage);
      const routeAsset = route.assetQuery ? findUiAsset(storedAssets, route.assetQuery) : undefined;
      setSelectedId((current) =>
        routeAsset?.id ??
        (storedAssets.some((asset) => asset.id === current) ? current : storedAssets[0]?.id)
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsLoading(false);
    }
  }

  function handleAuth(response: AuthResponse) {
    localStorage.setItem(TOKEN_KEY, response.token);
    setToken(response.token);
    setSession(response);
    const workspace = response.workspaces[0];
    if (workspace) {
      setActiveWorkspaceId(workspace.id);
      localStorage.setItem(WORKSPACE_KEY, workspace.id);
    }
    navigate({ view: "assets" }, { replace: true });
  }

  async function handleLogout() {
    if (token) await logout(token).catch(() => undefined);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(WORKSPACE_KEY);
    setToken("");
    setSession(undefined);
    setAssets([]);
    setIssues([]);
    navigate({ view: "assets" }, { replace: true });
  }

  async function applySession(nextSession: SessionResponse, workspace?: WorkspaceRecord) {
    setSession(nextSession);
    if (workspace) {
      setActiveWorkspaceId(workspace.id);
      localStorage.setItem(WORKSPACE_KEY, workspace.id);
    }
    await refreshAssets(workspace?.id ?? activeWorkspace?.id);
  }

  if (!token || !session) {
    return (
      <AuthScreen
        isLoading={isLoading}
        error={error}
        onAuthenticated={handleAuth}
      />
    );
  }

  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <AppSidebar
        session={session}
        activeWorkspace={activeWorkspace}
        view={view}
        onNavigate={navigate}
        onWorkspaceChange={(workspaceId) => {
          setActiveWorkspaceId(workspaceId);
          navigate({ view: "assets" });
        }}
        onLogout={handleLogout}
      />
      <SidebarInset className="h-svh min-w-0 overflow-hidden">
        <header className="flex h-16 min-w-0 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <Breadcrumb className="min-w-0">
            <BreadcrumbList>
              <BreadcrumbItem>
                <span className="block max-w-[40vw] truncate font-medium text-foreground">
                  {activeWorkspace?.name ?? "Workspace"}
                </span>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{viewTitle(view)}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-4 sm:p-6 lg:p-8">
          {error ? (
            <div className="mb-4 shrink-0 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}
          {view === "assets" && activeWorkspace ? (
            <AssetsView
              workspace={activeWorkspace}
              token={token}
              assets={assets}
              storage={storageStatus}
              issues={issues}
              query={query}
              tagFilter={tagFilter}
              isLoading={isLoading}
              selectedId={selectedId}
              onQueryChange={setQuery}
              onTagFilterChange={setTagFilter}
              onSelect={setSelectedId}
              onOpenDetail={(assetId) => {
                const asset = findUiAsset(assets, assetId);
                if (!asset) return;
                setSelectedId(asset.id);
                navigate({ view: "asset-detail", assetQuery: routeQueryForAsset(asset) });
              }}
              onRefresh={refreshAssets}
            />
          ) : null}
          {view === "asset-detail" && activeWorkspace ? (
            <SkillDetailView
              workspace={activeWorkspace}
              token={token}
              asset={selectedAsset}
              issues={issues}
              onBack={() => navigate({ view: "assets" })}
              onChanged={refreshAssets}
            />
          ) : null}
          {view === "workspace" && activeWorkspace ? (
            <WorkspaceView
              token={token}
              session={session}
              workspace={activeWorkspace}
              onSessionChange={applySession}
            />
          ) : null}
          {view === "account" ? (
            <AccountView
              token={token}
              account={session.account}
              memberships={session.memberships}
              onSessionChange={setSession}
              onPasswordChanged={handleLogout}
            />
          ) : null}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

function AuthScreen({
  isLoading,
  error,
  onAuthenticated
}: {
  isLoading: boolean;
  error?: string;
  onAuthenticated: (response: AuthResponse) => void;
}) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("admin@harhub.local");
  const [name, setName] = useState("Harhub Admin");
  const [password, setPassword] = useState("harhub");
  const [workspaceName, setWorkspaceName] = useState("Engineering Platform");
  const [message, setMessage] = useState<string | undefined>(error);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setMessage(error);
  }, [error]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage(undefined);
    try {
      const response =
        mode === "login"
          ? await login({ email, password })
          : await signUp({ email, name, password, workspaceName });
      onAuthenticated(response);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Harhub</CardTitle>
          <CardDescription>Sign in to your workspace.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={mode} onValueChange={(value) => setMode(value as "login" | "signup")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Create account</TabsTrigger>
            </TabsList>
            <TabsContent value={mode}>
              <form className="grid gap-4" onSubmit={submit}>
                {mode === "signup" ? (
                  <label className="grid gap-1.5 text-sm font-medium">
                    Name
                    <Input value={name} onChange={(event) => setName(event.target.value)} />
                  </label>
                ) : null}
                <label className="grid gap-1.5 text-sm font-medium">
                  Email
                  <Input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-medium">
                  Password
                  <Input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                </label>
                {mode === "signup" ? (
                  <label className="grid gap-1.5 text-sm font-medium">
                    Workspace
                    <Input
                      value={workspaceName}
                      onChange={(event) => setWorkspaceName(event.target.value)}
                    />
                  </label>
                ) : null}
                {message ? <p className="text-sm text-destructive">{message}</p> : null}
                <Button type="submit" disabled={isLoading || isSubmitting}>
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <KeyRound className="h-4 w-4" aria-hidden="true" />
                  )}
                  {mode === "login" ? "Sign in" : "Create account"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </main>
  );
}

function AssetsView({
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

function SkillSummaryPill({
  icon: Icon,
  label,
  value
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 max-w-full items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-xs">
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 truncate text-muted-foreground">{label}</span>
      <span className="shrink-0 font-medium">{value}</span>
    </div>
  );
}

function SkillListTable({
  assets,
  selectedId,
  isLoading,
  onSelect,
  onOpenDetail
}: {
  assets: AssetRecord[];
  selectedId?: string;
  isLoading: boolean;
  onSelect: (id: string) => void;
  onOpenDetail: (id: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="flex min-h-60 min-w-0 items-center justify-center rounded-lg border bg-card text-sm text-muted-foreground xl:h-full xl:min-h-0">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
        Loading skills
      </div>
    );
  }

  if (assets.length === 0) {
    return (
      <div className="flex min-h-60 min-w-0 flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-card text-sm text-muted-foreground xl:h-full xl:min-h-0">
        <PackageOpen className="h-7 w-7" aria-hidden="true" />
        No uploaded skill zips matched the current filters.
      </div>
    );
  }

  return (
    <div className="min-h-[420px] w-full min-w-0 max-w-full overflow-hidden rounded-lg border bg-card xl:h-full xl:min-h-0">
      <div className="h-full w-full min-w-0 overflow-y-auto overflow-x-hidden overscroll-y-contain">
        <div className="sticky top-0 z-10 hidden min-w-0 grid-cols-[minmax(260px,1.5fr)_minmax(140px,.8fr)_minmax(140px,.7fr)_minmax(150px,.8fr)_108px] gap-3 border-b bg-muted/95 px-4 py-3 text-left text-xs uppercase text-muted-foreground backdrop-blur min-[1800px]:grid">
          <div className="font-medium">Skill</div>
          <div className="font-medium">Package / Owner</div>
          <div className="font-medium">Contents</div>
          <div className="font-medium">Archive</div>
          <div className="font-medium">Status</div>
        </div>
        <div className="min-w-0">
          {assets.map((asset) => {
            const zipEntries = metadataNumber(asset, "zipEntries");
            const scriptCount = metadataNumber(asset, "scripts");
            const referenceCount = metadataNumber(asset, "references");
            const assetCount = metadataNumber(asset, "assets");
            const uploadedAt = asset.storage?.uploadedAt ?? asset.updatedAt;
            const archiveName = asset.storage?.originalName ?? "-";
            const size = asset.storage ? formatBytes(asset.storage.size) : "-";

            return (
              <div
                key={asset.id}
                role="button"
                tabIndex={0}
                className={cn(
                  "grid min-w-0 cursor-pointer grid-cols-[minmax(0,1fr)_auto] gap-3 border-b px-4 py-4 text-sm transition-colors last:border-0 hover:bg-accent/45 min-[1800px]:grid-cols-[minmax(260px,1.5fr)_minmax(140px,.8fr)_minmax(140px,.7fr)_minmax(150px,.8fr)_108px]",
                  selectedId === asset.id && "bg-blue-50/80"
                )}
                onClick={() => onSelect(asset.id)}
                onDoubleClick={() => onOpenDetail(asset.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onOpenDetail(asset.id);
                }}
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-600 text-white">
                      <FileArchive className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{asset.displayName}</div>
                      <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                        {asset.description || asset.name}
                      </div>
                      <div className="mt-2 flex min-w-0 flex-wrap gap-1.5">
                        {asset.tags.slice(0, 4).map((tag) => (
                          <Badge key={tag} variant="outline" className="h-5 max-w-full rounded-md px-1.5 text-[11px]">
                            <span className="truncate">{tag}</span>
                          </Badge>
                        ))}
                        {asset.tags.length > 4 ? (
                          <Badge variant="outline" className="h-5 rounded-md px-1.5 text-[11px]">
                            +{asset.tags.length - 4}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="mt-3 grid min-w-0 gap-1 text-xs text-muted-foreground min-[1800px]:hidden">
                        <div className="truncate">
                          {asset.packageName ?? "-"} · {asset.owner ?? "Unassigned"}
                        </div>
                        <div className="truncate">
                          {zipEntries || "-"} file(s) · {scriptCount} scripts · {referenceCount} refs · {assetCount} assets
                        </div>
                        <div className="truncate">
                          {archiveName} · {size} · {formatDate(uploadedAt)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="hidden min-w-0 min-[1800px]:block">
                  <div className="truncate font-medium">{asset.packageName ?? "-"}</div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">
                    {asset.owner ?? "Unassigned"}
                  </div>
                </div>
                <div className="hidden min-w-0 min-[1800px]:block">
                  <div className="grid gap-1 text-xs text-muted-foreground">
                    <span>{zipEntries || "-"} file(s)</span>
                    <span className="truncate">{scriptCount} scripts · {referenceCount} refs · {assetCount} assets</span>
                    <span className="truncate">{metadataText(asset, "skillEntry") || "SKILL.md"}</span>
                  </div>
                </div>
                <div className="hidden min-w-0 min-[1800px]:block">
                  <div className="truncate font-medium">{archiveName}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{size}</div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">{formatDate(uploadedAt)}</div>
                </div>
                <div className="flex min-w-0 flex-col items-end gap-2 min-[1800px]:items-start">
                  <Badge variant="secondary" className={healthBadgeClass(asset.health)}>
                    {asset.health}
                  </Badge>
                  <Badge variant="outline" className="hidden rounded-md sm:inline-flex min-[1800px]:hidden">
                    {asset.lifecycleState}
                  </Badge>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenDetail(asset.id);
                    }}
                  >
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="hidden sm:inline">Open</span>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SkillQuickPreview({
  asset,
  issues,
  onOpenDetail
}: {
  asset?: AssetRecord;
  issues: ValidationIssue[];
  onOpenDetail: (id: string) => void;
}) {
  if (!asset) {
    return (
      <aside className="flex min-h-72 min-w-0 items-center justify-center rounded-lg border border-dashed bg-card text-sm text-muted-foreground xl:h-full xl:min-h-0">
        Select a skill to preview.
      </aside>
    );
  }

  const assetIssues = issues.filter(
    (issue) => issue.assetId === asset.id || issue.skillId === asset.skill?.id
  );

  return (
    <aside className="min-h-72 min-w-0 overflow-auto rounded-lg border bg-card p-4 xl:h-full xl:min-h-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-600 text-white">
              <FileArchive className="h-4 w-4" aria-hidden="true" />
            </div>
            <h2 className="truncate text-lg font-semibold">{asset.displayName}</h2>
          </div>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {asset.description || "No description."}
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5">
        <Badge variant="secondary" className={healthBadgeClass(asset.health)}>
          {asset.health}
        </Badge>
        <Badge variant="outline">{asset.lifecycleState}</Badge>
        {asset.tags.slice(0, 6).map((tag) => (
          <Badge key={tag} variant="outline">
            {tag}
          </Badge>
        ))}
      </div>
      <div className="mt-5 grid gap-2 text-sm">
        <KeyValue label="Package" value={asset.packageName ?? "-"} />
        <KeyValue label="Owner" value={asset.owner ?? "-"} />
        <KeyValue label="Files" value={metadataNumber(asset, "zipEntries").toString()} />
        <KeyValue label="Scripts" value={metadataNumber(asset, "scripts").toString()} />
        <KeyValue label="References" value={metadataNumber(asset, "references").toString()} />
        <KeyValue label="Assets" value={metadataNumber(asset, "assets").toString()} />
        <KeyValue label="Archive" value={asset.storage?.originalName ?? "-"} />
        <KeyValue label="Size" value={asset.storage ? formatBytes(asset.storage.size) : "-"} />
        <KeyValue label="Uploaded" value={asset.storage ? formatDate(asset.storage.uploadedAt) : "-"} />
      </div>
      {assetIssues.length > 0 ? (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {assetIssues.length} validation issue(s)
        </div>
      ) : null}
      <Button className="mt-5 w-full" onClick={() => onOpenDetail(asset.id)}>
        <Eye className="h-4 w-4" aria-hidden="true" />
        Open details
      </Button>
    </aside>
  );
}

function SkillDetailView({
  workspace,
  token,
  asset,
  issues,
  onBack,
  onChanged
}: {
  workspace: WorkspaceRecord;
  token: string;
  asset?: AssetRecord;
  issues: ValidationIssue[];
  onBack: () => void;
  onChanged: () => Promise<void>;
}) {
  if (!asset) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden">
        <Button type="button" variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back
        </Button>
        <div className="flex min-h-0 flex-1 items-center justify-center rounded-lg border border-dashed bg-card text-sm text-muted-foreground">
          Select a skill from the list first.
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden">
      <div className="flex shrink-0 min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <Button type="button" variant="outline" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back
          </Button>
          <div className="mt-4 flex min-w-0 flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-semibold tracking-normal">{asset.displayName}</h1>
            <Badge variant="secondary" className={healthBadgeClass(asset.health)}>
              {asset.health}
            </Badge>
            <Badge variant="outline">{asset.lifecycleState}</Badge>
          </div>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">
            {asset.description || "No description."}
          </p>
        </div>
      </div>
      <div className="grid min-h-0 min-w-0 flex-1 gap-4 overflow-auto 2xl:grid-cols-[430px_minmax(0,1fr)] 2xl:overflow-hidden">
        <SkillMetadataPanel
          workspace={workspace}
          token={token}
          asset={asset}
          issues={issues}
          onChanged={onChanged}
          className="2xl:h-full"
        />
        <SkillFileExplorer workspace={workspace} token={token} asset={asset} />
      </div>
    </div>
  );
}

function SkillFileExplorer({
  workspace,
  token,
  asset
}: {
  workspace: WorkspaceRecord;
  token: string;
  asset: AssetRecord;
}) {
  const [selectedPath, setSelectedPath] = useState<string | undefined>();
  const [preview, setPreview] = useState<AssetPreview | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | undefined>();

  useEffect(() => {
    setSelectedPath(undefined);
    setPreview(undefined);
  }, [asset.id]);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setMessage(undefined);
    getWorkspaceAssetPreview(token, workspace.id, asset.id, selectedPath)
      .then((result) => {
        if (!isMounted) return;
        setPreview(result);
      })
      .catch((caught) => {
        if (!isMounted) return;
        setMessage(caught instanceof Error ? caught.message : String(caught));
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [asset.id, selectedPath, token, workspace.id]);

  const currentPath = selectedPath ?? preview?.selectedFile?.path;

  return (
    <section className="flex min-h-[620px] min-w-0 flex-col overflow-hidden rounded-lg border bg-card 2xl:h-full 2xl:min-h-0">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <h2 className="font-semibold">Files</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {preview ? `${preview.files.length} file(s)` : "Loading"}
          </p>
        </div>
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" /> : null}
      </div>
      {message ? (
        <div className="mx-4 mt-4 shrink-0 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {message}
        </div>
      ) : null}
      <div className="grid min-h-0 min-w-0 flex-1 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="flex min-h-0 min-w-0 flex-col border-b lg:border-b-0 lg:border-r">
          <div className="shrink-0 border-b px-3 py-2 text-xs font-medium uppercase text-muted-foreground">
            Directory
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-2">
            {preview?.tree.length ? (
              <FileTree nodes={preview.tree} selectedPath={currentPath} onSelect={setSelectedPath} />
            ) : (
              <div className="px-2 py-8 text-center text-sm text-muted-foreground">
                No files.
              </div>
            )}
          </div>
        </div>
        <FilePreviewPane file={preview?.selectedFile} />
      </div>
    </section>
  );
}

function FileTree({
  nodes,
  selectedPath,
  onSelect,
  depth = 0
}: {
  nodes: AssetFileTreeNode[];
  selectedPath?: string;
  onSelect: (path: string) => void;
  depth?: number;
}) {
  return (
    <div className="space-y-0.5">
      {nodes.map((node) => {
        const isFile = node.type === "file";
        const isSelected = selectedPath === node.path;
        return (
          <div key={node.path}>
            <button
              type="button"
              className={cn(
                "flex w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                isFile ? "hover:bg-accent" : "cursor-default text-muted-foreground",
                isSelected && "bg-blue-50 text-blue-950"
              )}
              style={{ paddingLeft: `${0.5 + depth * 0.75}rem` }}
              onClick={() => {
                if (isFile) onSelect(node.path);
              }}
            >
              {isFile ? (
                <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              ) : node.children?.length ? (
                <FolderOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <Folder className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              )}
              <span className="min-w-0 flex-1 truncate">{node.name}</span>
              {isFile ? (
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {formatBytes(node.size ?? 0)}
                </span>
              ) : null}
            </button>
            {node.children?.length ? (
              <FileTree
                nodes={node.children}
                selectedPath={selectedPath}
                onSelect={onSelect}
                depth={depth + 1}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function FilePreviewPane({ file }: { file?: AssetPreview["selectedFile"] }) {
  if (!file) {
    return (
      <div className="flex min-h-[360px] min-w-0 items-center justify-center text-sm text-muted-foreground lg:min-h-0">
        Select a file.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-col">
      <div className="flex shrink-0 min-w-0 items-center justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <div className="truncate font-medium">{file.name}</div>
          <div className="mt-1 truncate font-mono text-xs text-muted-foreground">
            {file.path}
          </div>
        </div>
        <Badge variant="outline">{formatBytes(file.size)}</Badge>
      </div>
      {file.isText ? (
        <div className="min-h-0 flex-1 overflow-auto bg-zinc-950 p-4 text-zinc-50">
          <pre className="whitespace-pre-wrap break-words text-xs leading-5">
            {file.content ?? ""}
          </pre>
          {file.truncated ? (
            <div className="mt-4 rounded-md border border-blue-300/40 bg-blue-500/10 px-3 py-2 text-xs text-blue-100">
              Preview truncated.
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex min-h-[360px] flex-1 flex-col items-center justify-center gap-2 px-4 text-center text-sm text-muted-foreground lg:min-h-0">
          <FileArchive className="h-8 w-8" aria-hidden="true" />
          Binary file preview is not available.
        </div>
      )}
    </div>
  );
}

function SkillMetadataPanel({
  workspace,
  token,
  asset,
  issues,
  onChanged,
  className
}: {
  workspace: WorkspaceRecord;
  token: string;
  asset?: AssetRecord;
  issues: ValidationIssue[];
  onChanged: () => Promise<void>;
  className?: string;
}) {
  const [description, setDescription] = useState("");
  const [owner, setOwner] = useState("");
  const [tags, setTags] = useState("");
  const [lifecycleState, setLifecycleState] = useState("experimental");
  const [agents, setAgents] = useState("");
  const [message, setMessage] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    setDescription(asset?.description ?? "");
    setOwner(asset?.owner ?? "");
    setTags(asset?.tags.join(", ") ?? "");
    setLifecycleState(asset?.lifecycleState ?? "experimental");
    setAgents((asset ? metadataList(asset, "agents") : []).join(", "));
    setMessage(undefined);
  }, [asset?.id]);

  if (!asset) {
    return (
      <div className={cn("flex min-h-48 items-center justify-center rounded-lg border border-dashed bg-card text-sm text-muted-foreground", className)}>
        Select a skill to inspect metadata.
      </div>
    );
  }

  const selectedAsset = asset;
  const assetIssues = issues.filter(
    (issue) => issue.assetId === selectedAsset.id || issue.skillId === selectedAsset.skill?.id
  );
  const headings = metadataList(selectedAsset, "headings");
  const agentsList = metadataList(selectedAsset, "agents");
  const storage = selectedAsset.storage;

  async function saveAsset(event: FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    setMessage(undefined);
    try {
      await updateWorkspaceAsset(token, workspace.id, selectedAsset.id, {
        description,
        owner,
        tags: splitList(tags),
        lifecycleState,
        agents: splitList(agents)
      });
      setMessage("Skill saved.");
      await onChanged();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsSaving(false);
    }
  }

  async function removeAsset() {
    if (!window.confirm(`Delete ${selectedAsset.displayName}?`)) return;
    setIsDeleting(true);
    setMessage(undefined);
    try {
      await deleteWorkspaceAsset(token, workspace.id, selectedAsset.id);
      setMessage("Skill deleted.");
      await onChanged();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <form
      className={cn(
        "flex min-h-[620px] min-w-0 flex-col overflow-hidden rounded-lg border bg-card 2xl:min-h-0",
        className
      )}
      onSubmit={saveAsset}
    >
      <div className="flex shrink-0 flex-col gap-3 border-b bg-card p-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-lg font-semibold">{selectedAsset.displayName}</h2>
            <Badge variant="secondary" className={healthBadgeClass(selectedAsset.health)}>
              {selectedAsset.health}
            </Badge>
            <Badge variant="outline">{selectedAsset.lifecycleState}</Badge>
          </div>
          <p className="mt-1 max-w-4xl text-sm leading-6 text-muted-foreground">
            {selectedAsset.description || "No description."}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button type="submit" disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="h-4 w-4" aria-hidden="true" />
            )}
            Save
          </Button>
          <Button type="button" variant="outline" onClick={removeAsset} disabled={isDeleting}>
            {isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            )}
            Delete
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="grid gap-5">
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium">
              Description
              <Input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Owner
              <Input value={owner} onChange={(event) => setOwner(event.target.value)} />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Lifecycle
              <Select value={lifecycleState} onValueChange={setLifecycleState}>
                <SelectTrigger>
                  <SelectValue placeholder="Lifecycle" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="experimental">experimental</SelectItem>
                  <SelectItem value="stable">stable</SelectItem>
                  <SelectItem value="deprecated">deprecated</SelectItem>
                  <SelectItem value="archived">archived</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Tags
              <Input value={tags} onChange={(event) => setTags(event.target.value)} />
            </label>
            <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">
              Agents
              <Input value={agents} onChange={(event) => setAgents(event.target.value)} />
            </label>
          </div>
          <div className="grid gap-3 text-sm md:grid-cols-2">
            <KeyValue label="Asset ID" value={selectedAsset.id} />
            <KeyValue label="Name" value={selectedAsset.name} />
            <KeyValue label="Package" value={selectedAsset.packageName ?? "-"} />
            <KeyValue label="Kind" value={selectedAsset.kind} />
            <KeyValue label="Hash" value={shortHash(selectedAsset.contentHash)} />
            <KeyValue label="Skill entry" value={metadataText(selectedAsset, "skillEntry") || "-"} />
            <KeyValue label="Discovered" value={formatDate(selectedAsset.discoveredAt)} />
            <KeyValue label="Updated" value={formatDate(selectedAsset.updatedAt)} />
          </div>
          <TokenList title="Agents" values={agentsList} empty="No agent compatibility metadata." />
          <TokenList title="Headings" values={headings} empty="No headings parsed." />
        </div>
        <div className="space-y-4 rounded-lg border bg-background p-4">
          <div>
            <h3 className="text-sm font-medium">Uploaded package</h3>
            <div className="mt-3 grid gap-2 text-sm">
              <KeyValue label="Archive" value={storage?.originalName ?? "-"} />
              <KeyValue label="Size" value={storage ? formatBytes(storage.size) : "-"} />
              <KeyValue label="Uploaded" value={storage ? formatDate(storage.uploadedAt) : "-"} />
            </div>
          </div>
          <div>
            <h3 className="text-sm font-medium">Contents</h3>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <MetadataCount label="Zip files" value={metadataNumber(selectedAsset, "zipEntries")} />
              <MetadataCount label="Scripts" value={metadataNumber(selectedAsset, "scripts")} />
              <MetadataCount label="References" value={metadataNumber(selectedAsset, "references")} />
              <MetadataCount label="Assets" value={metadataNumber(selectedAsset, "assets")} />
            </div>
          </div>
          {assetIssues.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Validation</h3>
              {assetIssues.map((issue) => (
                <div key={`${issue.code}-${issue.message}`} className="rounded-md border px-3 py-2 text-sm">
                  <div className="flex items-center gap-2 font-medium">
                    {issue.severity === "error" ? (
                      <AlertCircle className="h-4 w-4 text-destructive" aria-hidden="true" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-amber-600" aria-hidden="true" />
                    )}
                    {issue.code}
                  </div>
                  <p className="mt-1 text-muted-foreground">{issue.message}</p>
                </div>
              ))}
            </div>
          ) : null}
          {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
        </div>
      </div>
      </div>
    </form>
  );
}

function MetadataCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-card px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-medium">{value}</div>
    </div>
  );
}

function TokenList({
  title,
  values,
  empty
}: {
  title: string;
  values: string[];
  empty: string;
}) {
  return (
    <div>
      <h3 className="text-sm font-medium">{title}</h3>
      {values.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {values.map((value) => (
            <Badge key={value} variant="outline" className="rounded-md">
              {value}
            </Badge>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}

function UploadSkillZipForm({
  workspace,
  token,
  storage,
  onUploaded
}: {
  workspace: WorkspaceRecord;
  token: string;
  storage?: StorageStatus;
  onUploaded: () => Promise<void>;
}) {
  const [file, setFile] = useState<File | undefined>();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [owner, setOwner] = useState("");
  const [tags, setTags] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | undefined>();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file) {
      setMessage("Select a .zip file first.");
      return;
    }

    setIsSaving(true);
    setMessage(undefined);
    try {
      const result = await uploadWorkspaceSkillZip(token, workspace.id, {
        file,
        name,
        description,
        owner,
        tags: splitList(tags)
      });
      setMessage(`Uploaded ${result.uploaded.storage?.originalName ?? result.uploaded.displayName}.`);
      setFile(undefined);
      setName("");
      setDescription("");
      setOwner("");
      setTags("");
      await onUploaded();
    } catch (caught) {
      setMessage(uploadErrorMessage(caught));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      {!storage?.configured ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Uploads are not configured yet. Ask an administrator to enable package uploads before continuing.
        </div>
      ) : null}
      <label className="grid gap-1.5 text-sm font-medium">
        Skill zip
        <Input
          type="file"
          accept=".zip,application/zip"
          onChange={(event) => setFile(event.target.files?.[0])}
          required
        />
      </label>
      <label className="grid gap-1.5 text-sm font-medium">
        Name override
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="code-review"
        />
      </label>
      <label className="grid gap-1.5 text-sm font-medium">
        Description
        <Input
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="What does this skill do?"
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-medium">
          Owner
          <Input value={owner} onChange={(event) => setOwner(event.target.value)} />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Tags
          <Input
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="review, frontend"
          />
        </label>
      </div>
      <Button type="submit" disabled={isSaving || !storage?.configured}>
        {isSaving ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Upload className="h-4 w-4" aria-hidden="true" />
        )}
        Upload
      </Button>
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </form>
  );
}

function WorkspaceView({
  token,
  session,
  workspace,
  onSessionChange
}: {
  token: string;
  session: SessionResponse;
  workspace: WorkspaceRecord;
  onSessionChange: (session: SessionResponse, workspace?: WorkspaceRecord) => Promise<void>;
}) {
  const [name, setName] = useState(workspace.name);
  const [scanPaths, setScanPaths] = useState(workspace.defaultScanPaths.join(", "));
  const [skillRoot, setSkillRoot] = useState(workspace.skillRoot);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<WorkspaceRole>("member");
  const [message, setMessage] = useState<string | undefined>();
  const [memberMessage, setMemberMessage] = useState<string | undefined>();

  useEffect(() => {
    setName(workspace.name);
    setScanPaths(workspace.defaultScanPaths.join(", "));
    setSkillRoot(workspace.skillRoot);
  }, [workspace.id, workspace.name, workspace.defaultScanPaths, workspace.skillRoot]);

  useEffect(() => {
    void refreshMembers();
  }, [workspace.id, token]);

  async function refreshMembers() {
    setMemberMessage(undefined);
    try {
      const result = await getWorkspaceMembers(token, workspace.id);
      setMembers(result.members);
    } catch (caught) {
      setMemberMessage(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    setMessage(undefined);
    try {
      const result = await updateWorkspace(token, workspace.id, {
        name,
        defaultScanPaths: splitList(scanPaths),
        skillRoot
      });
      setMessage("Workspace saved.");
      await onSessionChange(result, result.workspace);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function createNewWorkspace(event: FormEvent) {
    event.preventDefault();
    setMessage(undefined);
    try {
      const result = await createWorkspace(token, {
        name: newWorkspaceName,
        defaultScanPaths: ["examples"],
        skillRoot: "skills"
      });
      setNewWorkspaceName("");
      setMessage("Workspace created.");
      await onSessionChange(result, result.workspace);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function inviteMember(event: FormEvent) {
    event.preventDefault();
    setMemberMessage(undefined);
    try {
      const result = await addWorkspaceMember(token, workspace.id, {
        email: memberEmail,
        role: memberRole
      });
      setMembers(result.members);
      setMemberEmail("");
      setMemberMessage("Member added.");
    } catch (caught) {
      setMemberMessage(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function changeRole(membershipId: string, role: WorkspaceRole) {
    setMemberMessage(undefined);
    try {
      const result = await updateWorkspaceMember(token, workspace.id, membershipId, role);
      setMembers(result.members);
      setMemberMessage("Role updated.");
    } catch (caught) {
      setMemberMessage(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function removeMember(membershipId: string) {
    if (!window.confirm("Remove this member from the workspace?")) return;
    setMemberMessage(undefined);
    try {
      await removeWorkspaceMember(token, workspace.id, membershipId);
      await refreshMembers();
      setMemberMessage("Member removed.");
    } catch (caught) {
      setMemberMessage(caught instanceof Error ? caught.message : String(caught));
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto pr-1">
      <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Workspace Settings</CardTitle>
          <CardDescription>{workspace.slug}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={saveSettings}>
            <label className="grid gap-1.5 text-sm font-medium">
              Name
              <Input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Default scan paths
              <Input value={scanPaths} onChange={(event) => setScanPaths(event.target.value)} />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Skill root
              <Input value={skillRoot} onChange={(event) => setSkillRoot(event.target.value)} />
            </label>
            <Button type="submit">
              <Save className="h-4 w-4" aria-hidden="true" />
              Save
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Workspaces</CardTitle>
          <CardDescription>{session.workspaces.length} tenant(s)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {session.workspaces.map((item) => (
              <div key={item.id} className="rounded-md border px-3 py-2 text-sm">
                <div className="font-medium">{item.name}</div>
                <div className="text-xs text-muted-foreground">{item.slug}</div>
              </div>
            ))}
          </div>
          <form className="flex gap-2" onSubmit={createNewWorkspace}>
            <Input
              value={newWorkspaceName}
              onChange={(event) => setNewWorkspaceName(event.target.value)}
              placeholder="New workspace"
              required
            />
            <Button type="submit">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add
            </Button>
          </form>
          {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
        </CardContent>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>{members.length} account(s) in this workspace</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="min-w-0 overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b bg-muted/60 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Account</th>
                  <th className="hidden px-3 py-2 font-medium md:table-cell">Joined</th>
                  <th className="px-3 py-2 font-medium">Role</th>
                  <th className="w-16 px-3 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.membership.id} className="border-b last:border-0">
                    <td className="px-3 py-3">
                      <div className="font-medium">{member.account.name}</div>
                      <div className="text-xs text-muted-foreground">{member.account.email}</div>
                    </td>
                    <td className="hidden px-3 py-3 text-muted-foreground md:table-cell">
                      {new Date(member.membership.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-3">
                      <Select
                        value={member.membership.role}
                        onValueChange={(value) =>
                          void changeRole(member.membership.id, value as WorkspaceRole)
                        }
                      >
                        <SelectTrigger className="h-8 w-28">
                          <SelectValue placeholder="Role" />
                        </SelectTrigger>
                        <SelectContent>
                          {roleOptions.map((role) => (
                            <SelectItem key={role} value={role}>
                              {role}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-3">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => void removeMember(member.membership.id)}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_140px_auto]" onSubmit={inviteMember}>
            <Input
              value={memberEmail}
              onChange={(event) => setMemberEmail(event.target.value)}
              placeholder="teammate@example.com"
              type="email"
              required
            />
            <Select value={memberRole} onValueChange={(value) => setMemberRole(value as WorkspaceRole)}>
              <SelectTrigger>
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                {roleOptions.map((role) => (
                  <SelectItem key={role} value={role}>
                    {role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit">
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              Add
            </Button>
          </form>
          {memberMessage ? <p className="text-sm text-muted-foreground">{memberMessage}</p> : null}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}

function AccountView({
  token,
  account,
  memberships,
  onSessionChange,
  onPasswordChanged
}: {
  token: string;
  account: AccountProfile;
  memberships: WorkspaceMembership[];
  onSessionChange: (session: SessionResponse) => void;
  onPasswordChanged: () => Promise<void>;
}) {
  const [name, setName] = useState(account.name);
  const [email, setEmail] = useState(account.email);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [profileMessage, setProfileMessage] = useState<string | undefined>();
  const [passwordMessage, setPasswordMessage] = useState<string | undefined>();
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  useEffect(() => {
    setName(account.name);
    setEmail(account.email);
  }, [account.id, account.name, account.email]);

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setIsSavingProfile(true);
    setProfileMessage(undefined);
    try {
      const nextSession = await updateAccount(token, { name, email });
      onSessionChange(nextSession);
      setProfileMessage("Account saved.");
    } catch (caught) {
      setProfileMessage(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function savePassword(event: FormEvent) {
    event.preventDefault();
    setIsChangingPassword(true);
    setPasswordMessage(undefined);
    try {
      await changePassword(token, { currentPassword, newPassword });
      setPasswordMessage("Password changed. Sign in again.");
      await onPasswordChanged();
    } catch (caught) {
      setPasswordMessage(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsChangingPassword(false);
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto pr-1">
      <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>{account.id}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={saveProfile}>
            <label className="grid gap-1.5 text-sm font-medium">
              Name
              <Input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Email
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <div className="grid gap-3 text-sm">
              <KeyValue label="Created" value={new Date(account.createdAt).toLocaleString()} />
              <KeyValue
                label="Updated"
                value={account.updatedAt ? new Date(account.updatedAt).toLocaleString() : "-"}
              />
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={isSavingProfile}>
                {isSavingProfile ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Save className="h-4 w-4" aria-hidden="true" />
                )}
                Save
              </Button>
              {profileMessage ? <span className="text-sm text-muted-foreground">{profileMessage}</span> : null}
            </div>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>Changing it signs out every active session.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={savePassword}>
            <label className="grid gap-1.5 text-sm font-medium">
              Current password
              <Input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              New password
              <Input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </label>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={isChangingPassword}>
                {isChangingPassword ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <KeyRound className="h-4 w-4" aria-hidden="true" />
                )}
                Change
              </Button>
              {passwordMessage ? <span className="text-sm text-muted-foreground">{passwordMessage}</span> : null}
            </div>
          </form>
        </CardContent>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Memberships</CardTitle>
          <CardDescription>{memberships.length} workspace role(s)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {memberships.map((membership) => (
            <div key={membership.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <span className="font-mono text-xs text-muted-foreground">{membership.workspaceId}</span>
              <Badge variant="outline">{membership.role}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-medium" title={value}>{value}</span>
    </div>
  );
}

function readRouteFromLocation(): AppRoute {
  return normalizeRoute(routeFromPath(window.location.pathname));
}

function routeFromPath(pathname: string): AppRoute {
  const segments = pathname.split("/").filter(Boolean);
  const section = segments[0];

  if (!section || section === "skills" || section === "assets") {
    const assetQuery = segments[1] ? decodeRoutePart(segments.slice(1).join("/")) : undefined;
    return assetQuery ? { view: "asset-detail", assetQuery } : { view: "assets" };
  }

  if (section === "workspace") return { view: "workspace" };
  if (section === "account") return { view: "account" };

  return { view: "assets" };
}

function normalizeRoute(route: AppRoute): AppRoute {
  if (route.view === "asset-detail" && !route.assetQuery) {
    return { view: "assets" };
  }
  return route;
}

function pathForRoute(route: AppRoute): string {
  if (route.view === "asset-detail" && route.assetQuery) {
    return `/skills/${encodeURIComponent(route.assetQuery)}`;
  }
  if (route.view === "workspace") return "/workspace";
  if (route.view === "account") return "/account";
  return "/skills";
}

function replaceBrowserRoute(route: AppRoute): void {
  const path = pathForRoute(normalizeRoute(route));
  if (window.location.pathname !== path) {
    window.history.replaceState(null, "", path);
  }
}

function decodeRoutePart(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function routeQueryForAsset(asset: AssetRecord): string {
  return asset.slug || asset.name || asset.id;
}

function findUiAsset(assets: AssetRecord[], query: string): AssetRecord | undefined {
  const normalized = query.toLowerCase();
  return assets.find((asset) =>
    [asset.id, asset.slug, asset.name, asset.displayName]
      .filter(Boolean)
      .some((value) => value.toLowerCase() === normalized)
  );
}

function metadataList(asset: AssetRecord, key: string): string[] {
  const value = asset.metadata[key];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function metadataNumber(asset: AssetRecord, key: string): number {
  const value = asset.metadata[key];
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function metadataText(asset: AssetRecord, key: string): string {
  const value = asset.metadata[key];
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.join(", ");
  return "";
}

function formatDate(value?: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function shortHash(value?: string): string {
  return value ? value.slice(0, 16) : "-";
}

function viewTitle(view: View): string {
  if (view === "asset-detail") return "Skill Detail";
  if (view === "workspace") return "Workspace";
  if (view === "account") return "Account";
  return "Skills";
}

function healthBadgeClass(health: AssetRecord["health"]): string {
  if (health === "error") return "border-destructive/30 bg-destructive/10 text-destructive";
  if (health === "warning") return "border-amber-200 bg-amber-50 text-amber-800";
  if (health === "unknown") return "border-zinc-200 bg-zinc-50 text-zinc-700";
  return "border-blue-200 bg-blue-50 text-blue-950";
}

function uploadStatusLabel(storage?: StorageStatus): string {
  if (!storage?.configured) return "Uploads need setup";
  return "Ready to accept skill packages";
}

function uploadErrorMessage(caught: unknown): string {
  const message = caught instanceof Error ? caught.message : String(caught);
  if (/s3|bucket|object storage|harhub_s3/i.test(message)) {
    return "Uploads are not configured yet. Ask an administrator to enable package uploads before continuing.";
  }
  return message;
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
