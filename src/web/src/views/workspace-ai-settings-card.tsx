import {
  Bot,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  PlugZap,
  Save,
  Trash2,
  XCircle
} from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

import type { WorkspaceAiSettings, WorkspaceRecord } from "../../../shared/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "../components/ui/alert-dialog";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "../components/ui/card";
import { Input } from "../components/ui/input";
import {
  getWorkspaceAiSettings,
  saveWorkspaceAiSettings,
  testWorkspaceAiConnection
} from "../lib/api";

interface ConnectionTestStatus {
  type: "success" | "error";
  message: string;
}

export function WorkspaceAiSettingsCard({
  token,
  workspace
}: {
  token: string;
  workspace: WorkspaceRecord;
}) {
  const [settings, setSettings] = useState<WorkspaceAiSettings>();
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [message, setMessage] = useState<string>();
  const [testStatus, setTestStatus] = useState<ConnectionTestStatus>();

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setMessage(undefined);
    void getWorkspaceAiSettings(token, workspace.id)
      .then((result) => {
        if (!active) return;
        applySettings(result);
      })
      .catch((caught) => {
        if (active) setMessage(errorMessage(caught));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token, workspace.id]);

  function applySettings(result: WorkspaceAiSettings) {
    setSettings(result);
    setBaseUrl(result.baseUrl);
    setModel(result.model);
    setApiKey("");
    setShowApiKey(false);
    setTestStatus(undefined);
  }

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    if (!settings?.canManage) return;
    setIsSaving(true);
    setMessage(undefined);
    try {
      const result = await saveWorkspaceAiSettings(token, workspace.id, {
        provider: "openai-compatible",
        baseUrl,
        model,
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {})
      });
      applySettings(result);
      setMessage(result.configured
        ? "Workspace AI configuration saved."
        : "Provider settings saved. Add an API key to enable AI in Forge.");
    } catch (caught) {
      setMessage(errorMessage(caught));
    } finally {
      setIsSaving(false);
    }
  }

  async function removeApiKey() {
    if (!settings?.canManage) return;
    setIsRemoving(true);
    setMessage(undefined);
    try {
      const result = await saveWorkspaceAiSettings(token, workspace.id, {
        provider: "openai-compatible",
        baseUrl,
        model,
        clearApiKey: true
      });
      applySettings(result);
      setMessage("Workspace API key removed. Forge is unavailable until another key is saved.");
    } catch (caught) {
      setMessage(errorMessage(caught));
    } finally {
      setIsRemoving(false);
    }
  }

  async function testConnection() {
    if (!settings?.canManage) return;
    setIsTesting(true);
    setMessage(undefined);
    setTestStatus(undefined);
    try {
      const result = await testWorkspaceAiConnection(token, workspace.id, {
        provider: "openai-compatible",
        baseUrl,
        model,
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {})
      });
      setTestStatus({
        type: "success",
        message: `Connected to ${result.model} in ${result.latencyMs} ms.`
      });
    } catch (caught) {
      setTestStatus({ type: "error", message: errorMessage(caught) });
    } finally {
      setIsTesting(false);
    }
  }

  function updateDraft(setter: (value: string) => void, value: string) {
    setter(value);
    setMessage(undefined);
    setTestStatus(undefined);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-blue-700" aria-hidden="true" />
              Forge AI
            </CardTitle>
            <CardDescription className="mt-1 max-w-2xl">
              Configure the OpenAI-compatible provider used by Forge in this workspace. The API key
              is encrypted on the server and is never returned to the browser.
            </CardDescription>
          </div>
          <Badge variant={settings?.configured ? "default" : "secondary"}>
            {settings?.configured ? "AI configured" : "AI not configured"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Loading workspace AI settings
          </div>
        ) : settings ? (
          <form className="grid max-w-2xl gap-4" onSubmit={saveSettings}>
            <label className="grid gap-1.5 text-sm font-medium">
              Provider
              <Input id="workspace-ai-provider" value="OpenAI-compatible Chat Completions" disabled />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Base URL
              <Input
                id="workspace-ai-base-url"
                type="url"
                value={baseUrl}
                onChange={(event) => updateDraft(setBaseUrl, event.target.value)}
                placeholder="https://api.openai.com/v1"
                disabled={!settings.canManage || isSaving || isTesting}
                required
              />
              <span className="text-xs font-normal text-muted-foreground">
                The server calls <code>/chat/completions</code> below this URL.
              </span>
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Model
              <Input
                id="workspace-ai-model"
                value={model}
                onChange={(event) => updateDraft(setModel, event.target.value)}
                placeholder="gpt-5.6"
                disabled={!settings.canManage || isSaving || isTesting}
                required
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              API key
              <div className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <KeyRound
                    className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    id="workspace-ai-api-key"
                    type={showApiKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(event) => updateDraft(setApiKey, event.target.value)}
                    placeholder={settings.configured
                      ? `${settings.apiKeyHint ?? "Saved key"} — leave blank to keep it`
                      : "Enter a workspace API key"
                    }
                    className="pl-9 pr-10"
                    autoComplete="new-password"
                    disabled={!settings.canManage || isSaving || isTesting}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-9 w-9"
                    disabled={!apiKey || !settings.canManage}
                    onClick={() => setShowApiKey((current) => !current)}
                    aria-label={showApiKey ? "Hide API key" : "Show API key"}
                  >
                    {showApiKey ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </Button>
                </div>
                {settings.configured && settings.canManage ? (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={isRemoving || isSaving || isTesting}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        Remove key
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove this workspace API key?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Forge will be unavailable until another workspace API key is saved and
                          tested.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => void removeApiKey()}
                        >
                          Remove key
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : null}
              </div>
              <span className="text-xs font-normal text-muted-foreground">
                {settings.configured
                  ? `A key ending in ${settings.apiKeyHint?.slice(-4) ?? "••••"} is saved.`
                  : "No key is stored for this workspace."
                }
              </span>
            </label>

            {settings.canManage ? (
              <div className="space-y-1.5">
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="submit"
                    disabled={isSaving || isTesting || !baseUrl.trim() || !model.trim()}
                  >
                    {isSaving ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Save className="h-4 w-4" aria-hidden="true" />
                    )}
                    Save AI configuration
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={
                      isSaving ||
                      isTesting ||
                      !baseUrl.trim() ||
                      !model.trim() ||
                      (!apiKey.trim() && !settings.configured)
                    }
                    onClick={() => void testConnection()}
                  >
                    {isTesting ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <PlugZap className="h-4 w-4" aria-hidden="true" />
                    )}
                    {isTesting ? "Testing connection…" : "Test connection"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Test uses the current form values without saving them.
                </p>
              </div>
            ) : (
              <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                Only workspace owners and admins can change this configuration.
              </p>
            )}
            {testStatus ? (
              <div
                className={testStatus.type === "success"
                  ? "flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
                  : "flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                }
                role="status"
                aria-live="polite"
              >
                {testStatus.type === "success" ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                ) : (
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                )}
                <span>{testStatus.message}</span>
              </div>
            ) : null}
            {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
          </form>
        ) : (
          <p className="text-sm text-destructive">{message ?? "AI settings could not be loaded."}</p>
        )}
      </CardContent>
    </Card>
  );
}

function errorMessage(caught: unknown): string {
  return caught instanceof Error ? caught.message : String(caught);
}
