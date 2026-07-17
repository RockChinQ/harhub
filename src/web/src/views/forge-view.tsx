import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  Download,
  FileArchive,
  History,
  ListChecks,
  Loader2,
  MessageSquareText,
  MousePointerClick,
  PackageCheck,
  RotateCcw,
  Settings2,
  Sparkles,
  Trash2
} from "lucide-react";

import type {
  AssetFilePreview,
  AssetFileTreeNode,
  AssetRecord,
  ForgeSessionDetail,
  ForgeSessionListResponse,
  ForgeSessionSummary,
  HarnessFollowUpComponent,
  HarnessFollowUpRequest,
  HarnessFollowUpResponse,
  HarnessInterviewAnswer,
  HarnessTemplateResponse,
  WorkspaceAiSettings,
  WorkspaceRecord
} from "../../../shared/types";
import { Badge } from "../components/ui/badge";
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
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "../components/ui/card";
import { Checkbox } from "../components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "../components/ui/sheet";
import { Textarea } from "../components/ui/textarea";
import {
  createForgeSession,
  deleteForgeSession,
  downloadForgeTemplate,
  generateForgeTemplate,
  getForgeSession,
  getWorkspaceAiSettings,
  getForgeFollowUp,
  listForgeSessions
} from "../lib/api";
import { cn } from "../lib/utils";
import { FilePreviewPane } from "./assets/file-preview-pane";
import { FileTree } from "./assets/file-tree";

type BuilderPhase = "idle" | "question" | "working" | "failed" | "complete";

