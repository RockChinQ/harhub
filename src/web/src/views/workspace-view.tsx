import { Plus, Save } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

import type {
  WorkspaceMember,
  WorkspaceRecord,
  WorkspaceRole
} from "../../../shared/types";
import { splitList } from "../app/format";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "../components/ui/card";
import { Input } from "../components/ui/input";
import {
  addWorkspaceMember,
  createWorkspace,
  getWorkspaceMembers,
  removeWorkspaceMember,
  updateWorkspace,
  updateWorkspaceMember,
  type SessionResponse
} from "../lib/api";
import { WorkspaceMembersCard } from "./workspace-members-card";

export function WorkspaceView({
  token,
  session,
  workspace,
  onSessionChange
}: {
  token: string;
  session: SessionResponse;
  workspace: WorkspaceRecord;
  onSessionChange: (session: SessionResponse, workspace?: WorkspaceRecord) => Promise<void>;
}) {
  const [name, setName] = useState(workspace.name);
  const [scanPaths, setScanPaths] = useState(workspace.defaultScanPaths.join(", "));
  const [skillRoot, setSkillRoot] = useState(workspace.skillRoot);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<WorkspaceRole>("member");
  const [message, setMessage] = useState<string | undefined>();
  const [memberMessage, setMemberMessage] = useState<string | undefined>();

  useEffect(() => {
    setName(workspace.name);
    setScanPaths(workspace.defaultScanPaths.join(", "));
    setSkillRoot(workspace.skillRoot);
  }, [workspace.id, workspace.name, workspace.defaultScanPaths, workspace.skillRoot]);

  useEffect(() => {
    void refreshMembers();
  }, [workspace.id, token]);

  async function refreshMembers() {
    setMemberMessage(undefined);
    try {
      const result = await getWorkspaceMembers(token, workspace.id);
      setMembers(result.members);
    } catch (caught) {
      setMemberMessage(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    setMessage(undefined);
    try {
      const result = await updateWorkspace(token, workspace.id, {
        name,
        defaultScanPaths: splitList(scanPaths),
        skillRoot
      });
      setMessage("Workspace saved.");
      await onSessionChange(result, result.workspace);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function createNewWorkspace(event: FormEvent) {
    event.preventDefault();
    setMessage(undefined);
    try {
      const result = await createWorkspace(token, {
        name: newWorkspaceName,
        defaultScanPaths: ["examples"],
        skillRoot: "skills"
      });
      setNewWorkspaceName("");
      setMessage("Workspace created.");
      await onSessionChange(result, result.workspace);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function inviteMember(event: FormEvent) {
    event.preventDefault();
    setMemberMessage(undefined);
    try {
      const result = await addWorkspaceMember(token, workspace.id, {
        email: memberEmail,
        role: memberRole
      });
      setMembers(result.members);
      setMemberEmail("");
      setMemberMessage("Member added.");
    } catch (caught) {
      setMemberMessage(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function changeRole(membershipId: string, role: WorkspaceRole) {
    setMemberMessage(undefined);
    try {
      const result = await updateWorkspaceMember(token, workspace.id, membershipId, role);
      setMembers(result.members);
      setMemberMessage("Role updated.");
    } catch (caught) {
      setMemberMessage(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function removeMember(membershipId: string) {
    setMemberMessage(undefined);
    try {
      await removeWorkspaceMember(token, workspace.id, membershipId);
      await refreshMembers();
      setMemberMessage("Member removed.");
    } catch (caught) {
      setMemberMessage(caught instanceof Error ? caught.message : String(caught));
    }
  }

  return (
    <div className="min-h-0 w-full flex-1 overflow-auto pr-1">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Workspace Settings</CardTitle>
            <CardDescription>{workspace.slug}</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={saveSettings}>
              <label className="grid gap-1.5 text-sm font-medium">
                Name
                <Input value={name} onChange={(event) => setName(event.target.value)} />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Default scan paths
                <Input value={scanPaths} onChange={(event) => setScanPaths(event.target.value)} />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Skill root
                <Input value={skillRoot} onChange={(event) => setSkillRoot(event.target.value)} />
              </label>
              <Button type="submit">
                <Save className="h-4 w-4" aria-hidden="true" />
                Save
              </Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Workspaces</CardTitle>
            <CardDescription>{session.workspaces.length} tenant(s)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              {session.workspaces.map((item) => (
                <div key={item.id} className="rounded-md border px-3 py-2 text-sm">
                  <div className="font-medium">{item.name}</div>
                  <div className="text-xs text-muted-foreground">{item.slug}</div>
                </div>
              ))}
            </div>
            <form className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]" onSubmit={createNewWorkspace}>
              <Input
                value={newWorkspaceName}
                onChange={(event) => setNewWorkspaceName(event.target.value)}
                placeholder="New workspace"
                required
              />
              <Button type="submit">
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add
              </Button>
            </form>
            {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
          </CardContent>
        </Card>
        <WorkspaceMembersCard
          members={members}
          memberEmail={memberEmail}
          memberRole={memberRole}
          memberMessage={memberMessage}
          onMemberEmailChange={setMemberEmail}
          onMemberRoleChange={setMemberRole}
          onInviteMember={inviteMember}
          onChangeRole={(membershipId, role) => void changeRole(membershipId, role)}
          onRemoveMember={(membershipId) => void removeMember(membershipId)}
        />
      </div>
    </div>
  );
}
