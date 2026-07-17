import { lazy, Suspense, useState } from "react";
import { Code2, Eye } from "lucide-react";

import type { AssetFilePreview } from "../../../../shared/types";
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs";

type MarkdownViewMode = "preview" | "code";

const MarkdownPreview = lazy(() => import("./markdown-preview"));

export function FilePreviewPane({ file }: { file?: AssetFilePreview }) {
  const [markdownView, setMarkdownView] = useState<MarkdownViewMode>("preview");

  if (!file) {
    return (
      <div className="flex min-h-[360px] min-w-0 items-center justify-center text-sm text-muted-foreground lg:min-h-0">
        Select a file.
      </div>
    );
  }

  const isMarkdown = file.isText && isMarkdownFile(file.path);

  return (
    <div className="flex min-h-0 min-w-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
        <div className="min-w-0 truncate font-medium">{file.name}</div>
        {isMarkdown ? (
          <Tabs
            value={markdownView}
            onValueChange={(value) => setMarkdownView(value as MarkdownViewMode)}
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
      </div>
      {file.isText ? (
        <div className="min-h-0 flex-1 overflow-auto bg-white p-5 text-zinc-950">
          {isMarkdown && markdownView === "preview" ? (
            <Suspense
              fallback={(
                <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
                  Rendering Markdown…
                </div>
              )}
            >
              <MarkdownPreview content={file.content ?? ""} />
            </Suspense>
          ) : (
            <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-5 text-zinc-950">
              {file.content ?? ""}
            </pre>
          )}
          {file.truncated ? (
            <div className="mt-4 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
              Preview truncated.
            </div>
          ) : null}
        </div>
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
