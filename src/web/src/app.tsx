import {
  AlertCircle,
  Box,
  CheckCircle2,
  FileSearch,
  FolderInput,
  GalleryVerticalEnd,
  KeyRound,
  Loader2,
  LogOut,
  Plus,
  RefreshCcw,
  Settings,
  ShieldCheck,
  Tag,
  type LucideIcon
} from "lucide-react";
import { type FormEvent, type MouseEvent, useEffect, useMemo, useState } from "react";
import type {
  AccountProfile,
  SkillRecord,
  ValidationIssue,
  WorkspaceMembership,
  WorkspaceRecord
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
  createWorkspace,
  createWorkspaceSkill,
  getSession,
  getWorkspaceSkills,
  login,
  logout,
  scanWorkspaceSkills,
  signUp,
  updateWorkspace,
  type AuthResponse,
  type SessionResponse
} from "./lib/api";
import { cn } from "./lib/utils";

const TOKEN_KEY = "harhub.token";
const WORKSPACE_KEY = "harhub.workspace";

type View = "skills" | "workspace" | "account";

export function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) ?? "");
  const [session, setSession] = useState<SessionResponse | undefined>();
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(
    () => localStorage.getItem(WORKSPACE_KEY) ?? ""
  );
  const [view, setView] = useState<View>("skills");
  const [skills, setSkills] = useState<SkillRecord[]>([]);
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
    void refreshSkills(activeWorkspace.id);
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

  async function refreshSkills(workspaceId = activeWorkspace?.id) {
    if (!token || !workspaceId) return;
    setIsLoading(true);
    setError(undefined);
    try {
      const result = await getWorkspaceSkills(token, workspaceId);
      setSkills(result.skills);
      setCatalogPath(result.catalogPath);
      setSelectedId((current) => current ?? result.skills[0]?.id);
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
      const result = await scanWorkspaceSkills(token, activeWorkspace.id, paths);
      setSkills(result.skills);
      setIssues(result.issues);
      setCatalogPath(result.catalogPath);
      setSelectedId(result.skills[0]?.id);
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
    setSkills([]);
    setIssues([]);
  }

  async function applySession(nextSession: SessionResponse, workspace?: WorkspaceRecord) {
    setSession(nextSession);
    if (workspace) {
      setActiveWorkspaceId(workspace.id);
      localStorage.setItem(WORKSPACE_KEY, workspace.id);
    }
    await refreshSkills(workspace?.id ?? activeWorkspace?.id);
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
                title="Skills"
                detail="Management"
                isActive={view === "skills"}
                onSelect={() => setView("skills")}
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
          {view === "skills" ? (
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
          {view === "skills" ? (
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
          {catalogPath && view === "skills" ? (
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
          {view === "skills" && activeWorkspace ? (
            <SkillsView
              workspace={activeWorkspace}
              token={token}
              skills={skills}
              issues={issues}
              query={query}
              tagFilter={tagFilter}
              isLoading={isLoading}
              selectedId={selectedId}
              onQueryChange={setQuery}
              onTagFilterChange={setTagFilter}
              onSelect={setSelectedId}
              onRefresh={refreshSkills}
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
            <AccountView account={session.account} memberships={session.memberships} />
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

function SkillsView({
  workspace,
  token,
  skills,
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
  skills: SkillRecord[];
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
    () => Array.from(new Set(skills.flatMap((skill) => skill.tags))).sort(),
    [skills]
  );
  const filteredSkills = skills.filter((skill) => {
    const normalizedQuery = query.trim().toLowerCase();
    const matchesQuery =
      !normalizedQuery ||
      skill.name.toLowerCase().includes(normalizedQuery) ||
      skill.displayName.toLowerCase().includes(normalizedQuery) ||
      skill.description.toLowerCase().includes(normalizedQuery) ||
      skill.packageName?.toLowerCase().includes(normalizedQuery);
    const matchesTag = !tagFilter || skill.tags.includes(tagFilter);
    return matchesQuery && matchesTag;
  });
  const selectedSkill =
    skills.find((skill) => skill.id === selectedId) ?? filteredSkills[0] ?? skills[0];
  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.filter((issue) => issue.severity === "warning").length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard icon={Box} label="Skills" value={skills.length.toString()} />
        <MetricCard icon={Tag} label="Tags" value={tags.length.toString()} />
        <MetricCard icon={AlertCircle} label="Errors" value={errorCount.toString()} />
        <MetricCard icon={ShieldCheck} label="Warnings" value={warningCount.toString()} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search skills, packages, descriptions"
              aria-label="Search skills"
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
          <SkillTable
            skills={filteredSkills}
            selectedId={selectedSkill?.id}
            isLoading={isLoading}
            onSelect={onSelect}
          />
        </div>
        <SkillDetail skill={selectedSkill} issues={issues} />
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

function SkillTable({
  skills,
  selectedId,
  isLoading,
  onSelect
}: {
  skills: SkillRecord[];
  selectedId?: string;
  isLoading: boolean;
  onSelect: (id: string) => void;
}) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex h-52 items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          Loading catalog
        </CardContent>
      </Card>
    );
  }

  if (skills.length === 0) {
    return (
      <Card>
        <CardContent className="flex h-52 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
          <FileSearch className="h-6 w-6" aria-hidden="true" />
          No skills matched the current filters.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <table className="w-full text-left text-sm">
        <thead className="border-b bg-muted/60 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Skill</th>
            <th className="hidden px-3 py-2 font-medium sm:table-cell">Name</th>
            <th className="hidden px-3 py-2 font-medium md:table-cell">Package</th>
            <th className="hidden px-3 py-2 font-medium lg:table-cell">Owner</th>
            <th className="px-3 py-2 font-medium">State</th>
          </tr>
        </thead>
        <tbody>
          {skills.map((skill) => (
            <tr
              key={skill.id}
              className={cn(
                "cursor-pointer border-b transition-colors last:border-0 hover:bg-accent/50",
                selectedId === skill.id && "bg-accent"
              )}
              onClick={() => onSelect(skill.id)}
            >
              <td className="px-3 py-3">
                <div className="font-medium">{skill.displayName}</div>
                <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                  {skill.description || skill.source.path}
                </div>
              </td>
              <td className="hidden px-3 py-3 font-mono text-xs text-muted-foreground sm:table-cell">
                {skill.name}
              </td>
              <td className="hidden px-3 py-3 text-muted-foreground md:table-cell">
                {skill.packageName ?? "-"}
              </td>
              <td className="hidden px-3 py-3 text-muted-foreground lg:table-cell">
                {skill.owner ?? "-"}
              </td>
              <td className="px-3 py-3">
                <Badge
                  variant="secondary"
                  className={cn(
                    skill.lifecycleState === "stable" &&
                      "border-lime-200 bg-lime-50 text-zinc-950"
                  )}
                >
                  {skill.lifecycleState}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SkillDetail({
  skill,
  issues
}: {
  skill?: SkillRecord;
  issues: ValidationIssue[];
}) {
  if (!skill) {
    return (
      <Card>
        <CardContent className="flex h-72 items-center justify-center text-sm text-muted-foreground">
          Select a skill to inspect it.
        </CardContent>
      </Card>
    );
  }

  const skillIssues = issues.filter((issue) => issue.skillId === skill.id);
  const resources = skill.resources ?? { scripts: [], references: [], assets: [] };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>{skill.displayName}</CardTitle>
            <CardDescription className="mt-2">{skill.id}</CardDescription>
          </div>
          <Badge
            variant="secondary"
            className={cn(
              skillIssues.some((issue) => issue.severity === "error")
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-lime-200 bg-lime-50 text-zinc-950"
            )}
          >
            {skillIssues.length === 0 ? "valid" : `${skillIssues.length} issue(s)`}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm leading-6">{skill.description || "No description."}</p>
        <div className="grid gap-3 text-sm">
          <KeyValue label="Name" value={skill.name} />
          <KeyValue label="Package" value={skill.packageName ?? "-"} />
          <KeyValue label="Owner" value={skill.owner ?? "-"} />
          <KeyValue label="Source" value={skill.source.path} />
          <KeyValue label="Hash" value={skill.contentHash.slice(0, 16)} />
        </div>
        <div className="flex flex-wrap gap-2">
          {skill.tags.map((tag) => (
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
        {skillIssues.length > 0 ? (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Validation</h4>
            {skillIssues.map((issue) => (
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
      const result = await createWorkspaceSkill(token, workspace.id, {
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
        <CardTitle>Create Skill</CardTitle>
        <CardDescription>Scaffold a standards-compatible `SKILL.md` directory.</CardDescription>
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
  const [message, setMessage] = useState<string | undefined>();

  useEffect(() => {
    setName(workspace.name);
    setScanPaths(workspace.defaultScanPaths.join(", "));
    setSkillRoot(workspace.skillRoot);
  }, [workspace.id, workspace.name, workspace.defaultScanPaths, workspace.skillRoot]);

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
              <Settings className="h-4 w-4" aria-hidden="true" />
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
    </div>
  );
}

function AccountView({
  account,
  memberships
}: {
  account: AccountProfile;
  memberships: WorkspaceMembership[];
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>{account.name}</CardTitle>
          <CardDescription>{account.email}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <KeyValue label="Account" value={account.id} />
          <KeyValue label="Created" value={new Date(account.createdAt).toLocaleString()} />
        </CardContent>
      </Card>
      <Card>
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
  return "Skills";
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
