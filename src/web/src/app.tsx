import {
  AlertCircle,
  Activity,
  CheckCircle2,
  Database,
  FileSearch,
  FolderInput,
  GalleryVerticalEnd,
  KeyRound,
  Layers3,
  Loader2,
  LogOut,
  Plus,
  RefreshCcw,
  Save,
  Tag,
  Trash2,
  UserPlus,
  type LucideIcon
} from "lucide-react";
import { type FormEvent, type MouseEvent, useEffect, useMemo, useState } from "react";
import type {
  AccountProfile,
  AssetRecord,
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
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
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
import {
  addWorkspaceMember,
  changePassword,
  createWorkspace,
  createWorkspaceAsset,
  deleteWorkspaceAsset,
  getSession,
  getWorkspaceAssets,
  getWorkspaceMembers,
  login,
  logout,
  removeWorkspaceMember,
  scanWorkspaceAssets,
  signUp,
  updateAccount,
  updateWorkspaceAsset,
  updateWorkspaceMember,
  updateWorkspace,
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
  const [catalogPath, setCatalogPath] = useState("");
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [scanPath, setScanPath] = useState("examples");
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
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
    setScanPath(activeWorkspace.defaultScanPaths.join(", "));
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
      setCatalogPath(result.catalogPath);
      setSelectedId((current) =>
        result.assets.some((asset) => asset.id === current) ? current : result.assets[0]?.id
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsLoading(false);
    }
  }

  async function runScan() {
    if (!activeWorkspace || !token) return;
    setIsScanning(true);
    setError(undefined);
    try {
      const paths = splitList(scanPath);
      const result = await scanWorkspaceAssets(token, activeWorkspace.id, paths);
      setAssets(result.assets);
      setIssues(result.issues);
      setCatalogPath(result.assetCatalogPath ?? result.catalogPath);
      setSelectedId((current) =>
        result.assets.some((asset) => asset.id === current) ? current : result.assets[0]?.id
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsScanning(false);
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
            <SidebarMenu className="gap-2">
              <SidebarSection
                title="Assets"
                detail="Skill library"
                isActive={view === "assets"}
                onSelect={() => setView("assets")}
              />
              <SidebarSection
                title="Workspace"
                detail="Settings"
                isActive={view === "workspace"}
                onSelect={() => setView("workspace")}
              />
              <SidebarSection
                title="Account"
                detail="Profile"
                isActive={view === "account"}
                onSelect={() => setView("account")}
              />
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarGroup className="p-0">
            <SidebarGroupContent>
              <WorkspaceSelect
                workspaces={session.workspaces}
                value={activeWorkspace?.id ?? ""}
                onValueChange={setActiveWorkspaceId}
                className="h-8 border-sidebar-border bg-background shadow-none focus:ring-sidebar-ring"
              />
            </SidebarGroupContent>
          </SidebarGroup>
          <div className="px-2 text-xs text-muted-foreground">
            {roleForWorkspace(session.memberships, activeWorkspace?.id)}
          </div>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={handleLogout}>
                <LogOut className="size-4" aria-hidden="true" />
                <span>Sign out</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
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
          {view === "assets" ? (
            <div className="ml-auto hidden items-center gap-2 md:flex">
              <Input
                value={scanPath}
                onChange={(event) => setScanPath(event.target.value)}
                aria-label="Scan paths"
                className="w-72"
              />
              <Button onClick={runScan} disabled={isScanning}>
                {isScanning ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <RefreshCcw className="h-4 w-4" aria-hidden="true" />
                )}
                Scan
              </Button>
            </div>
          ) : null}
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6 lg:p-8">
          {view === "assets" ? (
            <div className="flex flex-col gap-2 md:hidden">
              <Input
                value={scanPath}
                onChange={(event) => setScanPath(event.target.value)}
                aria-label="Scan paths"
              />
              <Button onClick={runScan} disabled={isScanning}>
                {isScanning ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <RefreshCcw className="h-4 w-4" aria-hidden="true" />
                )}
                Scan
              </Button>
            </div>
          ) : null}
          {catalogPath && view === "assets" ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <FolderInput className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="truncate">{catalogPath}</span>
            </div>
          ) : null}
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
  title,
  detail,
  isActive,
  onSelect
}: {
  title: string;
  detail: string;
  isActive: boolean;
  onSelect: () => void;
}) {
  const href = `#${title.toLowerCase()}`;

  function handleSelect(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    onSelect();
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild>
        <a href={href} className="font-medium" onClick={handleSelect}>
          {title}
        </a>
      </SidebarMenuButton>
      <SidebarMenuSub className="ml-0 border-l-0 px-1.5">
        <SidebarMenuSubItem>
          <SidebarMenuSubButton asChild isActive={isActive}>
            <a href={href} onClick={handleSelect}>
              {detail}
            </a>
          </SidebarMenuSubButton>
        </SidebarMenuSubItem>
      </SidebarMenuSub>
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
  const tags = useMemo(
    () => Array.from(new Set(assets.flatMap((asset) => asset.tags))).sort(),
    [assets]
  );
  const skillAssets = assets.filter((asset) => asset.kind === "skill");
  const filteredAssets = assets.filter((asset) => {
    const normalizedQuery = query.trim().toLowerCase();
    const matchesQuery =
      !normalizedQuery ||
      asset.name.toLowerCase().includes(normalizedQuery) ||
      asset.displayName.toLowerCase().includes(normalizedQuery) ||
      asset.description.toLowerCase().includes(normalizedQuery) ||
      asset.kind.toLowerCase().includes(normalizedQuery) ||
      asset.packageName?.toLowerCase().includes(normalizedQuery) ||
      asset.owner?.toLowerCase().includes(normalizedQuery);
    const matchesTag = !tagFilter || asset.tags.includes(tagFilter);
    return matchesQuery && matchesTag;
  });
  const selectedAsset =
    assets.find((asset) => asset.id === selectedId) ?? filteredAssets[0] ?? assets[0];
  const errorCount =
    assets.reduce((count, asset) => count + asset.validation.errors, 0) ||
    issues.filter((issue) => issue.severity === "error").length;
  const warningCount =
    assets.reduce((count, asset) => count + asset.validation.warnings, 0) ||
    issues.filter((issue) => issue.severity === "warning").length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard icon={Database} label="Assets" value={assets.length.toString()} />
        <MetricCard icon={Layers3} label="Skill Assets" value={skillAssets.length.toString()} />
        <MetricCard icon={Tag} label="Tags" value={tags.length.toString()} />
        <MetricCard
          icon={Activity}
          label="Issues"
          value={(errorCount + warningCount).toString()}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search assets, packages, owners"
              aria-label="Search assets"
            />
            <Select
              value={tagFilter || "all"}
              onValueChange={(value) => onTagFilterChange(value === "all" ? "" : value)}
            >
              <SelectTrigger className="sm:w-44" aria-label="Filter by tag">
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
          </div>
          <AssetTable
            assets={filteredAssets}
            selectedId={selectedAsset?.id}
            isLoading={isLoading}
            onSelect={onSelect}
          />
        </div>
        <AssetDetail
          workspace={workspace}
          token={token}
          asset={selectedAsset}
          issues={issues}
          onChanged={onRefresh}
        />
      </div>
      <CreateSkillPanel workspace={workspace} token={token} onCreated={onRefresh} />
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between pt-4">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold">{value}</p>
        </div>
        <Icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
      </CardContent>
    </Card>
  );
}

