import {
  AlertCircle,
  CheckCircle2,
  FileArchive,
  Loader2,
  Upload
} from "lucide-react";
import { type FormEvent, useId, useState } from "react";

import type { StorageStatus, WorkspaceRecord } from "../../../../shared/types";
import { uploadErrorMessage } from "../../app/format";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { uploadWorkspaceSkillZip } from "../../lib/api";

type UploadMessage = {
  tone: "error" | "success";
  text: string;
};

export function UploadSkillZipForm({
  workspace,
  token,
  storage,
  onUploaded
}: {
  workspace: WorkspaceRecord;
  token: string;
  storage?: StorageStatus;
  onUploaded: () => Promise<void>;
}) {
  const fileInputId = useId();
  const [file, setFile] = useState<File | undefined>();
  const [inputKey, setInputKey] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<UploadMessage | undefined>();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file) {
      setMessage({ tone: "error", text: "Select a .zip file first." });
      return;
    }

    if (!file.name.toLowerCase().endsWith(".zip")) {
      setMessage({ tone: "error", text: "Only .zip skill packages can be uploaded." });
      return;
    }

    setIsSaving(true);
    setMessage(undefined);
    try {
      const result = await uploadWorkspaceSkillZip(token, workspace.id, {
        file
      });
      const warnings = result.uploaded.validation.warnings;
      setMessage({
        tone: "success",
        text: warnings > 0
          ? `Uploaded ${result.uploaded.displayName} with ${warnings} warning${warnings === 1 ? "" : "s"}.`
          : `Uploaded ${result.uploaded.displayName}.`
      });
      setFile(undefined);
      setInputKey((current) => current + 1);
      await onUploaded();
    } catch (caught) {
      setMessage({ tone: "error", text: uploadErrorMessage(caught) });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      {!storage?.configured ? (
        <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Uploads are not configured yet. Ask an administrator to enable package uploads before continuing.</span>
        </div>
      ) : null}
      <div className="grid gap-2">
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
          className="group flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center transition-colors hover:border-primary/40 hover:bg-primary/5"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-lg border bg-background text-muted-foreground shadow-sm transition-colors group-hover:text-primary">
            <FileArchive className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="grid gap-1">
            <span className="text-sm font-medium">
              {file ? file.name : "Choose a skill package"}
            </span>
            <span className="text-xs text-muted-foreground">
              {file ? formatBytes(file.size) : "Zip package containing SKILL.md"}
            </span>
          </span>
          <Badge variant="outline" className="font-mono">
            .zip
          </Badge>
        </label>
      </div>
      <Button type="submit" disabled={isSaving || !storage?.configured} className="w-full">
        {isSaving ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Upload className="h-4 w-4" aria-hidden="true" />
        )}
        Upload
      </Button>
      {message ? (
        <div
          className={
            message.tone === "error"
              ? "flex gap-2 rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              : "flex gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-950"
          }
        >
          {message.tone === "error" ? (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          <span>{message.text}</span>
        </div>
      ) : null}
    </form>
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
