import { lazy, Suspense, useState } from "react";
import { Code2, Eye, Loader2, Pencil, Save, X } from "lucide-react";

import type {
  AssetFilePreview,
  ForgeMarkdownViewMode
} from "../../../../shared/types";
import { Button } from "../../components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Textarea } from "../../components/ui/textarea";

const MarkdownPreview = lazy(() => import("./markdown-preview"));

export function FilePreviewPane({
  file,
  markdownView: controlledMarkdownView,
  onMarkdownViewChange,
  canEdit = false,
  isEditing = false,
  draft = "",
  isSaving = false,
  onStartEditing,
  onDraftChange,
  onCancelEditing,
  onSave
}: {
  file?: AssetFilePreview;
  markdownView?: ForgeMarkdownViewMode;
  onMarkdownViewChange?: (view: ForgeMarkdownViewMode) => void;
  canEdit?: boolean;
  isEditing?: boolean;
  draft?: string;
  isSaving?: boolean;
  onStartEditing?: () => void;
  onDraftChange?: (content: string) => void;
  onCancelEditing?: () => void;
  onSave?: () => void;
}) {
  const [internalMarkdownView, setInternalMarkdownView] =
    useState<ForgeMarkdownViewMode>("preview");
  const markdownView = controlledMarkdownView ?? internalMarkdownView;

  if (!file) {
    return (
      <div className="flex min-h-[360px] min-w-0 items-center justify-center text-sm text-muted-foreground lg:min-h-0">
        Select a file.
      </div>
    );
  }

  const isMarkdown = file.isText && isMarkdownFile(file.path);
  const isSkillMarkdown = isMarkdown && /(?:^|\/)SKILL\.md$/i.test(file.path);

  return (
    <div className="flex min-h-0 min-w-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
        <div className="min-w-0 truncate font-medium">{file.name}</div>
        <div className="flex items-center gap-2">
          {isMarkdown && !isEditing ? (
            <Tabs
              value={markdownView}
              onValueChange={(value) => {
                const next = value as ForgeMarkdownViewMode;
                setInternalMarkdownView(next);
                onMarkdownViewChange?.(next);
              }}
            >
              <TabsList className="h-8">
                <TabsTrigger value="preview" className="h-6 gap-1.5 px-2.5 text-xs">
                  <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  Preview
                </TabsTrigger>
                <TabsTrigger value="code" className="h-6 gap-1.5 px-2.5 text-xs">
                  <Code2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Code
                </TabsTrigger>
              </TabsList>
            </Tabs>
          ) : null}
          {canEdit && !isEditing ? (
            <Button type="button" size="sm" variant="outline" onClick={onStartEditing}>
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              Edit
            </Button>
          ) : null}
          {isEditing ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isSaving}
                onClick={onCancelEditing}
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={isSaving || draft === (file.content ?? "")}
                onClick={onSave}
              >
                {isSaving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Save className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                Save
              </Button>
            </>
          ) : null}
        </div>
      </div>
      {file.isText ? (
        isEditing ? (
          <div className="flex min-h-0 flex-1 flex-col gap-2 bg-white p-4 text-zinc-950">
            <Textarea
              value={draft}
              aria-label={`Edit ${file.path}`}
              spellCheck={false}
              autoFocus
              disabled={isSaving}
              onChange={(event) => onDraftChange?.(event.target.value)}
              className="min-h-0 flex-1 resize-none bg-white font-mono text-xs leading-5 text-zinc-950"
            />
            <p className="shrink-0 text-xs text-zinc-500">
              Saving validates the complete Skill and creates a retained version.
            </p>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto bg-white p-5 text-zinc-950">
            {isMarkdown && markdownView === "preview" ? (
              <Suspense
                fallback={(
                  <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
                    Rendering Markdown…
                  </div>
                )}
              >
                <MarkdownPreview
                  content={file.content ?? ""}
                  showSkillMetadata={isSkillMarkdown}
                />
              </Suspense>
            ) : (
              <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-5 text-zinc-950">
                {file.content ?? ""}
              </pre>
            )}
            {file.truncated ? (
              <div className="mt-4 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
                Preview truncated. Large files are read-only here.
              </div>
            ) : null}
          </div>
        )
      ) : (
        <div className="flex min-h-[360px] flex-1 items-center justify-center px-4 text-center text-sm text-muted-foreground lg:min-h-0">
          Preview is not available.
        </div>
      )}
    </div>
  );
}

function isMarkdownFile(path: string): boolean {
  return /\.(?:md|mdx|markdown)$/i.test(path);
}