function AssetTable({
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
      <Card>
        <CardContent className="flex h-52 items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          Loading assets
        </CardContent>
      </Card>
    );
  }

  if (assets.length === 0) {
    return (
      <Card>
        <CardContent className="flex h-52 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
          <FileSearch className="h-6 w-6" aria-hidden="true" />
          No assets matched the current filters.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <table className="w-full text-left text-sm">
        <thead className="border-b bg-muted/60 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Asset</th>
            <th className="hidden px-3 py-2 font-medium sm:table-cell">Kind</th>
            <th className="hidden px-3 py-2 font-medium md:table-cell">Package</th>
            <th className="hidden px-3 py-2 font-medium lg:table-cell">Owner</th>
            <th className="px-3 py-2 font-medium">Health</th>
          </tr>
        </thead>
        <tbody>
          {assets.map((asset) => (
            <tr
              key={asset.id}
              className={cn(
                "cursor-pointer border-b transition-colors last:border-0 hover:bg-accent/50",
                selectedId === asset.id && "bg-accent"
              )}
              onClick={() => onSelect(asset.id)}
            >
              <td className="px-3 py-3">
                <div className="font-medium">{asset.displayName}</div>
                <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                  {asset.description || asset.source?.path}
                </div>
              </td>
              <td className="hidden px-3 py-3 sm:table-cell">
                <Badge variant="outline">{asset.kind}</Badge>
              </td>
              <td className="hidden px-3 py-3 text-muted-foreground md:table-cell">
                {asset.packageName ?? "-"}
              </td>
              <td className="hidden px-3 py-3 text-muted-foreground lg:table-cell">
                {asset.owner ?? "-"}
              </td>
              <td className="px-3 py-3">
                <Badge
                  variant="secondary"
                  className={healthBadgeClass(asset.health)}
                >
                  {asset.health}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AssetDetail({
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
    setAgents(asset?.skill?.agents.join(", ") ?? "");
    setMessage(undefined);
  }, [asset?.id]);

  if (!asset) {
    return (
      <Card>
        <CardContent className="flex h-72 items-center justify-center text-sm text-muted-foreground">
          Select an asset to inspect it.
        </CardContent>
      </Card>
    );
  }

  const selectedAsset = asset;
  const skill = selectedAsset.skill;
  const assetIssues = issues.filter(
    (issue) => issue.assetId === selectedAsset.id || (skill && issue.skillId === skill.id)
  );
  const resources = skill?.resources ?? { scripts: [], references: [], assets: [] };

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
      setMessage("Asset saved.");
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
      setMessage("Asset deleted.");
      await onChanged();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>{asset.displayName}</CardTitle>
            <CardDescription className="mt-2">{asset.id}</CardDescription>
          </div>
          <Badge
            variant="secondary"
            className={healthBadgeClass(asset.health)}
          >
            {asset.health}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm leading-6">{asset.description || "No description."}</p>
        <div className="grid gap-3 text-sm">
          <KeyValue label="Kind" value={asset.kind} />
          <KeyValue label="Name" value={asset.name} />
          <KeyValue label="Package" value={asset.packageName ?? "-"} />
          <KeyValue label="Owner" value={asset.owner ?? "-"} />
          <KeyValue label="State" value={asset.lifecycleState} />
          <KeyValue label="Source" value={asset.source?.path ?? "-"} />
          <KeyValue label="Hash" value={asset.contentHash?.slice(0, 16) ?? "-"} />
        </div>
        <div className="flex flex-wrap gap-2">
          {asset.tags.map((tag) => (
            <Badge key={tag} variant="outline">
              {tag}
            </Badge>
          ))}
        </div>
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Resources</h4>
          <div className="grid gap-2 text-sm text-muted-foreground">
            <KeyValue label="Scripts" value={resources.scripts.length.toString()} />
            <KeyValue label="References" value={resources.references.length.toString()} />
            <KeyValue label="Assets" value={resources.assets.length.toString()} />
          </div>
        </div>
        {assetIssues.length > 0 ? (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Validation</h4>
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
        {asset.kind === "skill" ? (
          <form className="space-y-4 border-t pt-4" onSubmit={saveAsset}>
            <label className="grid gap-1.5 text-sm font-medium">
              Description
              <Input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
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
            </div>
            <label className="grid gap-1.5 text-sm font-medium">
              Tags
              <Input value={tags} onChange={(event) => setTags(event.target.value)} />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Agents
              <Input value={agents} onChange={(event) => setAgents(event.target.value)} />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={isSaving}>
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Save className="h-4 w-4" aria-hidden="true" />
                )}
                Save
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={removeAsset}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                )}
                Delete
              </Button>
              {message ? <span className="text-sm text-muted-foreground">{message}</span> : null}
            </div>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}

function CreateSkillPanel({
  workspace,
  token,
  onCreated
}: {
  workspace: WorkspaceRecord;
  token: string;
  onCreated: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [dir, setDir] = useState(workspace.skillRoot);
  const [description, setDescription] = useState("");
  const [owner, setOwner] = useState("");
  const [tags, setTags] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | undefined>();

  useEffect(() => {
    setDir(workspace.skillRoot);
  }, [workspace.skillRoot]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    setMessage(undefined);
    try {
      const result = await createWorkspaceAsset(token, workspace.id, {
        kind: "skill",
        name,
        dir,
        description,
        owner,
        tags: splitList(tags)
      });
      setMessage(`Created ${result.path}`);
      setName("");
      setDescription("");
      setTags("");
      await onCreated();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Skill Asset</CardTitle>
        <CardDescription>Create a skill asset backed by a standards-compatible `SKILL.md`.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={submit}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium">
              Skill name
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="code-review"
                required
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Directory
              <Input value={dir} onChange={(event) => setDir(event.target.value)} />
            </label>
          </div>
          <label className="grid gap-1.5 text-sm font-medium">
            Description
            <Input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What does this skill do, and when should agents use it?"
            />
          </label>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium">
              Owner
              <Input value={owner} onChange={(event) => setOwner(event.target.value)} />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Harhub tags
              <Input
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                placeholder="review, frontend"
              />
            </label>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Plus className="h-4 w-4" aria-hidden="true" />
              )}
              Create
            </Button>
            {message ? <span className="text-sm text-muted-foreground">{message}</span> : null}
          </div>
        </form>
      </CardContent>
    </Card>
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
    <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-medium">{value}</span>
    </div>
  );
}

function viewTitle(view: View): string {
  if (view === "workspace") return "Workspace";
  if (view === "account") return "Account";
  return "Assets";
}

function healthBadgeClass(health: AssetRecord["health"]): string {
  if (health === "error") return "border-destructive/30 bg-destructive/10 text-destructive";
  if (health === "warning") return "border-amber-200 bg-amber-50 text-amber-800";
  if (health === "unknown") return "border-zinc-200 bg-zinc-50 text-zinc-700";
  return "border-lime-200 bg-lime-50 text-zinc-950";
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
