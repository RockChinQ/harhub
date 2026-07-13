import { Save } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

import type {
  WorkspaceInvitation,
  WorkspaceMember,
  WorkspaceRecord,
  WorkspaceRole
} from "../../../shared/types";
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
  getWorkspaceMembers,
  removeWorkspaceMember,
  revokeWorkspaceInvitation,
  updateWorkspace,
  updateWorkspaceMember,
  type SessionResponse
} from "../lib/api";
import { WorkspaceMembersCard } from "./workspace-members-card";

export function WorkspaceView({
  token,
  workspace,
  onSessionChange
}: {
  token: string;
  workspace: WorkspaceRecord;
  onSessionChange: (session: SessionResponse, workspace?: WorkspaceRecord) => Promise<void>;
}) {
  const [name, setName] = useState(workspace.name);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [invitations, setInvitations] = useState<WorkspaceInvitation[]>([]);
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<WorkspaceRole>("member");
  const [message, setMessage] = useState<string | undefined>();
  const [memberMessage, setMemberMessage] = useState<string | undefined>();

  useEffect(() => {
    setName(workspace.name);
  }, [workspace.id, workspace.name]);

  useEffect(() => {
    void refreshMembers();
  }, [workspace.id, token]);

  async function refreshMembers() {
    setMemberMessage(undefined);
    try {
      const result = await getWorkspaceMembers(token, workspace.id);
      setMembers(result.members);
      setInvitations(result.invitations ?? []);
    } catch (caught) {
      setMemberMessage(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    setMessage(undefined);
    try {
      const result = await updateWorkspace(token, workspace.id, {
        name
      });
      setMessage("Workspace saved.");
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
      setInvitations(result.invitations ?? []);
      setMemberEmail("");
      setMemberMessage(
        result.email?.sent
          ? "Invitation sent."
          : result.email?.error
            ? `Invitation created, but email was not sent: ${result.email.error}`
            : "Invitation created."
      );
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

  async function revokeInvitation(invitationId: string) {
    setMemberMessage(undefined);
    try {
      await revokeWorkspaceInvitation(token, workspace.id, invitationId);
      await refreshMembers();
      setMemberMessage("Invitation revoked.");
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
              <Button type="submit">
                <Save className="h-4 w-4" aria-hidden="true" />
                Save
              </Button>
              {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
            </form>
          </CardContent>
        </Card>
        <WorkspaceMembersCard
          members={members}
          invitations={invitations}
          memberEmail={memberEmail}
          memberRole={memberRole}
          memberMessage={memberMessage}
          onMemberEmailChange={setMemberEmail}
          onMemberRoleChange={setMemberRole}
          onInviteMember={inviteMember}
          onChangeRole={(membershipId, role) => void changeRole(membershipId, role)}
          onRemoveMember={(membershipId) => void removeMember(membershipId)}
          onRevokeInvitation={(invitationId) => void revokeInvitation(invitationId)}
        />
      </div>
    </div>
  );
}