type ForgeRetryAction =
  | { kind: "start" }
  | { kind: "follow-up" | "generate"; input: HarnessFollowUpRequest };

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
  const [retryAction, setRetryAction] = useState<ForgeRetryAction>();
  const [isDownloading, setIsDownloading] = useState(false);
  const [aiSettings, setAiSettings] = useState<WorkspaceAiSettings>();
  const [activeSessionId, setActiveSessionId] = useState<string>();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<ForgeSessionListResponse>();
  const [historyError, setHistoryError] = useState<string>();
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [loadingSessionId, setLoadingSessionId] = useState<string>();
  const [sessionToDelete, setSessionToDelete] = useState<ForgeSessionSummary>();
  const [isDeletingSession, setIsDeletingSession] = useState(false);
  const historyScope = `${workspace.id}\u0000${token}`;
  const historyScopeRef = useRef(historyScope);
  historyScopeRef.current = historyScope;
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

  useEffect(() => {
    setPhase("idle");
    setRequirement("");
    setAnswers([]);
    setFollowUp(undefined);
    setAnswer("");
    setSelectedOptions([]);
    setTemplate(undefined);
    setSelectedPath(undefined);
    setError(undefined);
    setRetryAction(undefined);
    setActiveSessionId(undefined);
    setHistory(undefined);
    setHistoryError(undefined);
    setHistoryOpen(false);
    setIsHistoryLoading(false);
    setLoadingSessionId(undefined);
    setSessionToDelete(undefined);
    setIsDeletingSession(false);
  }, [token, workspace.id]);

  async function startInterview() {
    const normalized = requirement.trim();
    if (!normalized || usableSkills.length === 0) return;
    setError(undefined);
    setRetryAction(undefined);
    setTemplate(undefined);
    setAnswers([]);
    setAnswer("");
    setSelectedOptions([]);
    setWorkingLabel("Reviewing the requirement and workspace Skills…");
    setPhase("working");
    let session: ForgeSessionDetail;
    try {
      session = await createForgeSession(token, workspace.id, normalized);
    } catch (caught) {
      setForgeFailure({ kind: "start" }, caught);
      return;
    }
    setActiveSessionId(session.id);
    addSessionToLoadedHistory(session);
    await requestFollowUp({
      requirement: normalized,
      answers: [],
      sessionId: session.id
    });
  }

  async function submitAnswer() {
    const question = followUp?.question;
    const normalized = composeAnswer(followUp?.component, selectedOptions, answer);
    if (!question || !normalized) return;
    const nextAnswers = [...answers, { question, answer: normalized }];
    setAnswers(nextAnswers);
    await requestFollowUp({
      requirement: requirement.trim(),
      answers: nextAnswers,
      ...(activeSessionId ? { sessionId: activeSessionId } : {})
    });
  }

  async function generateFromCurrentContext() {
    const question = followUp?.question;
    const draftAnswer = composeAnswer(followUp?.component, selectedOptions, answer);
    const nextAnswers = question && draftAnswer
      ? [...answers, { question, answer: draftAnswer }]
      : answers;
    if (nextAnswers !== answers) setAnswers(nextAnswers);
    await requestTemplate({
      requirement: requirement.trim(),
      answers: nextAnswers,
      ...(activeSessionId ? { sessionId: activeSessionId } : {})
    });
  }

  async function requestFollowUp(input: HarnessFollowUpRequest) {
    setError(undefined);
    setRetryAction(undefined);
    setWorkingLabel(input.answers.length
      ? "Finding the next useful question…"
      : "Reviewing the requirement and workspace Skills…");
    setPhase("working");
    let response: HarnessFollowUpResponse;
    try {
      response = await getForgeFollowUp(token, workspace.id, input);
    } catch (caught) {
      setForgeFailure({ kind: "follow-up", input }, caught);
      return;
    }

    if (!response.ready && response.question) {
      setFollowUp(response);
      setAnswer("");
      setSelectedOptions([]);
      setPhase("question");
      return;
    }
    await requestTemplate(input);
  }

  async function requestTemplate(input: HarnessFollowUpRequest) {
    setError(undefined);
    setRetryAction(undefined);
    setWorkingLabel("Selecting workspace Skills and composing the project harness…");
    setPhase("working");
    let result: HarnessTemplateResponse;
    try {
      result = await generateForgeTemplate(token, workspace.id, input);
    } catch (caught) {
      setForgeFailure({ kind: "generate", input }, caught);
      return;
    }
    setTemplate(result);
    setSelectedPath(result.files[0]?.path);
    setPhase("complete");
    if (history) void refreshHistory();
  }

  async function retryFailedOperation() {
    const action = retryAction;
    if (!action) return;
    if (action.kind === "start") {
      await startInterview();
      return;
    }
    setAnswers(action.input.answers);
    if (action.kind === "follow-up") await requestFollowUp(action.input);
    else await requestTemplate(action.input);
  }

  function setForgeFailure(action: ForgeRetryAction, caught: unknown) {
    setError(errorMessage(caught));
    setRetryAction(action);
    setPhase("failed");
  }

  async function refreshHistory() {
    const requestScope = historyScope;
    setIsHistoryLoading(true);
    setHistoryError(undefined);
    try {
      const result = await listForgeSessions(token, workspace.id);
      if (historyScopeRef.current === requestScope) setHistory(result);
    } catch (caught) {
      if (historyScopeRef.current === requestScope) setHistoryError(errorMessage(caught));
    } finally {
      if (historyScopeRef.current === requestScope) setIsHistoryLoading(false);
    }
  }

  function addSessionToLoadedHistory(session: ForgeSessionDetail) {
    setHistory((current) => current ? {
      ...current,
      sessions: [toSessionSummary(session), ...current.sessions]
        .slice(0, current.cache.maxSessions)
    } : current);
  }

  async function restoreSession(summary: ForgeSessionSummary) {
    setLoadingSessionId(summary.id);
    setHistoryError(undefined);
    setError(undefined);
    setRetryAction(undefined);
    try {
      const session = await getForgeSession(token, workspace.id, summary.id);
      const storedTemplate = session.template?.mode === "llm" ? session.template : undefined;
      const storedFollowUp = session.followUp?.mode === "llm" ? session.followUp : undefined;
      setActiveSessionId(session.id);
      setRequirement(session.requirement);
      setAnswers(session.answers);
      setFollowUp(storedFollowUp);
      setAnswer("");
      setSelectedOptions([]);
      setTemplate(storedTemplate);
      setSelectedPath(storedTemplate?.files[0]?.path);
      setHistoryOpen(false);

      if (storedTemplate) {
        setPhase("complete");
        return;
      }
      if (storedFollowUp && !storedFollowUp.ready && storedFollowUp.question) {
        setPhase("question");
        return;
      }

      const input = {
        requirement: session.requirement,
        answers: session.answers,
        sessionId: session.id
      };
      if (storedFollowUp?.ready) await requestTemplate(input);
      else await requestFollowUp(input);
    } catch (caught) {
      const message = errorMessage(caught);
      setHistoryError(message);
      setError(message);
      setPhase("idle");
    } finally {
      setLoadingSessionId(undefined);
    }
  }

  async function removeSession() {
    if (!sessionToDelete) return;
    setIsDeletingSession(true);
    setHistoryError(undefined);
    try {
      await deleteForgeSession(token, workspace.id, sessionToDelete.id);
      setHistory((current) => current ? {
        ...current,
        sessions: current.sessions.filter((item) => item.id !== sessionToDelete.id)
      } : current);
      if (activeSessionId === sessionToDelete.id) resetBuilder();
      setSessionToDelete(undefined);
    } catch (caught) {
      setHistoryError(errorMessage(caught));
    } finally {
      setIsDeletingSession(false);
    }
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
    setActiveSessionId(undefined);
    setPhase("idle");
    setRequirement("");
    setAnswers([]);
    setFollowUp(undefined);
    setAnswer("");
    setSelectedOptions([]);
    setTemplate(undefined);
    setSelectedPath(undefined);
    setError(undefined);
    setRetryAction(undefined);
  }

  if (!aiSettings) {
    return (
      <section className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
        <Card className="w-full max-w-lg shadow-sm">
          <CardContent className="flex min-h-64 flex-col items-center justify-center p-8 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-blue-700" aria-hidden="true" />
            <p className="mt-4 text-sm font-medium">Checking workspace AI configuration…</p>
          </CardContent>
        </Card>
      </section>
    );
  }

  if (!aiSettings.configured) {
    return (
      <section className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
        <Card className="w-full max-w-lg shadow-sm">
          <CardContent className="flex flex-col items-center p-8 text-center sm:p-10">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <Bot className="h-6 w-6" aria-hidden="true" />
            </div>
            <h1 className="mt-5 text-xl font-semibold tracking-tight">
              Configure workspace AI to use Forge
            </h1>
            <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
              {aiSettings.canManage
                ? "Forge needs a tested OpenAI-compatible provider before it can ask follow-up questions and generate a project framework."
                : "Forge needs workspace AI before it can ask follow-up questions and generate a project framework. Ask a workspace owner or admin to configure it."
              }
            </p>
            <Button type="button" className="mt-6" onClick={onOpenWorkspaceSettings}>
              <Settings2 className="h-4 w-4" aria-hidden="true" />
              Open workspace settings
            </Button>
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto pb-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Badge className="gap-1">
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              Workspace AI · {aiSettings.model}
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
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setHistoryOpen(true);
              void refreshHistory();
            }}
          >
            <History className="h-4 w-4" aria-hidden="true" />
            History
            {history?.sessions.length ? (
              <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">
                {history.sessions.length}
              </Badge>
            ) : null}
          </Button>
          {phase !== "idle" ? (
            <Button type="button" variant="outline" onClick={resetBuilder}>
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Start over
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="flex flex-col gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-3 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
          <p className="leading-5">{error}</p>
          {retryAction ? (
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void retryFailedOperation()}
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Retry
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={onOpenWorkspaceSettings}>
                <Settings2 className="h-4 w-4" aria-hidden="true" />
                AI settings
              </Button>
            </div>
          ) : null}
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
                  disabled={
                    !requirement.trim() ||
                    usableSkills.length === 0
                  }
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
                    onGenerate={() => void generateFromCurrentContext()}
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
                    <Badge variant="outline">AI composed</Badge>
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

      <ForgeHistoryPanel
        open={historyOpen}
        history={history}
        error={historyError}
        loading={isHistoryLoading}
        loadingSessionId={loadingSessionId}
        activeSessionId={activeSessionId}
        sessionToDelete={sessionToDelete}
        deleting={isDeletingSession}
        onOpenChange={(open) => {
          setHistoryOpen(open);
          if (!open) setHistoryError(undefined);
        }}
        onRefresh={() => void refreshHistory()}
        onRestore={(session) => void restoreSession(session)}
        onRequestDelete={setSessionToDelete}
        onDeleteOpenChange={(open) => {
          if (!open && !isDeletingSession) setSessionToDelete(undefined);
        }}
        onConfirmDelete={() => void removeSession()}
      />
    </section>
  );
}

