import { Loader2, Save, Trash2 } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

import type {
  AssetRecord,
  ValidationIssue,
  WorkspaceRecord
} from "../../../../shared/types";
import { metadataList, metadataNumber, metadataText } from "../../app/asset-utils";
import {
  formatBytes,
  formatDate,
  healthBadgeClass,
  shortHash,
  splitList
} from "../../app/format";
import { KeyValue } from "../../components/common/key-value";
import { TokenList } from "../../components/common/token-list";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "../../components/ui/select";
import { deleteWorkspaceAsset, updateWorkspaceAsset } from "../../lib/api";
import { cn } from "../../lib/utils";
import { MetadataCount } from "./metadata-count";
import { ValidationIssuesList } from "./validation-issues-list";

export function SkillMetadataPanel({
  workspace,
  token,
  asset,
  issues,
  onChanged,
  className
}: {
  workspace: WorkspaceRecord;
  token: string;
  asset?: AssetRecord;
  issues: ValidationIssue[];
  onChanged: () => Promise<void>;
  className?: string;
}) {
  const [description, setDescription] = useState("");
  const [owner, setOwner] = useState("");
  const [tags, setTags] = useState("");
  const [lifecycleState, setLifecycleState] = useState("experimental");
  const [agents, setAgents] = useState("");
  const [message, setMessage] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    setDescription(asset?.description ?? "");
    setOwner(asset?.owner ?? "");
    setTags(asset?.tags.join(", ") ?? "");
    setLifecycleState(asset?.lifecycleState ?? "experimental");
    setAgents((asset ? metadataList(asset, "agents") : []).join(", "));
    setMessage(undefined);
  }, [asset?.id]);

  if (!asset) {
    return (
      <div className={cn("flex min-h-48 items-center justify-center rounded-lg border border-dashed bg-card text-sm text-muted-foreground", className)}>
        Select a skill to inspect metadata.
      </div>
    );
  }

  const selectedAsset = asset;
  const assetIssues = issues.filter(
    (issue) => issue.assetId === selectedAsset.id || issue.skillId === selectedAsset.skill?.id
  );
  const headings = metadataList(selectedAsset, "headings");
  const agentsList = metadataList(selectedAsset, "agents");
  const storage = selectedAsset.storage;

  async function saveAsset(event: FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    setMessage(undefined);
    try {
      await updateWorkspaceAsset(token, workspace.id, selectedAsset.id, {
        description,
        owner,
        tags: splitList(tags),
        lifecycleState,
        agents: splitList(agents)
      });
      setMessage("Skill saved.");
      await onChanged();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsSaving(false);
    }
  }

  async function removeAsset() {
    if (!window.confirm(`Delete ${selectedAsset.displayName}?`)) return;
    setIsDeleting(true);
    setMessage(undefined);
    try {
      await deleteWorkspaceAsset(token, workspace.id, selectedAsset.id);
      setMessage("Skill deleted.");
      await onChanged();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <form
      className={cn(
        "flex min-h-[620px] min-w-0 flex-col overflow-hidden rounded-lg border bg-card 2xl:min-h-0",
        className
      )}
      onSubmit={saveAsset}
    >
      <div className="flex shrink-0 flex-col gap-3 border-b bg-card p-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-lg font-semibold">{selectedAsset.displayName}</h2>
            <Badge variant="secondary" className={healthBadgeClass(selectedAsset.health)}>
              {selectedAsset.health}
            </Badge>
            <Badge variant="outline">{selectedAsset.lifecycleState}</Badge>
          </div>
          <p className="mt-1 max-w-4xl text-sm leading-6 text-muted-foreground">
            {selectedAsset.description || "No description."}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button type="submit" disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="h-4 w-4" aria-hidden="true" />
            )}
            Save
          </Button>
          <Button type="button" variant="outline" onClick={removeAsset} disabled={isDeleting}>
            {isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            )}
            Delete
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="grid gap-5">
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium">
                Description
                <Input
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Owner
                <Input value={owner} onChange={(event) => setOwner(event.target.value)} />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Lifecycle
                <Select value={lifecycleState} onValueChange={setLifecycleState}>
                  <SelectTrigger>
                    <SelectValue placeholder="Lifecycle" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="experimental">experimental</SelectItem>
                    <SelectItem value="stable">stable</SelectItem>
                    <SelectItem value="deprecated">deprecated</SelectItem>
                    <SelectItem value="archived">archived</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Tags
                <Input value={tags} onChange={(event) => setTags(event.target.value)} />
              </label>
              <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">
                Agents
                <Input value={agents} onChange={(event) => setAgents(event.target.value)} />
              </label>
            </div>
            <div className="grid gap-3 text-sm md:grid-cols-2">
              <KeyValue label="Asset ID" value={selectedAsset.id} />
              <KeyValue label="Name" value={selectedAsset.name} />
              <KeyValue label="Package" value={selectedAsset.packageName ?? "-"} />
              <KeyValue label="Kind" value={selectedAsset.kind} />
              <KeyValue label="Hash" value={shortHash(selectedAsset.contentHash)} />
              <KeyValue label="Skill entry" value={metadataText(selectedAsset, "skillEntry") || "-"} />
              <KeyValue label="Discovered" value={formatDate(selectedAsset.discoveredAt)} />
              <KeyValue label="Updated" value={formatDate(selectedAsset.updatedAt)} />
            </div>
            <TokenList title="Agents" values={agentsList} empty="No agent compatibility metadata." />
            <TokenList title="Headings" values={headings} empty="No headings parsed." />
          </div>
          <div className="space-y-4 rounded-lg border bg-background p-4">
            <div>
              <h3 className="text-sm font-medium">Uploaded package</h3>
              <div className="mt-3 grid gap-2 text-sm">
                <KeyValue label="Archive" value={storage?.originalName ?? "-"} />
                <KeyValue label="Size" value={storage ? formatBytes(storage.size) : "-"} />
                <KeyValue label="Uploaded" value={storage ? formatDate(storage.uploadedAt) : "-"} />
              </div>
            </div>
            <div>
              <h3 className="text-sm font-medium">Contents</h3>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <MetadataCount label="Zip files" value={metadataNumber(selectedAsset, "zipEntries")} />
                <MetadataCount label="Scripts" value={metadataNumber(selectedAsset, "scripts")} />
                <MetadataCount label="References" value={metadataNumber(selectedAsset, "references")} />
                <MetadataCount label="Assets" value={metadataNumber(selectedAsset, "assets")} />
              </div>
            </div>
            <ValidationIssuesList issues={assetIssues} />
            {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
          </div>
        </div>
      </div>
    </form>
  );
}
