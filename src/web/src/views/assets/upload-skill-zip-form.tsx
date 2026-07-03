import {
  AlertCircle,
  CheckCircle2,
  FileArchive,
  Loader2,
  Upload
} from "lucide-react";
import { type FormEvent, useEffect, useId, useState } from "react";

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

type SkillZipPreview = {
  status: "loading" | "ready" | "error";
  fileName: string;
  fileSize: string;
  displayName?: string;
  name?: string;
  description?: string;
  license?: string;
  skillPath?: string;
  fileCount?: number;
  issues: string[];
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
  const [file, setFile] = useState<File | undefined>();
  const [inputKey, setInputKey] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<UploadMessage | undefined>();
  const [preview, setPreview] = useState<SkillZipPreview | undefined>();

  useEffect(() => {
    if (initialFile) {
      setFile(initialFile);
      setMessage(undefined);
      setInputKey((current) => current + 1);
      return;
    }

    if (initialError) {
      setMessage({ tone: "error", text: initialError });
    }
  }, [initialFile, initialError]);

  useEffect(() => {
    let cancelled = false;

    if (!file) {
      setPreview(undefined);
      return;
    }

    setPreview({
      status: "loading",
      fileName: file.name,
      fileSize: formatBytes(file.size),
      issues: []
    });

    void readSkillZipPreview(file)
      .then((nextPreview) => {
        if (!cancelled) setPreview(nextPreview);
      })
      .catch((caught) => {
        if (cancelled) return;
        setPreview({
          status: "error",
          fileName: file.name,
          fileSize: formatBytes(file.size),
          issues: [
            caught instanceof Error
              ? caught.message
              : "Package metadata could not be read."
          ]
        });
      });

    return () => {
      cancelled = true;
    };
  }, [file]);

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
          className="group flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-5 text-center transition-colors hover:border-primary/40 hover:bg-primary/5"
        >
          {preview ? (
            <SkillPackagePreview preview={preview} />
          ) : (
            <>
              <span className="flex h-11 w-11 items-center justify-center rounded-lg border bg-background text-muted-foreground shadow-sm transition-colors group-hover:text-primary">
                <FileArchive className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="grid gap-1">
                <span className="text-sm font-medium">Choose a skill package</span>
                <span className="text-xs text-muted-foreground">Zip package containing SKILL.md</span>
              </span>
              <Badge variant="outline" className="font-mono">
                .zip
              </Badge>
            </>
          )}
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

function SkillPackagePreview({ preview }: { preview: SkillZipPreview }) {
  const title = preview.displayName ?? preview.name ?? preview.fileName;
  const hasReadableMetadata =
    Boolean(preview.name || preview.description || preview.skillPath);

  return (
    <span className="flex w-full flex-col gap-3 text-left">
      <span className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground shadow-sm transition-colors group-hover:text-primary">
          {preview.status === "loading" ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          ) : (
            <FileArchive className="h-5 w-5" aria-hidden="true" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">
            {preview.status === "loading" ? "Reading package metadata..." : title}
          </span>
          <span className="mt-1 block max-h-16 overflow-hidden text-xs leading-4 text-muted-foreground">
            {preview.description ??
              (preview.status === "loading"
                ? preview.fileName
                : "No description found in SKILL.md.")}
          </span>
        </span>
        <Badge variant="outline" className="shrink-0 font-mono">
          .zip
        </Badge>
      </span>

      <span className="grid gap-2 rounded-md border bg-background/80 p-2.5 text-xs">
        {preview.status === "error" ? (
          <span className="flex gap-2 text-destructive">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{preview.issues[0] ?? "Package metadata could not be read."}</span>
          </span>
        ) : null}

        {preview.status !== "error" || hasReadableMetadata ? (
          <span className="grid gap-x-3 gap-y-2 sm:grid-cols-2">
            <PreviewField label="Name" value={preview.name ?? "Not found"} />
            <PreviewField label="Package" value={preview.fileName} />
            <PreviewField label="Size" value={preview.fileSize} />
            <PreviewField label="Skill file" value={preview.skillPath ?? "Not found"} />
            <PreviewField
              label="Files"
              value={preview.fileCount === undefined ? "Reading..." : String(preview.fileCount)}
            />
            {preview.license ? (
              <PreviewField label="License" value={preview.license} />
            ) : null}
          </span>
        ) : null}

        {preview.issues.length > 0 && preview.status !== "error" ? (
          <span className="grid gap-1 rounded-md bg-muted/60 px-2 py-2 text-muted-foreground">
            {preview.issues.map((issue) => (
              <span key={issue} className="flex gap-2">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden="true" />
                <span>{issue}</span>
              </span>
            ))}
          </span>
        ) : null}
      </span>
    </span>
  );
}

function PreviewField({ label, value }: { label: string; value: string }) {
  return (
    <span className="grid min-w-0 gap-0.5">
      <span className="text-[11px] font-medium uppercase tracking-normal text-muted-foreground">
        {label}
      </span>
      <span className="truncate font-medium text-foreground">{value}</span>
    </span>
  );
}

async function readSkillZipPreview(file: File): Promise<SkillZipPreview> {
  const basePreview = {
    fileName: file.name,
    fileSize: formatBytes(file.size)
  };

  if (!file.name.toLowerCase().endsWith(".zip")) {
    return {
      ...basePreview,
      status: "error",
      issues: ["Only .zip skill packages can be uploaded."]
    };
  }

  const [{ default: JSZip }, { default: YAML }] = await Promise.all([
    import("jszip"),
    import("yaml")
  ]);
  const zip = await JSZip.loadAsync(file);
  const files = Object.values(zip.files).filter(
    (entry) => !entry.dir && !isSystemZipEntry(entry.name)
  );
  const skillEntry =
    files.find((entry) => entry.name === "SKILL.md") ??
    files
      .filter((entry) => entry.name.split("/").pop()?.toLowerCase() === "skill.md")
      .sort((left, right) => left.name.length - right.name.length)[0];

  if (!skillEntry) {
    return {
      ...basePreview,
      status: "error",
      fileCount: files.length,
      issues: ["No SKILL.md file was found in this package."]
    };
  }

  const markdown = await skillEntry.async("string");
  const parsed = parseSkillFrontmatter(markdown, YAML.parse);
  const displayName = stringValue(parsed.frontmatter.display_name);
  const name = stringValue(parsed.frontmatter.name);
  const description =
    stringValue(parsed.frontmatter.description) ?? firstParagraphAfterTitle(markdown);
  const license = stringValue(parsed.frontmatter.license);
  const issues: string[] = [];

  if (parsed.error) issues.push(parsed.error);
  if (!name) issues.push("SKILL.md frontmatter has no name.");
  if (!description) issues.push("SKILL.md frontmatter has no description.");

  return {
    ...basePreview,
    status: "ready",
    displayName,
    name,
    description,
    license,
    skillPath: skillEntry.name,
    fileCount: files.length,
    issues
  };
}

function parseSkillFrontmatter(
  content: string,
  parseYaml: (source: string) => unknown
): {
  frontmatter: Record<string, unknown>;
  error?: string;
} {
  const normalized = content.replace(/^\uFEFF/, "");
  const match = normalized.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);

  if (!match) {
    return {
      frontmatter: {},
      error: "SKILL.md is missing YAML frontmatter."
    };
  }

  try {
    const parsed = parseYaml(match[1] ?? "");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        frontmatter: {},
        error: "SKILL.md frontmatter must be a mapping."
      };
    }

    return { frontmatter: parsed as Record<string, unknown> };
  } catch {
    return {
      frontmatter: {},
      error: "SKILL.md frontmatter could not be parsed."
    };
  }
}

function firstParagraphAfterTitle(content: string): string | undefined {
  const body = content.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "");
  const lines = body
    .replace(/^#\s+.+$/m, "")
    .split(/\r?\n/)
    .map((line) => line.trim());
  const paragraph: string[] = [];

  for (const line of lines) {
    if (!line || line.startsWith("#") || line.startsWith("```")) {
      if (paragraph.length > 0) break;
      continue;
    }

    if (line.startsWith("- ") || /^\d+\.\s/.test(line)) {
      if (paragraph.length > 0) break;
      continue;
    }

    paragraph.push(line);
  }

  const value = paragraph.join(" ").trim();
  return value || undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isSystemZipEntry(name: string): boolean {
  return name.startsWith("__MACOSX/") || name.split("/").some((part) => part === ".DS_Store");
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
