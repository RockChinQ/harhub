import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  Download,
  FileArchive,
  ListChecks,
  Loader2,
  MessageSquareText,
  MousePointerClick,
  PackageCheck,
  RotateCcw,
  Settings2,
  Sparkles
} from "lucide-react";

import type {
  AssetFilePreview,
  AssetFileTreeNode,
  AssetRecord,
  HarnessFollowUpComponent,
  HarnessFollowUpResponse,
  HarnessInterviewAnswer,
  HarnessTemplateResponse,
  WorkspaceAiSettings,
  WorkspaceRecord
} from "../../../shared/types";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "../components/ui/card";
import { Checkbox } from "../components/ui/checkbox";
import { Textarea } from "../components/ui/textarea";
import {
  downloadForgeTemplate,
  generateForgeTemplate,
  getWorkspaceAiSettings,
  getForgeFollowUp
} from "../lib/api";
import { cn } from "../lib/utils";
import { FilePreviewPane } from "./assets/file-preview-pane";
import { FileTree } from "./assets/file-tree";

type BuilderPhase = "idle" | "question" | "working" | "complete";

export function ForgeView({
  token,
  workspace,
  assets,
  onOpenWorkspaceSettings
}: {
  token: string;
  workspace: WorkspaceRecord;
  assets: AssetRecord[];
  onOpenWorkspaceSettings: () => void;
}) {
  const usableSkills = assets.filter(
    (asset) => asset.kind === "skill" && asset.storage && asset.health !== "error"
  );
  const [phase, setPhase] = useState<BuilderPhase>("idle");
  const [requirement, setRequirement] = useState("");
  const [answers, setAnswers] = useState<HarnessInterviewAnswer[]>([]);
  const [followUp, setFollowUp] = useState<HarnessFollowUpResponse>();
  const [answer, setAnswer] = useState("");
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [template, setTemplate] = useState<HarnessTemplateResponse>();
  const [selectedPath, setSelectedPath] = useState<string>();
  const [workingLabel, setWorkingLabel] = useState("");
  const [error, setError] = useState<string>();
  const [warning, setWarning] = useState<string>();
  const [isDownloading, setIsDownloading] = useState(false);
  const [aiSettings, setAiSettings] = useState<WorkspaceAiSettings>();
  const tree = useMemo(() => buildTemplateTree(template?.files ?? []), [template?.files]);
  const selectedFile = useMemo(
    () => templateFilePreview(template, selectedPath),
    [template, selectedPath]
  );

  useEffect(() => {
    let active = true;
    setAiSettings(undefined);
    void getWorkspaceAiSettings(token, workspace.id)
      .then((result) => {
        if (active) setAiSettings(result);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [token, workspace.id]);

  async function startInterview() {
    const normalized = requirement.trim();
    if (!normalized || usableSkills.length === 0) return;
    setError(undefined);
    setWarning(undefined);
    setTemplate(undefined);
    setAnswers([]);
    setAnswer("");
    setSelectedOptions([]);
    setWorkingLabel("Reviewing the requirement and workspace Skills…");
    setPhase("working");
    try {
      await handleFollowUp(await getForgeFollowUp(token, workspace.id, {
        requirement: normalized,
        answers: []
      }), normalized, []);
    } catch (caught) {
      setError(errorMessage(caught));
      setPhase("idle");
    }
  }

  async function submitAnswer() {
    const question = followUp?.question;
    const normalized = composeAnswer(followUp?.component, selectedOptions, answer);
    if (!question || !normalized) return;
    const nextAnswers = [...answers, { question, answer: normalized }];
    setAnswers(nextAnswers);
    setError(undefined);
    setWorkingLabel("Finding the next useful question…");
    setPhase("working");
    try {
      await handleFollowUp(await getForgeFollowUp(token, workspace.id, {
        requirement: requirement.trim(),
        answers: nextAnswers
      }), requirement.trim(), nextAnswers);
    } catch (caught) {
      setAnswers(answers);
      setError(errorMessage(caught));
      setPhase("question");
    }
  }

  async function handleFollowUp(
    response: HarnessFollowUpResponse,
    normalizedRequirement: string,
    nextAnswers: HarnessInterviewAnswer[]
  ) {
    setWarning(response.warning);
    if (!response.ready && response.question) {
      setFollowUp(response);
      setAnswer("");
      setSelectedOptions([]);
      setPhase("question");
      return;
    }

    setWorkingLabel("Selecting workspace Skills and composing the project harness…");
    const result = await generateForgeTemplate(token, workspace.id, {
      requirement: normalizedRequirement,
      answers: nextAnswers
    });
    setTemplate(result);
    setSelectedPath(result.files[0]?.path);
    setWarning(result.warning ?? response.warning);
    setPhase("complete");
  }

  async function downloadTemplate() {
    if (!template) return;
    setIsDownloading(true);
    setError(undefined);
    try {
      const blob = await downloadForgeTemplate(token, workspace.id, template);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${template.profile.slug}-harness.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsDownloading(false);
    }
  }

  function resetBuilder() {
    setPhase("idle");
    setRequirement("");
    setAnswers([]);
    setFollowUp(undefined);
    setAnswer("");
    setSelectedOptions([]);
    setTemplate(undefined);
    setSelectedPath(undefined);
    setError(undefined);
    setWarning(undefined);
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto pb-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Badge variant={aiSettings?.configured ? "default" : "secondary"} className="gap-1">
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              {aiSettings?.configured
                ? `Workspace AI · ${aiSettings.model}`
                : aiSettings
                  ? "Guided fallback"
                  : "Checking workspace AI"
              }
            </Badge>
            <span className="text-xs text-muted-foreground">
              {usableSkills.length} workspace Skill{usableSkills.length === 1 ? "" : "s"} available
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-2 text-xs text-muted-foreground"
              onClick={onOpenWorkspaceSettings}
            >
              <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
              AI settings
            </Button>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Forge a project harness</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Describe the project, answer a few focused questions, and Harhub will compose a
            reviewable starter framework from Skills already in {workspace.name}.
          </p>
        </div>
        {phase !== "idle" ? (
          <Button type="button" variant="outline" onClick={resetBuilder}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Start over
          </Button>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      {warning ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {warning}
        </div>
      ) : null}

      <div className="grid min-h-[680px] gap-4 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(360px,0.82fr)_minmax(0,1.18fr)]">
        <Card className="flex min-h-0 flex-col overflow-hidden shadow-sm">
          <CardHeader className="shrink-0 border-b">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Bot className="h-5 w-5 text-blue-700" aria-hidden="true" />
              Project discovery
            </CardTitle>
            <CardDescription>
              The interview gives the asset selector enough context without turning setup into a
              long requirements form.
            </CardDescription>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-auto p-5">
            {phase === "idle" ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="project-requirement" className="text-sm font-medium">
                    What do you want to build?
                  </label>
                  <Textarea
                    id="project-requirement"
                    value={requirement}
                    onChange={(event) => setRequirement(event.target.value)}
                    placeholder="Example: Build an internal release assistant that prepares release notes, checks readiness, and gives reviewers a clear handoff."
                    className="min-h-40 resize-y leading-6"
                    maxLength={6000}
                  />
                  <p className="text-xs text-muted-foreground">
                    Include the user, desired outcome, and any important workflow or constraints you
                    already know.
                  </p>
                </div>
                {usableSkills.length === 0 ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                    This workspace has no usable Skills yet. Upload and validate at least one Skill
                    before generating a workspace-based harness.
                  </div>
                ) : (
                  <div className="rounded-lg border bg-muted/35 p-4">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <PackageCheck className="h-4 w-4 text-blue-700" aria-hidden="true" />
                      Workspace catalog is ready
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Harhub will only select non-error Skill packages from this workspace. The full
                      selected packages are copied into the downloaded template.
                    </p>
                  </div>
                )}
                <Button
                  type="button"
                  className="w-full"
                  disabled={!requirement.trim() || usableSkills.length === 0}
                  onClick={() => void startInterview()}
                >
                  Start discovery
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <DiscoverySummary requirement={requirement} answers={answers} />
                {phase === "working" ? (
                  <div className="flex min-h-40 flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 px-6 text-center">
                    <Loader2 className="mb-3 h-6 w-6 animate-spin text-blue-700" aria-hidden="true" />
                    <p className="text-sm font-medium">{workingLabel}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Current workspace assets are part of the selection context.
                    </p>
                  </div>
                ) : null}
                {phase === "question" && followUp?.question && followUp.component ? (
                  <FollowUpQuestion
                    step={answers.length + 1}
                    response={followUp}
                    selectedOptions={selectedOptions}
                    customAnswer={answer}
                    onSelectedOptionsChange={setSelectedOptions}
                    onCustomAnswerChange={setAnswer}
                    onContinue={() => void submitAnswer()}
                  />
                ) : null}
                {phase === "complete" ? (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
                    The starter framework is ready. Review the selected Skills and generated files
                    before downloading it.
                  </div>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="flex min-h-0 flex-col overflow-hidden shadow-sm">
          <CardHeader className="shrink-0 border-b">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <FileArchive className="h-5 w-5 text-blue-700" aria-hidden="true" />
                  Harness framework
                </CardTitle>
                <CardDescription className="mt-1">
                  Generated project context plus complete workspace Skill packages.
                </CardDescription>
              </div>
              {template ? (
                <Button
                  type="button"
                  disabled={isDownloading}
                  onClick={() => void downloadTemplate()}
                >
                  {isDownloading ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Download className="h-4 w-4" aria-hidden="true" />
                  )}
                  Download ZIP
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 p-0">
            {!template ? (
              <TemplateEmptyState />
            ) : (
              <div className="flex h-full min-h-0 flex-col">
                <div className="shrink-0 border-b px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold">{template.profile.name}</h2>
                    <Badge variant="outline">
                      {template.mode === "llm" ? "AI composed" : "Fallback draft"}
                    </Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {template.profile.summary}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {template.selectedAssets.map((asset) => (
                      <div
                        key={asset.id}
                        className="max-w-full rounded-md border bg-muted/30 px-3 py-2"
                      >
                        <div className="flex items-center gap-1.5 text-xs font-semibold">
                          <PackageCheck className="h-3.5 w-3.5 text-blue-700" aria-hidden="true" />
                          {asset.displayName}
                        </div>
                        <p className="mt-1 max-w-sm text-[11px] leading-4 text-muted-foreground">
                          {asset.reason}
                        </p>
                      </div>
                    ))}
                    {template.selectedAssets.length === 0 ? (
                      <span className="text-xs text-amber-700">No workspace Skill was selected.</span>
                    ) : null}
                  </div>
                </div>
                <div className="grid min-h-[480px] flex-1 lg:min-h-0 lg:grid-cols-[250px_minmax(0,1fr)]">
                  <div className="min-h-0 overflow-auto border-b p-3 lg:border-b-0 lg:border-r">
                    <div className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Framework preview
                    </div>
                    <FileTree
                      nodes={tree}
                      selectedPath={selectedPath}
                      onSelect={setSelectedPath}
                    />
                    <p className="mt-3 border-t px-2 pt-3 text-[11px] leading-4 text-muted-foreground">
                      Selected Skill package contents are added to the ZIP under
                      {" "}<code>.harness/skills/</code>.
                    </p>
                  </div>
                  <FilePreviewPane file={selectedFile} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function DiscoverySummary({
  requirement,
  answers
}: {
  requirement: string;
  answers: HarnessInterviewAnswer[];
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-muted/25 px-4 py-3">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Project brief
        </div>
        <p className="text-sm leading-6">{requirement}</p>
      </div>
      {answers.map((item, index) => (
        <div key={`${item.question}-${index}`} className="rounded-lg border px-4 py-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium text-muted-foreground">Step {index + 1}</div>
              <p className="mt-0.5 text-sm font-medium leading-5">{item.question}</p>
              <p className="mt-1 text-sm leading-5 text-blue-800">{item.answer}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function FollowUpQuestion({
  step,
  response,
  selectedOptions,
  customAnswer,
  onSelectedOptionsChange,
  onCustomAnswerChange,
  onContinue
}: {
  step: number;
  response: HarnessFollowUpResponse;
  selectedOptions: string[];
  customAnswer: string;
  onSelectedOptionsChange: (options: string[]) => void;
  onCustomAnswerChange: (answer: string) => void;
  onContinue: () => void;
}) {
  const component = response.component;
  if (!response.question || !component) return null;

  const selectionLimit = component.maxSelections ?? component.options.length;
  const selectionLimitReached = selectedOptions.length >= selectionLimit;
  const isComplete = Boolean(composeAnswer(component, selectedOptions, customAnswer));
  const fieldLabel = component.type === "single-select"
    ? "Select one"
    : component.type === "multi-select"
      ? `Select up to ${selectionLimit}`
      : "Write an answer";
  const FieldIcon = component.type === "single-select"
    ? MousePointerClick
    : component.type === "multi-select"
      ? ListChecks
      : MessageSquareText;

  const toggleOption = (label: string) => {
    if (component.type === "single-select") {
      onSelectedOptionsChange([label]);
      return;
    }
    if (selectedOptions.includes(label)) {
      onSelectedOptionsChange(selectedOptions.filter((item) => item !== label));
      return;
    }
    if (!selectionLimitReached) onSelectedOptionsChange([...selectedOptions, label]);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-blue-200 bg-background shadow-sm">
      <div className="border-b border-blue-100 bg-blue-50/70 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-blue-800">
            Follow-up {step}
          </span>
          <Badge variant="outline" className="bg-background/80 text-[10px] uppercase">
            {response.mode === "llm" ? "AI" : "Guided fallback"}
          </Badge>
        </div>
        <p className="mt-2 font-medium leading-6 text-blue-950">{response.question}</p>
        <div className="mt-2 flex items-center gap-1.5 text-xs text-blue-700">
          <FieldIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {fieldLabel}
        </div>
      </div>

      <div className="space-y-3 p-4">
        {component.type === "single-select" ? (
          <div className="grid gap-2" role="radiogroup" aria-label={response.question}>
            {component.options.map((option) => {
              const selected = selectedOptions.includes(option.label);
              return (
                <Button
                  key={option.label}
                  type="button"
                  variant="outline"
                  role="radio"
                  aria-checked={selected}
                  className={cn(
                    "h-auto min-h-14 justify-start whitespace-normal px-3 py-2.5 text-left",
                    selected && "border-blue-500 bg-blue-50 text-blue-950 hover:bg-blue-50"
                  )}
                  onClick={() => toggleOption(option.label)}
                >
                  <span className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                    selected ? "border-blue-600 bg-blue-600 text-white" : "border-muted-foreground/35"
                  )}>
                    {selected ? <Check className="h-3 w-3" aria-hidden="true" /> : null}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{option.label}</span>
                    {option.description ? (
                      <span className="mt-0.5 block text-xs font-normal leading-4 text-muted-foreground">
                        {option.description}
                      </span>
                    ) : null}
                  </span>
                </Button>
              );
            })}
          </div>
        ) : null}

        {component.type === "multi-select" ? (
          <div className="grid gap-2" aria-label={response.question}>
            {component.options.map((option) => {
              const selected = selectedOptions.includes(option.label);
              const disabled = !selected && selectionLimitReached;
              return (
                <label
                  key={option.label}
                  className={cn(
                    "flex min-h-14 cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 transition-colors",
                    selected && "border-blue-500 bg-blue-50",
                    disabled && "cursor-not-allowed opacity-50"
                  )}
                >
                  <Checkbox
                    checked={selected}
                    disabled={disabled}
                    aria-label={option.label}
                    className="mt-0.5"
                    onCheckedChange={() => toggleOption(option.label)}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{option.label}</span>
                    {option.description ? (
                      <span className="mt-0.5 block text-xs leading-4 text-muted-foreground">
                        {option.description}
                      </span>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </div>
        ) : null}

        {component.type === "text" ? (
          <Textarea
            value={customAnswer}
            onChange={(event) => onCustomAnswerChange(event.target.value)}
            placeholder={component.placeholder ?? "Add the detail that will help shape the harness…"}
            className="min-h-28 resize-y"
            maxLength={2000}
            autoFocus
          />
        ) : null}

        {component.type !== "text" && component.allowCustom ? (
          <div className="space-y-1.5 border-t pt-3">
            <label htmlFor={`forge-custom-answer-${step}`} className="text-xs font-medium">
              Add context or another answer <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <Textarea
              id={`forge-custom-answer-${step}`}
              value={customAnswer}
              onChange={(event) => onCustomAnswerChange(event.target.value)}
              placeholder="Add a constraint, exception, or answer that is not listed…"
              className="min-h-20 resize-y"
              maxLength={2000}
            />
          </div>
        ) : null}

        <Button
          type="button"
          className="w-full"
          disabled={!isComplete}
          onClick={onContinue}
        >
          {isComplete ? (
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          )}
          Save answer and continue
        </Button>
      </div>
    </div>
  );
}

function TemplateEmptyState() {
  return (
    <div className="flex h-full min-h-[520px] items-center justify-center p-8">
      <div className="max-w-md text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-800">
          <Sparkles className="h-6 w-6" aria-hidden="true" />
        </div>
        <h2 className="mt-4 font-semibold">Your composed framework will appear here</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Harhub will create the project brief, agent bridge, technical context, rules, delivery
          workflow, change log, and a curated set of complete Skills from the current workspace.
        </p>
      </div>
    </div>
  );
}

function templateFilePreview(
  template: HarnessTemplateResponse | undefined,
  selectedPath: string | undefined
): AssetFilePreview | undefined {
  const file = template?.files.find((item) => item.path === selectedPath);
  if (!file) return undefined;
  return {
    path: file.path,
    name: file.path.split("/").pop() ?? file.path,
    size: new TextEncoder().encode(file.content).byteLength,
    isText: true,
    truncated: false,
    content: file.content
  };
}

function buildTemplateTree(files: HarnessTemplateResponse["files"]): AssetFileTreeNode[] {
  type MutableNode = AssetFileTreeNode & { childMap?: Map<string, MutableNode> };
  const roots = new Map<string, MutableNode>();

  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    let level = roots;
    let currentPath = "";
    parts.forEach((part, index) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isFile = index === parts.length - 1;
      let node = level.get(part);
      if (!node) {
        node = {
          name: part,
          path: currentPath,
          type: isFile ? "file" : "directory",
          ...(isFile ? {} : { children: [], childMap: new Map() })
        };
        level.set(part, node);
      }
      if (!isFile) {
        node.childMap ??= new Map();
        level = node.childMap;
      }
    });
  }

  return finalizeTree(roots.values());
}

function finalizeTree(
  nodes: Iterable<AssetFileTreeNode & { childMap?: Map<string, AssetFileTreeNode> }>
): AssetFileTreeNode[] {
  return Array.from(nodes)
    .sort((left, right) => left.type === right.type
      ? left.name.localeCompare(right.name)
      : left.type === "directory" ? -1 : 1)
    .map((node) => ({
      name: node.name,
      path: node.path,
      type: node.type,
      children: node.childMap ? finalizeTree(node.childMap.values()) : undefined
    }));
}

function composeAnswer(
  component: HarnessFollowUpComponent | undefined,
  selectedOptions: string[],
  customAnswer: string
): string {
  if (!component) return "";
  const custom = customAnswer.trim();
  if (component.type === "text") return custom;
  return [...selectedOptions, ...(custom ? [custom] : [])].join("; ");
}

function errorMessage(caught: unknown): string {
  return caught instanceof Error ? caught.message : String(caught);
}
