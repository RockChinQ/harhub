import { MailPlus, Trash2, UserPlus, X } from "lucide-react";
import { type FormEvent, useState } from "react";

import type {
  WorkspaceInvitation,
  WorkspaceMember,
  WorkspaceRole
} from "../../../shared/types";
import { roleOptions } from "../app/constants";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "../components/ui/alert-dialog";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "../components/ui/select";

export function WorkspaceMembersCard({
  members,
  invitations,
  memberEmail,
  memberRole,
  memberMessage,
  onMemberEmailChange,
  onMemberRoleChange,
  onInviteMember,
  onChangeRole,
  onRemoveMember,
  onRevokeInvitation
}: {
  members: WorkspaceMember[];
  invitations: WorkspaceInvitation[];
  memberEmail: string;
  memberRole: WorkspaceRole;
  memberMessage?: string;
  onMemberEmailChange: (value: string) => void;
  onMemberRoleChange: (value: WorkspaceRole) => void;
  onInviteMember: (event: FormEvent) => void;
  onChangeRole: (membershipId: string, role: WorkspaceRole) => void;
  onRemoveMember: (membershipId: string) => void;
  onRevokeInvitation: (invitationId: string) => void;
}) {
  const [memberToRemove, setMemberToRemove] = useState<string | undefined>();
  const selectedMember = members.find((member) => member.membership.id === memberToRemove);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>{members.length} account(s) in this workspace</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="min-w-0 overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b bg-muted/60 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Account</th>
                  <th className="hidden px-3 py-2 font-medium md:table-cell">Joined</th>
                  <th className="px-3 py-2 font-medium">Role</th>
                  <th className="w-16 px-3 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.membership.id} className="border-b last:border-0">
                    <td className="px-3 py-3">
                      <div className="font-medium">{member.account.name}</div>
                      <div className="text-xs text-muted-foreground">{member.account.email}</div>
                    </td>
                    <td className="hidden px-3 py-3 text-muted-foreground md:table-cell">
                      {new Date(member.membership.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-3">
                      <Select
                        value={member.membership.role}
                        onValueChange={(value) =>
                          onChangeRole(member.membership.id, value as WorkspaceRole)
                        }
                      >
                        <SelectTrigger className="h-8 w-28">
                          <SelectValue placeholder="Role" />
                        </SelectTrigger>
                        <SelectContent>
                          {roleOptions.map((role) => (
                            <SelectItem key={role} value={role}>
                              {role}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-3">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setMemberToRemove(member.membership.id)}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {invitations.length > 0 ? (
            <div className="rounded-lg border bg-muted/20">
              <div className="flex items-center gap-2 border-b px-3 py-2 text-xs font-medium uppercase text-muted-foreground">
                <MailPlus className="h-3.5 w-3.5" aria-hidden="true" />
                Pending invitations
              </div>
              <div className="divide-y">
                {invitations.map((invitation) => (
                  <div
                    key={invitation.id}
                    className="grid gap-2 px-3 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{invitation.email}</div>
                      <div className="text-xs text-muted-foreground">
                        Expires {new Date(invitation.expiresAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="text-xs font-medium uppercase text-muted-foreground">
                      {invitation.role}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onRevokeInvitation(invitation.id)}
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                      Revoke
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <form className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_140px_auto]" onSubmit={onInviteMember}>
            <Input
              value={memberEmail}
              onChange={(event) => onMemberEmailChange(event.target.value)}
              placeholder="teammate@example.com"
              type="email"
              required
            />
            <Select value={memberRole} onValueChange={(value) => onMemberRoleChange(value as WorkspaceRole)}>
              <SelectTrigger>
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                {roleOptions.map((role) => (
                  <SelectItem key={role} value={role}>
                    {role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit">
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              Invite
            </Button>
          </form>
          {memberMessage ? <p className="text-sm text-muted-foreground">{memberMessage}</p> : null}
        </CardContent>
      </Card>
      <AlertDialog
        open={Boolean(memberToRemove)}
        onOpenChange={(open) => {
          if (!open) setMemberToRemove(undefined);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove member?</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedMember
                ? `${selectedMember.account.email} will lose access to this workspace.`
                : "This account will lose access to this workspace."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                if (!memberToRemove) return;
                onRemoveMember(memberToRemove);
                setMemberToRemove(undefined);
              }}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
