import { FileArchive } from "lucide-react";

import type { AssetPreview } from "../../../../shared/types";
import { formatBytes } from "../../app/format";
import { Badge } from "../../components/ui/badge";

export function FilePreviewPane({ file }: { file?: AssetPreview["selectedFile"] }) {
  if (!file) {
    return (
      <div className="flex min-h-[360px] min-w-0 items-center justify-center text-sm text-muted-foreground lg:min-h-0">
        Select a file.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-col">
      <div className="flex shrink-0 min-w-0 items-center justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <div className="truncate font-medium">{file.name}</div>
          <div className="mt-1 truncate font-mono text-xs text-muted-foreground">
            {file.path}
          </div>
        </div>
        <Badge variant="outline">{formatBytes(file.size)}</Badge>
      </div>
      {file.isText ? (
        <div className="min-h-0 flex-1 overflow-auto bg-zinc-950 p-4 text-zinc-50">
          <pre className="whitespace-pre-wrap break-words text-xs leading-5">
            {file.content ?? ""}
          </pre>
          {file.truncated ? (
            <div className="mt-4 rounded-md border border-blue-300/40 bg-blue-500/10 px-3 py-2 text-xs text-blue-100">
              Preview truncated.
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex min-h-[360px] flex-1 flex-col items-center justify-center gap-2 px-4 text-center text-sm text-muted-foreground lg:min-h-0">
          <FileArchive className="h-8 w-8" aria-hidden="true" />
          Binary file preview is not available.
        </div>
      )}
    </div>
  );
}
