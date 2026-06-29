import {
  AlertCircle,
  Box,
  Braces,
  CheckCircle2,
  FileSearch,
  FolderInput,
  Loader2,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Tag,
  type LucideIcon
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { SkillRecord, ValidationIssue } from "../../types";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { createSkill, getSkills, scanSkills } from "./lib/api";
import { cn } from "./lib/utils";

export function App() {
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
    void refresh();
  }, []);

  async function refresh() {
    setIsLoading(true);
    setError(undefined);
    try {
      const result = await getSkills();
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
    setIsScanning(true);
    setError(undefined);
    try {
      const paths = scanPath
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      const result = await scanSkills(paths.length > 0 ? paths : ["."]);
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
    <main className="min-h-screen">
      <div className="border-b bg-card">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <Braces className="h-5 w-5" aria-hidden="true" />
                </div>
                <h1 className="text-xl font-semibold">Harhub</h1>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Standards-compatible Agent Skills catalog and validation.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={scanPath}
                onChange={(event) => setScanPath(event.target.value)}
                aria-label="Scan paths"
                className="w-full sm:w-72"
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
          </div>
          {catalogPath ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <FolderInput className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="truncate">{catalogPath}</span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {error ? (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-4">
          <MetricCard icon={Box} label="Skills" value={skills.length.toString()} />
          <MetricCard icon={Tag} label="Tags" value={tags.length.toString()} />
          <MetricCard icon={AlertCircle} label="Errors" value={errorCount.toString()} />
          <MetricCard icon={ShieldCheck} label="Warnings" value={warningCount.toString()} />
        </div>

        <Tabs defaultValue="catalog" className="mt-6">
          <TabsList>
            <TabsTrigger value="catalog">Catalog</TabsTrigger>
            <TabsTrigger value="create">Create</TabsTrigger>
          </TabsList>
          <TabsContent value="catalog">
            <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
              <div className="space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search skills, packages, descriptions"
                    aria-label="Search skills"
                  />
                  <select
                    value={tagFilter}
                    onChange={(event) => setTagFilter(event.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="Filter by tag"
                  >
                    <option value="">All tags</option>
                    {tags.map((tag) => (
                      <option key={tag} value={tag}>
                        {tag}
                      </option>
                    ))}
                  </select>
                </div>
                <SkillTable
                  skills={filteredSkills}
                  selectedId={selectedSkill?.id}
                  isLoading={isLoading}
                  onSelect={setSelectedId}
                />
              </div>
              <SkillDetail skill={selectedSkill} issues={issues} />
            </section>
          </TabsContent>
          <TabsContent value="create">
            <CreateSkillPanel
              onCreated={async () => {
                await refresh();
              }}
            />
          </TabsContent>
        </Tabs>
      </div>
    </main>
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
                <Badge variant={skill.lifecycleState === "stable" ? "success" : "secondary"}>
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
          <Badge variant={skillIssues.some((issue) => issue.severity === "error") ? "warning" : "success"}>
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
          <h4 className="text-sm font-medium">Headings</h4>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {skill.headings.slice(0, 6).map((heading) => (
              <li key={heading}>{heading}</li>
            ))}
          </ul>
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

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-medium">{value}</span>
    </div>
  );
}

function CreateSkillPanel({ onCreated }: { onCreated: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [dir, setDir] = useState("skills");
  const [description, setDescription] = useState("");
  const [owner, setOwner] = useState("");
  const [tags, setTags] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | undefined>();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    setMessage(undefined);
    try {
      const result = await createSkill({
        name,
        dir,
        description,
        owner,
        tags: tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
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
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Create Skill</CardTitle>
        <CardDescription>Scaffold a standards-compatible `SKILL.md` directory.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={submit}>
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
          <label className="grid gap-1.5 text-sm font-medium">
            Description
            <Input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What does this skill do, and when should agents use it?"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
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
