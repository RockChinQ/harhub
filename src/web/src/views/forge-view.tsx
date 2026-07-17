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
  AssetRecord,
  ForgeAiOperationFailure,
  ForgeGenerationProgressStatus,
  ForgeGenerationProgressStep,
  ForgeOperationStreamEvent,
  ForgeSessionDetail,
  ForgeSessionListResponse,
  ForgeSessionSummary,
  HarnessFollowUpComponent,
  HarnessFollowUpQuestion,
  HarnessFollowUpResponse,
  HarnessInterviewAnswer,
  HarnessTemplateResponse,
  WorkspaceAiSettings,
  WorkspaceRecord
} from "../../../shared/types";
import { MIN_FORGE_INTERVIEW_ANSWERS } from "../../../shared/forge";
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
  getForgeSession,
  getWorkspaceAssetPreview,
  getWorkspaceAssetTree,
  getWorkspaceAiSettings,
  listForgeSessions,
  streamForgeOperation
} from "../lib/api";
import { cn } from "../lib/utils";
import { FilePreviewPane } from "./assets/file-preview-pane";
import { FileTree } from "./assets/file-tree";
import {
  buildForgeFrameworkTree,
  prefixForgeSkillFilePreview,
  resolveForgeSkillFile,
  type ForgeSelectedSkillTree
} from "./forge-framework-preview";

type BuilderPhase = "idle" | "question" | "working" | "failed" | "complete";

type ForgeRetryAction =
  | { kind: "start" }
  | { kind: "follow-up" | "generate" };

type GenerationProgressState = Record<
  ForgeGenerationProgressStep,
  ForgeGenerationProgressStatus | "pending"
>;

interface FollowUpAnswerDraft {
  selectedOptions: string[];
  customAnswer: string;
}

const MAX_FORGE_SKILL_FILE_CACHE_ENTRIES = 12;

const GENERATION_STEPS: Array<{
  id: ForgeGenerationProgressStep;
  title: string;
  description: string;
}> = [
  {
    id: "context",
    title: "Prepare discovery context",
    description: "Restore the requirement and essential interview answers from this session."
  },
  {
    id: "assets",
    title: "Load workspace Skills",
    description: "Collect the usable Skill assets available to this workspace."
  },
  {
    id: "compose",
    title: "Compose harness blueprint",
    description: "Stream the project profile, asset selection, workflow, and agent rules."
  },
  {
    id: "save",
    title: "Assemble and save framework",
    description: "Build the reviewable files and persist the completed session result."
  }
];

