import {
  AlertCircle,
  CheckCircle2,
  FileArchive,
  Files,
  Loader2,
  Upload
} from "lucide-react";
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useId,
  useState
} from "react";

import type {
  SkillImportCandidate,
  SkillImportPreview,
  StorageStatus,
  WorkspaceRecord
} from "../../../../shared/types";
import { uploadErrorMessage } from "../../app/format";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import { Input } from "../../components/ui/input";
import {
  previewWorkspaceSkillZip,
  uploadWorkspaceSkillZip
} from "../../lib/api";

type UploadMessage = {
  tone: "error" | "success";
  text: string;
};

export function UploadSkillZipForm({
  workspace,
  token,
  storage,
  initialFile,
  initialError,
  onUploaded
}: {
  workspace: WorkspaceRecord;
  token: string;
  storage?: StorageStatus;
  initialFile?: File;
  initialError?: string;
  onUploaded: () => Promise<void>;
}) {
  const fileInputId = useId();
  const [file, setFile] = useState<File>();
  const [inputKey, setInputKey] = useState(0);
  const [preview, setPreview] = useState<SkillImportPreview>();
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<UploadMessage>();

  useEffect(() => {
    if (initialFile) {
      setFile(initialFile);
      setMessage(undefined);
      setInputKey((current) => current + 1);
    } else if (initialError) {
      setMessage({ tone: "error", text: initialError });
    }
  }, [initialFile, initialError]);

  useEffect(() => {
    let cancelled = false;
    setPreview(undefined);
    setSelectedPaths(new Set());
    if (!file) return;

    setIsPreviewing(true);
    void previewWorkspaceSkillZip(token, workspace.id, file)
      .then((nextPreview) => {
        if (cancelled) return;
        setPreview(nextPreview);
        setSelectedPaths(new Set(
          nextPreview.candidates
            .filter((candidate) => candidate.validation.errors === 0)
            .map((candidate) => candidate.skillPath)
        ));
      })
      .catch((caught) => {
        if (!cancelled) {
          setMessage({ tone: "error", text: uploadErrorMessage(caught) });
        }
      })
      .finally(() => {
        if (!cancelled) setIsPreviewing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [file, token, workspace.id]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file || !preview) {
      setMessage({ tone: "error", text: "Choose a zip and wait for its Skills to be scanned." });
      return;
    }
    if (selectedPaths.size === 0) {
      setMessage({ tone: "error", text: "Select at least one valid Skill to import." });
      return;
    }

    setIsSaving(true);
    setMessage(undefined);
    try {
      const result = await uploadWorkspaceSkillZip(token, workspace.id, {
        file,
        selectedSkillPaths: Array.from(selectedPaths)
      });
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
      setFile(undefined);
      setPreview(undefined);
      setSelectedPaths(new Set());
      setInputKey((current) => current + 1);
      await onUploaded();
    } catch (caught) {
      setMessage({ tone: "error", text: uploadErrorMessage(caught) });
    } finally {
      setIsSaving(false);
    }
  }

  function toggleCandidate(candidate: SkillImportCandidate, checked: boolean) {
    if (candidate.validation.errors > 0) return;
    setSelectedPaths((current) => {
      const next = new Set(current);
      if (checked) next.add(candidate.skillPath);
      else next.delete(candidate.skillPath);
      return next;
    });
  }

  return (
    <form className="grid w-full min-w-0 max-w-full gap-4 overflow-hidden" onSubmit={submit}>
      {!storage?.configured ? (
        <Notice tone="warning">
          Uploads are not configured yet. Ask an administrator to enable package uploads before continuing.
        </Notice>
      ) : null}

      <Input
        key={inputKey}
        id={fileInputId}
        type="file"
        accept=".zip,application/zip"
        className="sr-only"
        onChange={(event) => {
          setFile(event.target.files?.[0]);
          setMessage(undefined);
        }}
      />
      <label
        htmlFor={fileInputId}
        className="group flex w-full min-w-0 max-w-full cursor-pointer items-center gap-3 overflow-hidden rounded-lg border border-dashed border-border bg-muted/30 px-4 py-4 transition-colors hover:border-primary/40 hover:bg-primary/5"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground shadow-sm group-hover:text-primary">
          {isPreviewing ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          ) : (
            <FileArchive className="h-5 w-5" aria-hidden="true" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {file ? file.name : "Choose any zip containing Skills"}
          </span>
          <span className="mt-1 block text-xs text-muted-foreground">
            {file
              ? `${formatBytes(file.size)} · ${isPreviewing ? "Scanning every SKILL.md…" : "Click to choose another zip"}`
              : "Nested directories and multiple SKILL.md files are supported."}
          </span>
        </span>
        <Badge variant="outline" className="font-mono">.zip</Badge>
      </label>

      {preview ? (
        <div className="grid w-full min-w-0 max-w-full gap-3 overflow-hidden rounded-lg border bg-background p-3">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium">
              <Files className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <span className="truncate">
                {preview.candidates.length} Skill{preview.candidates.length === 1 ? "" : "s"} found
              </span>
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">{selectedPaths.size} selected</span>
          </div>
          <div className="grid min-w-0 max-w-full max-h-80 gap-2 overflow-x-hidden overflow-y-auto pr-1">
            {preview.candidates.map((candidate) => (
              <CandidateRow
                key={candidate.skillPath}
                candidate={candidate}
                checked={selectedPaths.has(candidate.skillPath)}
                onCheckedChange={(checked) => toggleCandidate(candidate, checked)}
              />
            ))}
          </div>
        </div>
      ) : null}

      <Button
        type="submit"
        disabled={isSaving || isPreviewing || selectedPaths.size === 0 || !storage?.configured}
        className="w-full min-w-0 max-w-full"
      >
        {isSaving ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Upload className="h-4 w-4" aria-hidden="true" />
        )}
        Import {selectedPaths.size > 0 ? `${selectedPaths.size} Skill${selectedPaths.size === 1 ? "" : "s"}` : "selected Skills"}
      </Button>

      {message ? (
        <Notice tone={message.tone}>{message.text}</Notice>
      ) : null}
    </form>
  );
}

function CandidateRow({
  candidate,
  checked,
  onCheckedChange
}: {
  candidate: SkillImportCandidate;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const invalid = candidate.validation.errors > 0;
  const firstError = candidate.validationIssues.find((issue) => issue.severity === "error");

  return (
    <div className="flex w-full min-w-0 max-w-full items-start gap-3 overflow-hidden rounded-md border p-3">
      <Checkbox
        className="mt-0.5"
        checked={checked}
        disabled={invalid}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        aria-label={`Import ${candidate.displayName}`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="min-w-0 break-words font-medium leading-5 [overflow-wrap:anywhere]">{candidate.displayName}</span>
          <Badge variant={invalid ? "destructive" : candidate.health === "warning" ? "secondary" : "outline"}>
            {invalid ? `${candidate.validation.errors} error${candidate.validation.errors === 1 ? "" : "s"}` : candidate.health}
          </Badge>
        </div>
        <p className="mt-1 line-clamp-2 break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">{candidate.description}</p>
        <div className="mt-2 flex min-w-0 max-w-full flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] text-muted-foreground">
          <span className="min-w-0 basis-full break-all">{candidate.skillPath}</span>
          <span className="shrink-0">{candidate.fileCount} files</span>
          <span className="shrink-0">{formatBytes(candidate.size)}</span>
        </div>
        {firstError ? (
          <p className="mt-2 break-words text-xs text-destructive [overflow-wrap:anywhere]">{firstError.message}</p>
        ) : null}
      </div>
    </div>
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

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  const units = ["KB", "MB", "GB"];
  let value = size / 1024;
  let unit = units[0] ?? "KB";
  for (const nextUnit of units) {
    unit = nextUnit;
    if (value < 1024 || nextUnit === units[units.length - 1]) break;
    value /= 1024;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${unit}`;
}
