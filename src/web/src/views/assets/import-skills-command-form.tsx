import { AlertCircle, CheckCircle2, Info, Loader2, TerminalSquare } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";

import type { StorageStatus, WorkspaceRecord } from "../../../../shared/types";
import { uploadErrorMessage } from "../../app/format";
import { Button } from "../../components/ui/button";
import { Textarea } from "../../components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "../../components/ui/tooltip";
import { importWorkspaceSkillsCommand } from "../../lib/api";

type ImportMessage = {
  tone: "error" | "success";
  text: string;
};

const EXAMPLES = [
  "npx skills add https://clawhub.ai/matrixy/skills/agent-browser-clawdbot",
  "npx skills add https://github.com/vercel-labs/agent-skills --skill vercel-react-best-practices"
];

export function ImportSkillsCommandForm({
  workspace,
  token,
  storage,
  onImported
}: {
  workspace: WorkspaceRecord;
  token: string;
  storage?: StorageStatus;
  onImported: () => Promise<void>;
}) {
  const [command, setCommand] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [message, setMessage] = useState<ImportMessage>();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!command.trim()) {
      setMessage({ tone: "error", text: "Paste an npx skills add command or a supported Skill source." });
      return;
    }
    setIsImporting(true);
    setMessage(undefined);
    try {
      const result = await importWorkspaceSkillsCommand(token, workspace.id, command.trim());
      const warningCount = result.uploaded.reduce(
        (total, asset) => total + asset.validation.warnings,
        0
      );
      setMessage({
        tone: "success",
        text: `Imported ${result.uploaded.length} Skill${result.uploaded.length === 1 ? "" : "s"}${
          warningCount > 0 ? ` with ${warningCount} warning${warningCount === 1 ? "" : "s"}` : ""
        }.`
      });
      setCommand("");
      await onImported();
    } catch (caught) {
      setMessage({ tone: "error", text: uploadErrorMessage(caught) });
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <form className="grid min-w-0 gap-4" onSubmit={submit}>
      {!storage?.configured ? (
        <Notice tone="warning">
          Uploads are not configured yet. Ask an administrator to enable package uploads before continuing.
        </Notice>
      ) : null}

      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <label htmlFor="skills-add-command" className="text-sm font-medium">
            skills add command
          </label>
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground"
                  aria-label="About command imports"
                >
                  <Info className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-80 space-y-2 text-xs leading-5">
                <p>
                  Supports public GitHub, GitLab, git HTTPS, well-known providers, direct
                  SKILL.md files, and archives. Selection flags such as --skill, --all, and
                  --full-depth are preserved.
                </p>
                <p>
                  Local paths, SSH/private repositories, and --list are unavailable for
                  server-side imports.
                </p>
                <div className="space-y-1 border-t pt-2 font-mono text-[11px]">
                  {EXAMPLES.map((example) => <div key={example} className="break-all">{example}</div>)}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <Textarea
          id="skills-add-command"
          value={command}
          onChange={(event) => {
            setCommand(event.target.value);
            setMessage(undefined);
          }}
          rows={3}
          className="resize-none font-mono text-xs"
          placeholder={EXAMPLES[0]}
          spellCheck={false}
        />
      </div>

      <Button
        type="submit"
        disabled={isImporting || !command.trim() || !storage?.configured}
        className="w-full"
      >
        {isImporting ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <TerminalSquare className="h-4 w-4" aria-hidden="true" />
        )}
        Import from command
      </Button>

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
    </form>
  );
}

function Notice({
  tone,
  children
}: {
  tone: "error" | "success" | "warning";
  children: ReactNode;
}) {
  const isError = tone === "error";
  return (
    <div className={
      isError
        ? "flex gap-2 rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        : tone === "warning"
          ? "flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          : "flex gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-950"
    }>
      {isError || tone === "warning" ? (
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      ) : (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      )}
      <span>{children}</span>
    </div>
  );
}
