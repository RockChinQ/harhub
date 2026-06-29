import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Clock3,
  FileArchive,
  GalleryVerticalEnd,
  HardDriveUpload,
  KeyRound,
  Layers3,
  Loader2,
  LogOut,
  PackageOpen,
  Plus,
  Save,
  Search,
  Tag,
  Trash2,
  Upload,
  UserCircle,
  UserPlus,
  type LucideIcon
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import type {
  AccountProfile,
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
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger
} from "./components/ui/sidebar";
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

type View = "assets" | "workspace" | "account";

export function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) ?? "");
  const [session, setSession] = useState<SessionResponse | undefined>();
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(
    () => localStorage.getItem(WORKSPACE_KEY) ?? ""
  );
  const [view, setView] = useState<View>("assets");
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [storageStatus, setStorageStatus] = useState<StorageStatus | undefined>();
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (!token) {
      setIsLoading(false);
      return;
    }

    void loadSession(token);
  }, [token]);

  const activeWorkspace = useMemo(() => {
    if (!session) return undefined;
    return (
      session.workspaces.find((workspace) => workspace.id === activeWorkspaceId) ??
      session.workspaces[0]
    );
  }, [activeWorkspaceId, session]);

  useEffect(() => {
    if (!activeWorkspace || !token) return;
    localStorage.setItem(WORKSPACE_KEY, activeWorkspace.id);
    void refreshAssets(activeWorkspace.id);
  }, [activeWorkspace?.id, token]);

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
      setSelectedId((current) =>
        storedAssets.some((asset) => asset.id === current) ? current : storedAssets[0]?.id
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
  }

  async function handleLogout() {
    if (token) await logout(token).catch(() => undefined);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(WORKSPACE_KEY);
    setToken("");
    setSession(undefined);
    setAssets([]);
    setIssues([]);
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
    <SidebarProvider>
      <Sidebar variant="floating">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild>
                <a href="#" onClick={(event) => event.preventDefault()}>
                  <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                    <GalleryVerticalEnd className="size-4" aria-hidden="true" />
                  </div>
                  <div className="flex min-w-0 flex-col gap-0.5 leading-none">
                    <span className="truncate font-semibold">Harhub</span>
                    <span className="truncate text-xs">{activeWorkspace?.name ?? "Workspace"}</span>
                  </div>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Library</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarSection
                  icon={Layers3}
                  title="Skills"
                  detail="S3 asset library"
                  isActive={view === "assets"}
                  onSelect={() => setView("assets")}
                />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="border-t border-sidebar-border/70">
          <div className="space-y-2 rounded-lg border border-sidebar-border bg-background/80 p-2">
            <div className="flex items-center gap-2">
              <WorkspaceSelect
                workspaces={session.workspaces}
                value={activeWorkspace?.id ?? ""}
                onValueChange={setActiveWorkspaceId}
                className="h-8 min-w-0 border-sidebar-border bg-background shadow-none focus:ring-sidebar-ring"
              />
              <Button
                type="button"
                variant={view === "workspace" ? "secondary" : "ghost"}
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => setView("workspace")}
                aria-label="Workspace settings"
              >
                <Building2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
            <div className="px-1 text-xs text-sidebar-foreground/65">
              {roleForWorkspace(session.memberships, activeWorkspace?.id)}
            </div>
          </div>
          <div className="space-y-2 rounded-lg border border-sidebar-border bg-background/80 p-2">
            <button
              type="button"
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                view === "account" && "bg-sidebar-accent text-sidebar-accent-foreground"
              )}
              onClick={() => setView("account")}
            >
              <UserCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{session.account.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {session.account.email}
                </span>
              </span>
            </button>
            <Button
              type="button"
              variant="outline"
              className="h-8 w-full justify-start bg-background"
              onClick={handleLogout}
            >
              <LogOut className="size-4" aria-hidden="true" />
              <span>Sign out</span>
            </Button>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <span className="font-medium text-foreground">
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
        <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6 lg:p-8">
          {error ? (
            <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
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
              onRefresh={refreshAssets}
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
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function SidebarSection({
  icon: Icon,
  title,
  detail,
  isActive,
  onSelect
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={isActive}
        onClick={onSelect}
        tooltip={title}
        className="h-11 items-start"
      >
        <Icon className="mt-0.5 size-4" aria-hidden="true" />
        <span className="flex min-w-0 flex-col gap-0.5 leading-tight">
          <span className="truncate font-medium">{title}</span>
          <span className="truncate text-xs text-sidebar-foreground/60">{detail}</span>
        </span>
      </SidebarMenuButton>
    </SidebarMenuItem>
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

function WorkspaceSelect({
  workspaces,
  value,
  onValueChange,
  className
}: {
  workspaces: WorkspaceRecord[];
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger aria-label="Workspace" className={className}>
        <SelectValue placeholder="Select workspace" />
      </SelectTrigger>
      <SelectContent>
        {workspaces.map((workspace) => (
          <SelectItem key={workspace.id} value={workspace.id}>
            {workspace.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-normal">Skills</h1>
            <Badge variant="secondary" className="bg-lime-300 text-zinc-950 hover:bg-lime-300">
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
              label={storageLabel(storage)}
              value={`${managedAssets.length} S3 object(s)`}
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
              <div className="mt-1 text-xs text-muted-foreground">{storageLabel(storage)}</div>
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
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-3 sm:flex-row sm:items-center">
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
      <SkillListTable
        assets={filteredAssets}
        selectedId={selectedAsset?.id}
        isLoading={isLoading}
        onSelect={onSelect}
      />
      <SkillMetadataPanel
        workspace={workspace}
        token={token}
        asset={selectedAsset}
        issues={issues}
        onChanged={onRefresh}
      />
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
    <div className="flex min-w-0 items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-xs">
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="truncate text-muted-foreground">{label}</span>
      <span className="shrink-0 font-medium">{value}</span>
    </div>
  );
}

function SkillListTable({
  assets,
  selectedId,
  isLoading,
  onSelect
}: {
  assets: AssetRecord[];
  selectedId?: string;
  isLoading: boolean;
  onSelect: (id: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="flex h-60 items-center justify-center rounded-lg border bg-card text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
        Loading skills
      </div>
    );
  }

  if (assets.length === 0) {
    return (
      <div className="flex h-60 flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-card text-sm text-muted-foreground">
        <PackageOpen className="h-7 w-7" aria-hidden="true" />
        No uploaded skill zips matched the current filters.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="border-b bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Skill</th>
              <th className="px-4 py-3 font-medium">Package / Owner</th>
              <th className="px-4 py-3 font-medium">Contents</th>
              <th className="px-4 py-3 font-medium">Storage</th>
              <th className="px-4 py-3 font-medium">Updated</th>
              <th className="w-28 px-4 py-3 font-medium">Health</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((asset) => {
              const zipEntries = metadataNumber(asset, "zipEntries");
              const scriptCount = metadataNumber(asset, "scripts");
              const referenceCount = metadataNumber(asset, "references");
              const assetCount = metadataNumber(asset, "assets");
              const uploadedAt = asset.storage?.uploadedAt ?? asset.updatedAt;

              return (
                <tr
                  key={asset.id}
                  className={cn(
                    "cursor-pointer border-b transition-colors last:border-0 hover:bg-accent/45",
                    selectedId === asset.id && "bg-lime-50/80"
                  )}
                  onClick={() => onSelect(asset.id)}
                >
                  <td className="px-4 py-4 align-top">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-lime-300 text-zinc-950">
                        <FileArchive className="h-4 w-4" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-medium">{asset.displayName}</div>
                        <div className="mt-1 line-clamp-2 max-w-xl text-xs leading-5 text-muted-foreground">
                          {asset.description || asset.name}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {asset.tags.slice(0, 4).map((tag) => (
                            <Badge key={tag} variant="outline" className="h-5 rounded-md px-1.5 text-[11px]">
                              {tag}
                            </Badge>
                          ))}
                          {asset.tags.length > 4 ? (
                            <Badge variant="outline" className="h-5 rounded-md px-1.5 text-[11px]">
                              +{asset.tags.length - 4}
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <div className="font-medium">{asset.packageName ?? "-"}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{asset.owner ?? "Unassigned"}</div>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <div className="grid gap-1 text-xs text-muted-foreground">
                      <span>{zipEntries || "-"} file(s)</span>
                      <span>{scriptCount} scripts · {referenceCount} refs · {assetCount} assets</span>
                      <span className="truncate">{metadataText(asset, "skillEntry") || "SKILL.md"}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <div className="truncate font-medium">{asset.storage?.originalName ?? "-"}</div>
                    <div className="mt-1 max-w-[260px] truncate text-xs text-muted-foreground">
                      {asset.storage?.key ?? "-"}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {asset.storage ? formatBytes(asset.storage.size) : "-"}
                    </div>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <div className="text-xs text-muted-foreground">{formatDate(uploadedAt)}</div>
                    <Badge variant="outline" className="mt-2 rounded-md">
                      {asset.lifecycleState}
                    </Badge>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <Badge variant="secondary" className={healthBadgeClass(asset.health)}>
                      {asset.health}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SkillMetadataPanel({
  workspace,
  token,
  asset,
  issues,
  onChanged
}: {
  workspace: WorkspaceRecord;
  token: string;
  asset?: AssetRecord;
  issues: ValidationIssue[];
  onChanged: () => Promise<void>;
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
      <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed bg-card text-sm text-muted-foreground">
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
    <form className="rounded-lg border bg-card p-4" onSubmit={saveAsset}>
      <div className="flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-start lg:justify-between">
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
      <div className="grid gap-5 pt-4 xl:grid-cols-[minmax(0,1fr)_360px]">
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
            <h3 className="text-sm font-medium">Storage</h3>
            <div className="mt-3 grid gap-2 text-sm">
              <KeyValue label="Provider" value={storage ? `${storage.provider}:${storage.bucket}` : "-"} />
              <KeyValue label="Object" value={storage?.key ?? "-"} />
              <KeyValue label="Original" value={storage?.originalName ?? "-"} />
              <KeyValue label="Size" value={storage ? formatBytes(storage.size) : "-"} />
              <KeyValue label="Content type" value={storage?.contentType ?? "-"} />
              <KeyValue label="Checksum" value={shortHash(storage?.checksum)} />
              <KeyValue label="ETag" value={storage?.etag ?? "-"} />
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
      setMessage(`Uploaded ${result.uploaded.storage?.key ?? result.uploaded.displayName}`);
      setFile(undefined);
      setName("");
      setDescription("");
      setOwner("");
      setTags("");
      await onUploaded();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      {!storage?.configured ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          S3 storage is not configured. Set HARHUB_S3_BUCKET and restart the API before uploading.
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
      <Button type="submit" disabled={isSaving}>
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
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-left text-sm">
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
  if (view === "workspace") return "Workspace";
  if (view === "account") return "Account";
  return "Skills";
}

function healthBadgeClass(health: AssetRecord["health"]): string {
  if (health === "error") return "border-destructive/30 bg-destructive/10 text-destructive";
  if (health === "warning") return "border-amber-200 bg-amber-50 text-amber-800";
  if (health === "unknown") return "border-zinc-200 bg-zinc-50 text-zinc-700";
  return "border-lime-200 bg-lime-50 text-zinc-950";
}

function storageLabel(storage?: StorageStatus): string {
  if (!storage) return "S3 storage";
  if (!storage.configured) return "S3 storage not configured";
  const prefix = storage.prefix ? `/${storage.prefix.replace(/\/$/g, "")}` : "";
  return `S3: ${storage.bucket}${prefix}`;
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function roleForWorkspace(memberships: WorkspaceMembership[], workspaceId?: string): string {
  const membership = memberships.find((item) => item.workspaceId === workspaceId);
  return membership ? `Role: ${membership.role}` : "No workspace role";
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
