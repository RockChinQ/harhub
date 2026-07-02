import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import type {
  AssetPreview,
  AssetRecord,
  WorkspaceRecord
} from "../../../../shared/types";
import { getWorkspaceAssetPreview } from "../../lib/api";
import { FilePreviewPane } from "./file-preview-pane";
import { FileTree } from "./file-tree";

export function SkillFileExplorer({
  workspace,
  token,
  asset
}: {
  workspace: WorkspaceRecord;
  token: string;
  asset: AssetRecord;
}) {
  const [selectedPath, setSelectedPath] = useState<string | undefined>();
  const [preview, setPreview] = useState<AssetPreview | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | undefined>();

  useEffect(() => {
    setSelectedPath(undefined);
    setPreview(undefined);
  }, [asset.id]);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setMessage(undefined);
    getWorkspaceAssetPreview(token, workspace.id, asset.id, selectedPath)
      .then((result) => {
        if (!isMounted) return;
        setPreview(result);
      })
      .catch((caught) => {
        if (!isMounted) return;
        setMessage(caught instanceof Error ? caught.message : String(caught));
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [asset.id, selectedPath, token, workspace.id]);

  const currentPath = selectedPath ?? preview?.selectedFile?.path;

  return (
    <section className="flex min-h-[620px] min-w-0 flex-col overflow-hidden rounded-lg border bg-card 2xl:h-full 2xl:min-h-0">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <h2 className="font-semibold">Files</h2>
        </div>
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" /> : null}
      </div>
      {message ? (
        <div className="mx-4 mt-4 shrink-0 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {message}
        </div>
      ) : null}
      <div className="grid min-h-0 min-w-0 flex-1 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="flex min-h-0 min-w-0 flex-col border-b lg:border-b-0 lg:border-r">
          <div className="min-h-0 flex-1 overflow-auto p-2">
            {preview?.tree.length ? (
              <FileTree nodes={preview.tree} selectedPath={currentPath} onSelect={setSelectedPath} />
            ) : (
              <div className="px-2 py-8 text-center text-sm text-muted-foreground">
                No files.
              </div>
            )}
          </div>
        </div>
        <FilePreviewPane file={preview?.selectedFile} />
      </div>
    </section>
  );
}
