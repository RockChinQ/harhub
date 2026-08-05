import { AlertCircle, CheckCircle2, Loader2, TerminalSquare } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";

import type { StorageStatus, WorkspaceRecord } from "../../../../shared/types";
import { uploadErrorMessage } from "../../app/format";
import { Button } from "../../components/ui/button";
import { Textarea } from "../../components/ui/textarea";
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
        <label htmlFor="skills-add-command" className="text-sm font-medium">
          skills add command
        </label>
        <Textarea
          id="skills-add-command"
          value={command}
          onChange={(event) => {
            setCommand(event.target.value);
            setMessage(undefined);
          }}
          rows={4}
          className="resize-y font-mono text-xs"
          placeholder={EXAMPLES[0]}
          spellCheck={false}
        />
        <p className="text-xs leading-5 text-muted-foreground">
          Supports the same public GitHub, GitLab, git HTTPS, well-known provider, direct SKILL.md,
          and archive sources as <span className="font-mono">skills add</span>. Selection flags such as
          <span className="font-mono"> --skill</span>, <span className="font-mono">--all</span>, and
          <span className="font-mono"> --full-depth</span> are preserved. Agent, scope, copy, telemetry,
          and prompt flags are accepted when applicable but do not affect the workspace Library import.
          Local paths, SSH/private repositories, and <span className="font-mono">--list</span> are not
          available for this server-side import.
        </p>
      </div>

      <div className="space-y-2 rounded-md border bg-muted/25 p-3">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <TerminalSquare className="h-3.5 w-3.5" aria-hidden="true" />
          Examples
        </div>
        {EXAMPLES.map((example) => (
          <Button
            key={example}
            type="button"
            variant="outline"
            className="h-auto w-full justify-start whitespace-normal px-2 py-1.5 text-left font-mono text-[11px] font-normal leading-5 text-muted-foreground"
            onClick={() => setCommand(example)}
          >
            {example}
          </Button>
        ))}
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