function ForgeHistoryPanel({
  open,
  history,
  error,
  loading,
  loadingSessionId,
  activeSessionId,
  sessionToDelete,
  deleting,
  onOpenChange,
  onRefresh,
  onRestore,
  onRequestDelete,
  onDeleteOpenChange,
  onConfirmDelete
}: {
  open: boolean;
  history?: ForgeSessionListResponse;
  error?: string;
  loading: boolean;
  loadingSessionId?: string;
  activeSessionId?: string;
  sessionToDelete?: ForgeSessionSummary;
  deleting: boolean;
  onOpenChange: (open: boolean) => void;
  onRefresh: () => void;
  onRestore: (session: ForgeSessionSummary) => void;
  onRequestDelete: (session: ForgeSessionSummary) => void;
  onDeleteOpenChange: (open: boolean) => void;
  onConfirmDelete: () => void;
}) {
  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
          <SheetHeader className="shrink-0 border-b p-6 pr-12">
            <div className="flex items-start justify-between gap-3">
              <div>
                <SheetTitle className="flex items-center gap-2">
                  <History className="h-5 w-5 text-blue-700" aria-hidden="true" />
                  Forge history
                </SheetTitle>
                <SheetDescription className="mt-2 leading-5">
                  Resume your private sessions in this workspace. Details are loaded only when you
                  open a session.
                </SheetDescription>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={loading}
                onClick={onRefresh}
              >
                <RotateCcw className={cn("h-4 w-4", loading && "animate-spin")} aria-hidden="true" />
                <span className="sr-only">Refresh history</span>
              </Button>
            </div>
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-auto p-4">
            {error ? (
              <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            {loading && !history ? (
              <div className="flex min-h-48 items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                Loading session summaries…
              </div>
            ) : history?.sessions.length ? (
              <div className="space-y-2">
                {history.sessions.map((session) => {
                  const restoring = loadingSessionId === session.id;
                  return (
                    <div
                      key={session.id}
                      className="flex items-stretch gap-1 rounded-lg border bg-background p-1 shadow-sm"
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-auto min-w-0 flex-1 items-start justify-start whitespace-normal px-3 py-3 text-left"
                        disabled={Boolean(loadingSessionId)}
                        onClick={() => onRestore(session)}
                      >
                        {restoring ? (
                          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
                        ) : (
                          <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" aria-hidden="true" />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-2 block text-sm font-medium leading-5">
                            {session.title}
                          </span>
                          <span className="mt-2 flex flex-wrap items-center gap-1.5">
                            <Badge
                              variant={session.status === "complete" ? "default" : "secondary"}
                              className="text-[10px]"
                            >
                              {session.status === "complete" ? "Ready" : "In progress"}
                            </Badge>
                            {activeSessionId === session.id ? (
                              <Badge variant="outline" className="text-[10px]">Open</Badge>
                            ) : null}
                            <span className="text-[11px] font-normal text-muted-foreground">
                              {session.answerCount} answer{session.answerCount === 1 ? "" : "s"}
                              {" · "}{formatSessionTime(session.updatedAt)}
                            </span>
                          </span>
                        </span>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="mt-1 shrink-0 text-muted-foreground hover:text-destructive"
                        disabled={Boolean(loadingSessionId)}
                        onClick={() => onRequestDelete(session)}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        <span className="sr-only">Delete {session.title}</span>
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : !loading ? (
              <div className="flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed px-6 text-center">
                <History className="mb-3 h-6 w-6 text-muted-foreground" aria-hidden="true" />
                <p className="text-sm font-medium">No Forge sessions yet</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Start discovery and your progress will appear here.
                </p>
              </div>
            ) : null}
          </div>

          <div className="shrink-0 border-t bg-muted/25 px-5 py-3 text-[11px] leading-4 text-muted-foreground">
            Keeps the latest {history?.cache.maxSessions ?? 12} sessions for up to
            {" "}{history?.cache.ttlDays ?? 30} days. Session responses are marked no-store and
            are never shared with other workspace members.
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={Boolean(sessionToDelete)} onOpenChange={onDeleteOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this Forge session?</AlertDialogTitle>
            <AlertDialogDescription>
              “{sessionToDelete?.title}” and its generated preview will be removed from your
              workspace history. Downloaded ZIP files are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={onConfirmDelete}
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Delete session
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function toSessionSummary(session: ForgeSessionDetail): ForgeSessionSummary {
  return {
    id: session.id,
    title: session.title,
    status: session.status,
    answerCount: session.answerCount,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    expiresAt: session.expiresAt
  };
}

function formatSessionTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
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
  onContinue,
  onGenerate
}: {
  step: number;
  response: HarnessFollowUpResponse;
  selectedOptions: string[];
  customAnswer: string;
  onSelectedOptionsChange: (options: string[]) => void;
  onCustomAnswerChange: (answer: string) => void;
  onContinue: () => void;
  onGenerate: () => void;
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
            AI
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

        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            type="button"
            disabled={!isComplete}
            onClick={onContinue}
          >
            {isComplete ? (
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            )}
            Save and continue
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onGenerate}
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            Generate framework now
          </Button>
        </div>
        <p className="text-center text-xs leading-5 text-muted-foreground">
          Generate at any time using the answers so far. A filled current answer is included.
        </p>
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
