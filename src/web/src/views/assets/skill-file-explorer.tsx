import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import type {
  AssetPreview,
  AssetRecord,
  WorkspaceRecord
} from "../../../../shared/types";
import {
  getWorkspaceAssetPreview,
  updateWorkspaceSkillFile
} from "../../lib/api";
import { FilePreviewPane } from "./file-preview-pane";
import { FileTree } from "./file-tree";

export function SkillFileExplorer({
  workspace,
  token,
  asset,
  canEdit,
  onChanged
}: {
  workspace: WorkspaceRecord;
  token: string;
  asset: AssetRecord;
  canEdit: boolean;
  onChanged: (asset: AssetRecord) => Promise<void>;
}) {
  const [selectedPath, setSelectedPath] = useState<string | undefined>();
  const [preview, setPreview] = useState<AssetPreview | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setSelectedPath(undefined);
    setPreview(undefined);
    setIsEditing(false);
    setDraft("");
    setNotice(undefined);
  }, [asset.id]);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setError(undefined);
    getWorkspaceAssetPreview(token, workspace.id, asset.id, selectedPath)
      .then((result) => {
        if (!isMounted) return;
        setPreview(result);
      })
      .catch((caught) => {
        if (!isMounted) return;
        setError(caught instanceof Error ? caught.message : String(caught));
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [asset.id, asset.version, selectedPath, token, workspace.id]);

  const currentPath = selectedPath ?? preview?.selectedFile?.path;
  const selectedFile = preview?.selectedFile;
  const editorAvailable = Boolean(
    canEdit &&
    asset.kind === "skill" &&
    asset.storage &&
    selectedFile?.isText &&
    !selectedFile.truncated
  );

  function selectPath(path: string): void {
    if (isEditing && path !== currentPath) {
      setNotice("Save or cancel your changes before selecting another file.");
      return;
    }
    setSelectedPath(path);
    setNotice(undefined);
  }

  function startEditing(): void {
    if (!selectedFile || !editorAvailable) return;
    setDraft(selectedFile.content ?? "");
    setIsEditing(true);
    setError(undefined);
    setNotice(undefined);
  }

  function cancelEditing(): void {
    setDraft("");
    setIsEditing(false);
    setError(undefined);
    setNotice(undefined);
  }

  async function saveFile(): Promise<void> {
    if (!selectedFile || !isEditing) return;
    setIsSaving(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const result = await updateWorkspaceSkillFile(
        token,
        workspace.id,
        asset.id,
        {
          path: selectedFile.path,
          content: draft,
          version: asset.version ?? 1
        }
      );
      const nextPreview = await getWorkspaceAssetPreview(
        token,
        workspace.id,
        result.asset.id,
        selectedFile.path
      );
      setPreview(nextPreview);
      setDraft("");
      setIsEditing(false);
      setNotice(
        result.asset.version === asset.version
          ? "No changes to save."
          : `Saved ${selectedFile.path} as Skill v${result.asset.version ?? 1}.`
      );
      await onChanged(result.asset);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-card">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <h2 className="font-semibold">Files</h2>
        </div>
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" /> : null}
      </div>
      {error ? (
        <div className="mx-4 mt-4 shrink-0 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="mx-4 mt-4 shrink-0 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
          {notice}
        </div>
      ) : null}
      <div className="grid min-h-0 min-w-0 flex-1 grid-rows-[minmax(180px,2fr)_minmax(280px,3fr)] lg:grid-cols-[300px_minmax(0,1fr)] lg:grid-rows-1">
        <div className="flex min-h-0 min-w-0 flex-col border-b lg:border-b-0 lg:border-r">
          <div className="min-h-0 flex-1 overflow-auto p-2">
            {preview?.tree.length ? (
              <FileTree nodes={preview.tree} selectedPath={currentPath} onSelect={selectPath} />
            ) : (
              <div className="px-2 py-8 text-center text-sm text-muted-foreground">
                No files.
              </div>
            )}
          </div>
        </div>
        <FilePreviewPane
          file={selectedFile}
          canEdit={editorAvailable}
          isEditing={isEditing}
          draft={draft}
          isSaving={isSaving}
          onStartEditing={startEditing}
          onDraftChange={setDraft}
          onCancelEditing={cancelEditing}
          onSave={() => void saveFile()}
        />
      </div>
    </section>
  );
}
