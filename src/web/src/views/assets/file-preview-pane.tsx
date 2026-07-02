import type { AssetPreview } from "../../../../shared/types";

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
      <div className="shrink-0 border-b px-4 py-3">
        <div className="truncate font-medium">{file.name}</div>
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
        <div className="flex min-h-[360px] flex-1 items-center justify-center px-4 text-center text-sm text-muted-foreground lg:min-h-0">
          Preview is not available.
        </div>
      )}
    </div>
  );
}