export function ForgeView({
  token,
  workspace,
  assets,
  routedSessionId,
  onNavigateSession,
  onOpenWorkspaceSettings
}: {
  token: string;
  workspace: WorkspaceRecord;
  assets: AssetRecord[];
  routedSessionId?: string;
  onNavigateSession: (sessionId?: string) => void;
  onOpenWorkspaceSettings: () => void;
}) {
  const usableSkills = assets.filter(
    (asset) => asset.kind === "skill" && asset.storage && asset.health !== "error"
  );
  const [phase, setPhase] = useState<BuilderPhase>("idle");
  const [requirement, setRequirement] = useState("");
  const [answers, setAnswers] = useState<HarnessInterviewAnswer[]>([]);
  const [followUp, setFollowUp] = useState<HarnessFollowUpResponse>();
  const [answerDrafts, setAnswerDrafts] = useState<FollowUpAnswerDraft[]>([]);
  const [template, setTemplate] = useState<HarnessTemplateResponse>();
  const [selectedPath, setSelectedPath] = useState<string>();
  const [workingLabel, setWorkingLabel] = useState("");
  const [workingOperation, setWorkingOperation] = useState<"follow-up" | "generate">();
  const [liveOutput, setLiveOutput] = useState("");
  const [liveAttempt, setLiveAttempt] = useState<{ attempt: number; maxAttempts: number }>();
  const [generationProgress, setGenerationProgress] = useState<GenerationProgressState>(
    initialGenerationProgress
  );
  const [error, setError] = useState<string>();
  const [operationFailure, setOperationFailure] = useState<ForgeAiOperationFailure>();
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
  const [skillTrees, setSkillTrees] = useState<ForgeSelectedSkillTree[]>([]);
  const [isSkillTreeLoading, setIsSkillTreeLoading] = useState(false);
  const [skillTreeError, setSkillTreeError] = useState<string>();
  const [skillTreeRefreshKey, setSkillTreeRefreshKey] = useState(0);
  const [selectedSkillFile, setSelectedSkillFile] = useState<AssetFilePreview>();
  const [isSkillFileLoading, setIsSkillFileLoading] = useState(false);
  const [skillFileError, setSkillFileError] = useState<string>();
  const [skillFileRefreshKey, setSkillFileRefreshKey] = useState(0);
  const historyScope = `${workspace.id}\u0000${token}`;
  const historyScopeRef = useRef(historyScope);
  const routeSessionLoadRef = useRef<string | undefined>(undefined);
  const routedSessionIdRef = useRef(routedSessionId);
  const activeSessionIdRef = useRef<string | undefined>(undefined);
  const discoveryScrollRef = useRef<HTMLDivElement | null>(null);
  const skillFileCacheRef = useRef(new Map<string, AssetFilePreview>());
  historyScopeRef.current = historyScope;
  routedSessionIdRef.current = routedSessionId;
  activeSessionIdRef.current = activeSessionId;
  const tree = useMemo(
    () => buildForgeFrameworkTree(template?.files ?? [], skillTrees),
    [skillTrees, template?.files]
  );
  const generatedSelectedFile = useMemo(
    () => templateFilePreview(template, selectedPath),
    [template, selectedPath]
  );
  const selectedSkillTarget = useMemo(
    () => resolveForgeSkillFile(template?.selectedAssets ?? [], selectedPath),
    [selectedPath, template?.selectedAssets]
  );
  const selectedFile = generatedSelectedFile ?? (
    selectedSkillFile?.path === selectedPath ? selectedSkillFile : undefined
  );
  const skillTreeMarkers = useMemo(() => Object.fromEntries(
    skillTrees.map((skill) => [skill.installPath, "Skill"])
  ), [skillTrees]);
  const currentQuestions = useMemo(() => followUpQuestions(followUp), [followUp]);
  const streamingText = useMemo(
    () => workingOperation === "generate"
      ? extractFirstPartialJsonString(liveOutput, ["name", "summary"])
      : extractFirstPartialJsonString(liveOutput, ["question"]),
    [liveOutput, workingOperation]
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
    if (!routedSessionId) {
      routeSessionLoadRef.current = undefined;
      setLoadingSessionId(undefined);
      if (activeSessionId) clearBuilderState();
      return;
    }
    if (routedSessionId === activeSessionId) {
      routeSessionLoadRef.current = undefined;
      setLoadingSessionId(undefined);
      return;
    }

    const loadKey = `${workspace.id}\u0000${routedSessionId}`;
    if (routeSessionLoadRef.current === loadKey) return;
    routeSessionLoadRef.current = loadKey;
    void restoreSessionById(routedSessionId).finally(() => {
      if (routeSessionLoadRef.current === loadKey) routeSessionLoadRef.current = undefined;
    });
  }, [activeSessionId, routedSessionId, token, workspace.id]);

  useEffect(() => {
    if (phase !== "question" || currentQuestions.length === 0) return;
    const animationFrame = window.requestAnimationFrame(() => {
      const panel = discoveryScrollRef.current;
      if (!panel) return;
      panel.scrollTo({ top: panel.scrollHeight, behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(animationFrame);
  }, [answers.length, currentQuestions, phase]);

  useEffect(() => {
    let active = true;
    const selectedAssets = template?.selectedAssets ?? [];
    setSkillTrees([]);
    setSkillTreeError(undefined);
    setIsSkillTreeLoading(false);
    setSelectedSkillFile(undefined);
    setSkillFileError(undefined);
    setIsSkillFileLoading(false);
    skillFileCacheRef.current.clear();

    if (selectedAssets.length === 0) return () => {
      active = false;
    };

    setIsSkillTreeLoading(true);
    void Promise.allSettled(selectedAssets.map(async (asset) => {
      const preview = await getWorkspaceAssetTree(token, workspace.id, asset.id);
      return {
        assetId: asset.id,
        installPath: asset.installPath,
        tree: preview.tree
      } satisfies ForgeSelectedSkillTree;
    })).then((results) => {
      if (!active) return;
      const loaded = results.flatMap((result) => result.status === "fulfilled"
        ? [result.value]
        : []);
      const failedCount = results.length - loaded.length;
      setSkillTrees(loaded);
      if (failedCount > 0) {
        setSkillTreeError(
          `${failedCount} of ${results.length} selected Skill file trees could not be loaded.`
        );
      }
    }).finally(() => {
      if (active) setIsSkillTreeLoading(false);
    });

    return () => {
      active = false;
    };
  }, [skillTreeRefreshKey, template, token, workspace.id]);

  useEffect(() => {
    let active = true;
    setSelectedSkillFile(undefined);
    setSkillFileError(undefined);
    setIsSkillFileLoading(false);

    if (generatedSelectedFile || !selectedSkillTarget || !selectedPath) {
      return () => {
        active = false;
      };
    }

    const cacheKey = [
      workspace.id,
      selectedSkillTarget.assetId,
      selectedSkillTarget.relativePath
    ].join("\u0000");
    const cached = skillFileCacheRef.current.get(cacheKey);
    if (cached) {
      skillFileCacheRef.current.delete(cacheKey);
      skillFileCacheRef.current.set(cacheKey, cached);
      setSelectedSkillFile(cached);
      return () => {
        active = false;
      };
    }

    setIsSkillFileLoading(true);
    void getWorkspaceAssetPreview(
      token,
      workspace.id,
      selectedSkillTarget.assetId,
      selectedSkillTarget.relativePath
    ).then((preview) => {
      if (!preview.selectedFile) {
        throw new Error("The selected Skill file is unavailable for preview.");
      }
      const file = prefixForgeSkillFilePreview(
        preview.selectedFile,
        selectedSkillTarget.installPath
      );
      if (!active) return;
      cacheForgeSkillFile(skillFileCacheRef.current, cacheKey, file);
      setSelectedSkillFile(file);
    }).catch((caught) => {
      if (active) setSkillFileError(errorMessage(caught));
    }).finally(() => {
      if (active) setIsSkillFileLoading(false);
    });

    return () => {
      active = false;
    };
  }, [
    generatedSelectedFile,
    selectedPath,
    selectedSkillTarget,
    skillFileRefreshKey,
    token,
    workspace.id
  ]);

  useEffect(() => {
    setPhase("idle");
    setRequirement("");
    setAnswers([]);
    setFollowUp(undefined);
    setAnswerDrafts([]);
    setTemplate(undefined);
    setSelectedPath(undefined);
    setError(undefined);
    setOperationFailure(undefined);
    setRetryAction(undefined);
    setWorkingOperation(undefined);
    setLiveOutput("");
    setLiveAttempt(undefined);
    setGenerationProgress(initialGenerationProgress());
    setActiveSessionId(undefined);
    activeSessionIdRef.current = undefined;
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
    setOperationFailure(undefined);
    setRetryAction(undefined);
    setTemplate(undefined);
    setAnswers([]);
    setAnswerDrafts([]);
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
    activeSessionIdRef.current = session.id;
    onNavigateSession(session.id);
    addSessionToLoadedHistory(session);
    await requestOperation(session.id, "follow-up");
  }

  async function submitAnswers() {
    const submittedAnswers = composeFollowUpAnswers(currentQuestions, answerDrafts);
    if (
      !activeSessionId ||
      currentQuestions.length === 0 ||
      submittedAnswers.length !== currentQuestions.length
    ) return;
    await requestOperation(activeSessionId, "follow-up", submittedAnswers);
  }

  async function generateFromCurrentContext() {
    if (!activeSessionId) return;
    const draftAnswers = composeFollowUpAnswers(currentQuestions, answerDrafts);
    await requestOperation(activeSessionId, "generate", draftAnswers);
  }

  async function requestOperation(
    sessionId: string,
    operation: "follow-up" | "generate",
    submittedAnswers?: HarnessInterviewAnswer[],
    reconnectAttempt = 0
  ) {
    setError(undefined);
    setOperationFailure(undefined);
    setRetryAction(undefined);
    setWorkingOperation(operation);
    setWorkingLabel(operation === "generate"
      ? "Selecting workspace Skills and composing the project harness…"
      : answers.length || submittedAnswers?.length
        ? "Finding the next useful questions…"
        : "Reviewing the requirement and workspace Skills…");
    setLiveOutput("");
    setLiveAttempt(undefined);
    if (operation === "generate" && reconnectAttempt === 0) {
      setGenerationProgress(initialGenerationProgress());
    }
    setPhase("working");
    let terminalEvent: Extract<
      ForgeOperationStreamEvent,
      { type: "complete" | "error" }
    > | undefined;
    try {
      await streamForgeOperation(
        token,
        workspace.id,
        sessionId,
        operation,
        submittedAnswers,
        (event) => {
          if (activeSessionIdRef.current !== sessionId) return;
          if (event.type === "attempt") {
            setLiveOutput("");
            setLiveAttempt({ attempt: event.attempt, maxAttempts: event.maxAttempts });
          } else if (event.type === "delta") {
            setLiveOutput((current) => current + event.delta);
          } else if (event.type === "progress") {
            setGenerationProgress((current) => ({
              ...current,
              [event.step]: event.status
            }));
          } else if (event.type === "session") {
            applyServerSession(event.session);
          } else if (event.type === "complete" || event.type === "error") {
            terminalEvent = event;
            if (event.session) applyServerSession(event.session);
          }
        }
      );
    } catch (caught) {
      await recoverAfterStreamFailure(sessionId, operation, caught, reconnectAttempt);
      return;
    }

    if (!terminalEvent || activeSessionIdRef.current !== sessionId) return;
    if (terminalEvent.type === "error") {
      showOperationFailure(terminalEvent.failure, terminalEvent.session);
      return;
    }
    if (terminalEvent.operation === "generate") {
      setTemplate(terminalEvent.template);
      setSelectedPath(terminalEvent.template.files[0]?.path);
      setGenerationProgress(completedGenerationProgress());
      setPhase("complete");
      setWorkingOperation(undefined);
      if (history) void refreshHistory();
      return;
    }
    if (!terminalEvent.followUp.ready && followUpQuestions(terminalEvent.followUp).length > 0) {
      setFollowUp(terminalEvent.followUp);
      setAnswerDrafts([]);
      setPhase("question");
      setWorkingOperation(undefined);
      return;
    }
    await requestOperation(sessionId, "generate");
  }

  async function retryFailedOperation() {
    const action = retryAction;
    if (!action) return;
    if (action.kind === "start") {
      await startInterview();
      return;
    }
    if (activeSessionId) await requestOperation(activeSessionId, action.kind);
  }

  function setForgeFailure(action: ForgeRetryAction, caught: unknown) {
    setError(errorMessage(caught));
    setOperationFailure(undefined);
    setRetryAction(action);
    setPhase("failed");
  }

  function showOperationFailure(
    failure: ForgeAiOperationFailure,
    session?: ForgeSessionDetail
  ) {
    if (session) applyServerSession(session);
    setError(failure.message);
    setOperationFailure(failure);
    setRetryAction(
      failure.operation === "follow-up" || failure.operation === "generate"
        ? { kind: failure.operation }
        : undefined
    );
    setWorkingOperation(undefined);
    setPhase("failed");
  }

  async function recoverAfterStreamFailure(
    sessionId: string,
    operation: "follow-up" | "generate",
    caught: unknown,
    reconnectAttempt: number
  ) {
    try {
      const session = await getForgeSession(token, workspace.id, sessionId);
      if (activeSessionIdRef.current !== sessionId) return;
      applyServerSession(session);
      if (session.status === "complete" && session.template) {
        setPhase("complete");
        setWorkingOperation(undefined);
        return;
      }
      if (session.status === "failed" && session.failure) {
        showOperationFailure(session.failure, session);
        return;
      }
      if (session.status === "working" && session.activeOperation && reconnectAttempt < 2) {
        setWorkingLabel("Reconnecting to the server-side operation…");
        setPhase("working");
        await delay(250 * (reconnectAttempt + 1));
        await requestOperation(
          sessionId,
          session.activeOperation.operation,
          undefined,
          reconnectAttempt + 1
        );
        return;
      }
      if (session.status === "interviewing" && session.followUp) {
        if (session.followUp.ready) await requestOperation(sessionId, "generate");
        else {
          setAnswerDrafts([]);
          setPhase("question");
        }
        return;
      }
    } catch {
      // Keep the original stream error when session reconciliation also fails.
    }
    setError(`${errorMessage(caught)} Retry to reconnect to the server-side operation.`);
    setRetryAction({ kind: operation });
    setWorkingOperation(undefined);
    setPhase("failed");
  }

  function applyServerSession(session: ForgeSessionDetail) {
    setActiveSessionId(session.id);
    activeSessionIdRef.current = session.id;
    setRequirement(session.requirement);
    setAnswers(session.answers);
    setFollowUp(session.followUp?.mode === "llm" ? session.followUp : undefined);
    const storedTemplate = session.template?.mode === "llm" ? session.template : undefined;
    setTemplate(storedTemplate);
    if (storedTemplate) setSelectedPath(storedTemplate.files[0]?.path);
    addSessionToLoadedHistory(session);
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
      sessions: [
        toSessionSummary(session),
        ...current.sessions.filter((item) => item.id !== session.id)
      ]
        .slice(0, current.cache.maxSessions)
    } : current);
  }

  function openSession(summary: ForgeSessionSummary) {
    setHistoryOpen(false);
    if (summary.id === routedSessionId) return;
    onNavigateSession(summary.id);
  }

  async function restoreSessionById(sessionId: string) {
    setLoadingSessionId(sessionId);
    setHistoryError(undefined);
    setError(undefined);
    setOperationFailure(undefined);
    setRetryAction(undefined);
    setRequirement("");
    setAnswers([]);
    setFollowUp(undefined);
    setAnswerDrafts([]);
    setTemplate(undefined);
    setSelectedPath(undefined);
    setWorkingLabel("Loading Forge session…");
    setPhase("working");
    try {
      const session = await getForgeSession(token, workspace.id, sessionId);
      if (routedSessionIdRef.current !== sessionId) return;
      activeSessionIdRef.current = session.id;
      applyServerSession(session);
      setAnswerDrafts([]);
      setHistoryOpen(false);

      if (session.status === "complete" && session.template?.mode === "llm") {
        setPhase("complete");
        return;
      }
      if (session.status === "failed" && session.failure) {
        showOperationFailure(session.failure, session);
        return;
      }
      if (session.status === "working" && session.activeOperation) {
        await requestOperation(session.id, session.activeOperation.operation);
        return;
      }
      const storedFollowUp = session.followUp?.mode === "llm" ? session.followUp : undefined;
      if (storedFollowUp && !storedFollowUp.ready && followUpQuestions(storedFollowUp).length > 0) {
        setPhase("question");
        return;
      }
      if (storedFollowUp?.ready && session.answers.length >= MIN_FORGE_INTERVIEW_ANSWERS) {
        await requestOperation(session.id, "generate");
      } else {
        await requestOperation(session.id, "follow-up");
      }
    } catch (caught) {
      if (routedSessionIdRef.current !== sessionId) return;
      const message = errorMessage(caught);
      setHistoryError(message);
      setError(message);
      setPhase("idle");
    } finally {
      if (routedSessionIdRef.current === sessionId) setLoadingSessionId(undefined);
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
      if (
        activeSessionId === sessionToDelete.id ||
        routedSessionId === sessionToDelete.id
      ) resetBuilder();
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

  function clearBuilderState() {
    setActiveSessionId(undefined);
    activeSessionIdRef.current = undefined;
    setPhase("idle");
    setRequirement("");
    setAnswers([]);
    setFollowUp(undefined);
    setAnswerDrafts([]);
    setTemplate(undefined);
    setSelectedPath(undefined);
    setError(undefined);
    setOperationFailure(undefined);
    setRetryAction(undefined);
    setWorkingOperation(undefined);
    setLiveOutput("");
    setLiveAttempt(undefined);
    setGenerationProgress(initialGenerationProgress());
  }

  function resetBuilder() {
    clearBuilderState();
    onNavigateSession(undefined);
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
            Sessions
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
          <div className="min-w-0">
            <p className="leading-5">{error}</p>
            {operationFailure ? (
              <p className="mt-1 break-all text-[11px] leading-4 text-destructive/80">
                Operation {operationFailure.operationId} · {operationFailure.attempts}
                {" "}attempt{operationFailure.attempts === 1 ? "" : "s"} ·
                {" "}{formatDuration(operationFailure.durationMs)} · {operationFailure.code}
              </p>
            ) : null}
          </div>
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
          <CardContent ref={discoveryScrollRef} className="min-h-0 flex-1 overflow-auto p-5">
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
                {phase === "question" && answers.length >= MIN_FORGE_INTERVIEW_ANSWERS ? (
                  <div className="flex flex-col gap-3 rounded-lg border border-blue-200 bg-blue-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" aria-hidden="true" />
                      <div>
                        <p className="text-sm font-medium text-blue-950">Enough essential context to start</p>
                        <p className="mt-1 text-xs leading-5 text-blue-800">
                          You can generate now or answer the current questions for a more specific framework.
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="shrink-0 border-blue-300 bg-background text-blue-950 hover:bg-blue-100"
                      onClick={() => void generateFromCurrentContext()}
                    >
                      <Sparkles className="h-4 w-4" aria-hidden="true" />
                      Generate framework now
                    </Button>
                  </div>
                ) : null}
                {phase === "working" ? (
                  <div className="flex min-h-40 flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 px-6 text-center">
                    <Loader2 className="mb-3 h-6 w-6 animate-spin text-blue-700" aria-hidden="true" />
                    <p className="text-sm font-medium">{workingLabel}</p>
                    {liveAttempt && liveAttempt.attempt > 1 ? (
                      <Badge variant="outline" className="mt-2 text-[10px]">
                        Attempt {liveAttempt.attempt} of {liveAttempt.maxAttempts}
                      </Badge>
                    ) : null}
                    {streamingText && workingOperation !== "generate" ? (
                      <p className="mt-4 w-full max-w-md rounded-md border bg-background px-4 py-3 text-left text-sm leading-6 text-foreground shadow-sm">
                        {streamingText}
                        <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-blue-600 align-middle" />
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-muted-foreground">
                      The operation continues on the server if this page disconnects.
                    </p>
                  </div>
                ) : null}
                {phase === "question" && currentQuestions.length > 0 ? (
                  <FollowUpQuestions
                    step={answers.length + 1}
                    questions={currentQuestions}
                    drafts={answerDrafts}
                    onDraftsChange={setAnswerDrafts}
                    onContinue={() => void submitAnswers()}
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
              phase === "working" && workingOperation === "generate" ? (
                <ForgeGenerationProgress
                  progress={generationProgress}
                  streamingText={streamingText}
                  attempt={liveAttempt}
                />
              ) : (
                <TemplateEmptyState />
              )
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
                      markers={skillTreeMarkers}
                    />
                    <div className="mt-3 space-y-2 border-t px-2 pt-3 text-[11px] leading-4">
                      {isSkillTreeLoading ? (
                        <p className="flex items-center gap-1.5 text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                          Loading selected Skill file trees…
                        </p>
                      ) : null}
                      {skillTreeError ? (
                        <div className="space-y-1.5 text-amber-700">
                          <p>{skillTreeError}</p>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => setSkillTreeRefreshKey((current) => current + 1)}
                          >
                            <RotateCcw className="h-3 w-3" aria-hidden="true" />
                            Retry trees
                          </Button>
                        </div>
                      ) : null}
                      {skillTrees.length > 0 ? (
                        <p className="text-muted-foreground">
                          Directories marked <span className="font-semibold text-blue-700">Skill</span>
                          {" "}come from this workspace. Files load on demand here and are copied
                          unchanged into the ZIP.
                        </p>
                      ) : null}
                    </div>
                  </div>
                  {isSkillFileLoading ? (
                    <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Loading Skill file…
                    </div>
                  ) : skillFileError ? (
                    <div className="flex min-h-64 flex-col items-center justify-center gap-3 p-6 text-center">
                      <p className="max-w-sm text-sm text-destructive">{skillFileError}</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setSkillFileRefreshKey((current) => current + 1)}
                      >
                        <RotateCcw className="h-4 w-4" aria-hidden="true" />
                        Retry file
                      </Button>
                    </div>
                  ) : (
                    <FilePreviewPane file={selectedFile} />
                  )}
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
        onRestore={openSession}
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
                  Forge sessions
                </SheetTitle>
                <SheetDescription className="mt-2 leading-5">
                  Open a private task session in this workspace. Each session has its own URL and
                  can be resumed directly.
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
                              variant={session.status === "complete"
                                ? "default"
                                : session.status === "failed"
                                  ? "destructive"
                                  : "secondary"}
                              className="text-[10px]"
                            >
                              {session.status === "complete"
                                ? "Ready"
                                : session.status === "failed"
                                  ? "Failed"
                                  : session.status === "working"
                                    ? "Working"
                                    : "In progress"}
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

function formatDuration(durationMs: number): string {
  if (durationMs < 1_000) return `${durationMs} ms`;
  return `${(durationMs / 1_000).toFixed(durationMs < 10_000 ? 1 : 0)} s`;
}

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, durationMs));
}

function extractFirstPartialJsonString(value: string, keys: string[]): string {
  const values = keys
    .map((key) => extractPartialJsonString(value, key))
    .filter(Boolean);
  return values.join("\n\n");
}

function extractPartialJsonString(value: string, key: string): string {
  const keyIndex = value.indexOf(`"${key}"`);
  if (keyIndex < 0) return "";
  const colonIndex = value.indexOf(":", keyIndex + key.length + 2);
  if (colonIndex < 0) return "";
  let index = colonIndex + 1;
  while (/\s/.test(value[index] ?? "")) index += 1;
  if (value[index] !== '"') return "";
  index += 1;

  let result = "";
  while (index < value.length) {
    const character = value[index];
    if (character === '"') break;
    if (character !== "\\") {
      result += character;
      index += 1;
      continue;
    }

    const escaped = value[index + 1];
    if (!escaped) break;
    if (escaped === "u") {
      const code = value.slice(index + 2, index + 6);
      if (!/^[0-9a-f]{4}$/i.test(code)) break;
      result += String.fromCharCode(Number.parseInt(code, 16));
      index += 6;
      continue;
    }
    const escapes: Record<string, string> = {
      '"': '"',
      "\\": "\\",
      "/": "/",
      b: "\b",
      f: "\f",
      n: "\n",
      r: "\r",
      t: "\t"
    };
    result += escapes[escaped] ?? escaped;
    index += 2;
  }
  return result;
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

function FollowUpQuestions({
  step,
  questions,
  drafts,
  onDraftsChange,
  onContinue
}: {
  step: number;
  questions: HarnessFollowUpQuestion[];
  drafts: FollowUpAnswerDraft[];
  onDraftsChange: (drafts: FollowUpAnswerDraft[]) => void;
  onContinue: () => void;
}) {
  const normalizedDrafts = questions.map((_, index) => drafts[index] ?? emptyFollowUpDraft());
  const completedCount = questions.filter((question, index) => Boolean(composeAnswer(
    question.component,
    normalizedDrafts[index]?.selectedOptions ?? [],
    normalizedDrafts[index]?.customAnswer ?? ""
  ))).length;
  const isComplete = completedCount === questions.length;

  const updateDraft = (index: number, draft: FollowUpAnswerDraft) => {
    const next = questions.map((_, draftIndex) => (
      normalizedDrafts[draftIndex] ?? emptyFollowUpDraft()
    ));
    next[index] = draft;
    onDraftsChange(next);
  };

  return (
    <div className="space-y-3">
      {questions.map((question, index) => (
        <FollowUpQuestion
          key={`${question.question}-${index}`}
          step={step + index}
          question={question}
          draft={normalizedDrafts[index] ?? emptyFollowUpDraft()}
          autoFocus={index === 0}
          onDraftChange={(draft) => updateDraft(index, draft)}
        />
      ))}
      <div className="rounded-xl border bg-muted/20 p-4 shadow-sm">
        {questions.length > 1 ? (
          <p className="mb-3 text-xs text-muted-foreground">
            Answer all {questions.length} focused questions to continue. {completedCount} complete.
          </p>
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
          {questions.length === 1 ? "Save answer and continue" : "Save answers and continue"}
        </Button>
      </div>
    </div>
  );
}

function FollowUpQuestion({
  step,
  question,
  draft,
  autoFocus,
  onDraftChange
}: {
  step: number;
  question: HarnessFollowUpQuestion;
  draft: FollowUpAnswerDraft;
  autoFocus: boolean;
  onDraftChange: (draft: FollowUpAnswerDraft) => void;
}) {
  const component = question.component;
  const selectedOptions = draft.selectedOptions;
  const customAnswer = draft.customAnswer;

  const selectionLimit = component.maxSelections ?? component.options.length;
  const selectionLimitReached = selectedOptions.length >= selectionLimit;
  const fieldLabel = component.type === "single-select"
    ? "Select one"
    : component.type === "multi-select"
      ? component.maxSelections
        ? `Select up to ${selectionLimit}`
        : "Select all that apply"
      : "Write an answer";
  const FieldIcon = component.type === "single-select"
    ? MousePointerClick
    : component.type === "multi-select"
      ? ListChecks
      : MessageSquareText;

  const toggleOption = (label: string) => {
    if (component.type === "single-select") {
      onDraftChange({ ...draft, selectedOptions: [label] });
      return;
    }
    if (selectedOptions.includes(label)) {
      onDraftChange({
        ...draft,
        selectedOptions: selectedOptions.filter((item) => item !== label)
      });
      return;
    }
    if (!selectionLimitReached) {
      onDraftChange({ ...draft, selectedOptions: [...selectedOptions, label] });
    }
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
        <p className="mt-2 font-medium leading-6 text-blue-950">{question.question}</p>
        <div className="mt-2 flex items-center gap-1.5 text-xs text-blue-700">
          <FieldIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {fieldLabel}
        </div>
      </div>

      <div className="space-y-3 p-4">
        {component.type === "single-select" ? (
          <div className="grid gap-2" role="radiogroup" aria-label={question.question}>
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
          <div className="grid gap-2" aria-label={question.question}>
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
            onChange={(event) => onDraftChange({ ...draft, customAnswer: event.target.value })}
            placeholder={component.placeholder ?? "Add the detail that will help shape the harness…"}
            className="min-h-28 resize-y"
            maxLength={2000}
            autoFocus={autoFocus}
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
              onChange={(event) => onDraftChange({ ...draft, customAnswer: event.target.value })}
              placeholder="Add a constraint, exception, or answer that is not listed…"
              className="min-h-20 resize-y"
              maxLength={2000}
            />
          </div>
        ) : null}

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

function ForgeGenerationProgress({
  progress,
  streamingText,
  attempt
}: {
  progress: GenerationProgressState;
  streamingText: string;
  attempt?: { attempt: number; maxAttempts: number };
}) {
  return (
    <div className="h-full min-h-[520px] overflow-auto p-6 sm:p-8" aria-live="polite">
      <div className="mx-auto max-w-xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-blue-700" aria-hidden="true" />
              Building your harness framework
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Each stage runs on the server and can be restored after a refresh or reconnect.
            </p>
          </div>
          {attempt && attempt.attempt > 1 ? (
            <Badge variant="outline" className="text-[10px]">
              Attempt {attempt.attempt} of {attempt.maxAttempts}
            </Badge>
          ) : null}
        </div>

        <div className="mt-6 space-y-1">
          {GENERATION_STEPS.map((step, index) => {
            const status = progress[step.id];
            return (
              <div key={step.id} className="relative flex gap-3 pb-5 last:pb-0">
                {index < GENERATION_STEPS.length - 1 ? (
                  <div
                    className={cn(
                      "absolute bottom-0 left-[11px] top-6 w-px",
                      status === "complete" ? "bg-emerald-300" : "bg-border"
                    )}
                    aria-hidden="true"
                  />
                ) : null}
                <div className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-background">
                  {status === "complete" ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />
                  ) : status === "active" ? (
                    <Loader2 className="h-5 w-5 animate-spin text-blue-700" aria-hidden="true" />
                  ) : (
                    <span className="h-3 w-3 rounded-full border-2 border-muted-foreground/30" />
                  )}
                </div>
                <div className={cn("min-w-0 pt-0.5", status === "pending" && "opacity-55")}>
                  <p className="text-sm font-medium">{step.title}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {step.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {streamingText ? (
          <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50/50 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-blue-800">
              Live blueprint
            </div>
            <p className="mt-2 whitespace-pre-line text-sm leading-6 text-blue-950">
              {streamingText}
              <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-blue-600 align-middle" />
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function initialGenerationProgress(): GenerationProgressState {
  return {
    context: "pending",
    assets: "pending",
    compose: "pending",
    save: "pending"
  };
}

function completedGenerationProgress(): GenerationProgressState {
  return {
    context: "complete",
    assets: "complete",
    compose: "complete",
    save: "complete"
  };
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

function cacheForgeSkillFile(
  cache: Map<string, AssetFilePreview>,
  key: string,
  file: AssetFilePreview
): void {
  cache.delete(key);
  cache.set(key, file);
  while (cache.size > MAX_FORGE_SKILL_FILE_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) break;
    cache.delete(oldestKey);
  }
}

function followUpQuestions(
  response: HarnessFollowUpResponse | undefined
): HarnessFollowUpQuestion[] {
  if (!response || response.ready) return [];
  if (response.questions?.length) return response.questions;
  return response.question && response.component
    ? [{ question: response.question, component: response.component }]
    : [];
}

function emptyFollowUpDraft(): FollowUpAnswerDraft {
  return { selectedOptions: [], customAnswer: "" };
}

function composeFollowUpAnswers(
  questions: HarnessFollowUpQuestion[],
  drafts: FollowUpAnswerDraft[]
): HarnessInterviewAnswer[] {
  return questions.flatMap((question, index) => {
    const draft = drafts[index] ?? emptyFollowUpDraft();
    const answer = composeAnswer(
      question.component,
      draft.selectedOptions,
      draft.customAnswer
    );
    return answer ? [{ question: question.question, answer }] : [];
  });
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
