import { Loader2, Upload } from "lucide-react";
import { type FormEvent, useState } from "react";

import type { StorageStatus, WorkspaceRecord } from "../../../../shared/types";
import { uploadErrorMessage } from "../../app/format";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { uploadWorkspaceSkillZip } from "../../lib/api";

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
  const [file, setFile] = useState<File | undefined>();
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | undefined>();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file) {
      setMessage("Select a .zip file first.");
      return;
    }

    setIsSaving(true);
    setMessage(undefined);
    try {
      const result = await uploadWorkspaceSkillZip(token, workspace.id, {
        file
      });
      setMessage(`Uploaded ${result.uploaded.storage?.originalName ?? result.uploaded.displayName}.`);
      setFile(undefined);
      await onUploaded();
    } catch (caught) {
      setMessage(uploadErrorMessage(caught));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      {!storage?.configured ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Uploads are not configured yet. Ask an administrator to enable package uploads before continuing.
        </div>
      ) : null}
      <label className="grid gap-1.5 text-sm font-medium">
        Skill zip
        <Input
          type="file"
          accept=".zip,application/zip"
          onChange={(event) => setFile(event.target.files?.[0])}
          required
        />
      </label>
      <Button type="submit" disabled={isSaving || !storage?.configured}>
        {isSaving ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Upload className="h-4 w-4" aria-hidden="true" />
        )}
        Upload
      </Button>
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </form>
  );
}
