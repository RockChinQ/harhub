import { FileJson2, Loader2, Upload } from "lucide-react";
import { type FormEvent, useState } from "react";

import type { WorkspaceRecord } from "../../../../shared/types";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { uploadWorkspaceMcp } from "../../lib/api";

export function UploadMcpForm({
  token,
  workspace,
  onUploaded
}: {
  token: string;
  workspace: WorkspaceRecord;
  onUploaded: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File>();
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<string>();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file || !name.trim() || !description.trim()) return;
    setIsUploading(true);
    setMessage(undefined);
    try {
      await uploadWorkspaceMcp(token, workspace.id, {
        name: name.trim(),
        description: description.trim(),
        file
      });
      setName("");
      setDescription("");
      setFile(undefined);
      setMessage("MCP configuration saved.");
      await onUploaded();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="space-y-1.5">
        <label htmlFor="mcp-name" className="text-sm font-medium">Name</label>
        <Input
          id="mcp-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="GitHub integration"
          disabled={isUploading}
          required
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="mcp-description" className="text-sm font-medium">Description</label>
        <Textarea
          id="mcp-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="What this MCP integration provides and when a project should use it."
          className="min-h-24"
          disabled={isUploading}
          required
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="mcp-file" className="text-sm font-medium">JSON configuration</label>
        <Input
          id="mcp-file"
          type="file"
          accept=".json,application/json"
          onChange={(event) => setFile(event.target.files?.[0])}
          disabled={isUploading}
          required
        />
        <p className="text-xs leading-5 text-muted-foreground">
          Supports the common <code>mcpServers</code> and <code>servers</code> shapes.
          Use environment-variable placeholders for credentials.
        </p>
      </div>
      {file ? (
        <div className="flex items-center gap-2 rounded-md border bg-muted/20 px-3 py-2 text-sm">
          <FileJson2 className="h-4 w-4 text-blue-700" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">{file.name}</span>
          <span className="text-xs text-muted-foreground">{file.size} bytes</span>
        </div>
      ) : null}
      {message ? (
        <p className="text-sm text-muted-foreground" role="status">{message}</p>
      ) : null}
      <Button
        type="submit"
        className="w-full"
        disabled={isUploading || !file || !name.trim() || !description.trim()}
      >
        {isUploading
          ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          : <Upload className="h-4 w-4" aria-hidden="true" />}
        Save MCP
      </Button>
    </form>
  );
}
