import { KeyRound, Loader2, Save } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

import type { AccountProfile, WorkspaceMembership } from "../../../shared/types";
import { KeyValue } from "../components/common/key-value";
import { Badge } from "../components/ui/badge";
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
  changePassword,
  updateAccount,
  type SessionResponse
} from "../lib/api";

export function AccountView({
  token,
  account,
  memberships,
  onSessionChange,
  onPasswordChanged
}: {
  token: string;
  account: AccountProfile;
  memberships: WorkspaceMembership[];
  onSessionChange: (session: SessionResponse) => void;
  onPasswordChanged: () => Promise<void>;
}) {
  const [name, setName] = useState(account.name);
  const [email, setEmail] = useState(account.email);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [profileMessage, setProfileMessage] = useState<string | undefined>();
  const [passwordMessage, setPasswordMessage] = useState<string | undefined>();
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  useEffect(() => {
    setName(account.name);
    setEmail(account.email);
  }, [account.id, account.name, account.email]);

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setIsSavingProfile(true);
    setProfileMessage(undefined);
    try {
      const nextSession = await updateAccount(token, { name, email });
      onSessionChange(nextSession);
      setProfileMessage("Account saved.");
    } catch (caught) {
      setProfileMessage(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function savePassword(event: FormEvent) {
    event.preventDefault();
    setIsChangingPassword(true);
    setPasswordMessage(undefined);
    try {
      await changePassword(token, { currentPassword, newPassword });
      setPasswordMessage("Password changed. Sign in again.");
      await onPasswordChanged();
    } catch (caught) {
      setPasswordMessage(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsChangingPassword(false);
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto pr-1">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>{account.id}</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={saveProfile}>
              <label className="grid gap-1.5 text-sm font-medium">
                Name
                <Input value={name} onChange={(event) => setName(event.target.value)} />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Email
                <Input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
              <div className="grid gap-3 text-sm">
                <KeyValue label="Created" value={new Date(account.createdAt).toLocaleString()} />
                <KeyValue
                  label="Updated"
                  value={account.updatedAt ? new Date(account.updatedAt).toLocaleString() : "-"}
                />
              </div>
              <div className="flex items-center gap-3">
                <Button type="submit" disabled={isSavingProfile}>
                  {isSavingProfile ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Save className="h-4 w-4" aria-hidden="true" />
                  )}
                  Save
                </Button>
                {profileMessage ? <span className="text-sm text-muted-foreground">{profileMessage}</span> : null}
              </div>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Password</CardTitle>
            <CardDescription>Changing it signs out every active session.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={savePassword}>
              <label className="grid gap-1.5 text-sm font-medium">
                Current password
                <Input
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                New password
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                />
              </label>
              <div className="flex items-center gap-3">
                <Button type="submit" disabled={isChangingPassword}>
                  {isChangingPassword ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <KeyRound className="h-4 w-4" aria-hidden="true" />
                  )}
                  Change
                </Button>
                {passwordMessage ? <span className="text-sm text-muted-foreground">{passwordMessage}</span> : null}
              </div>
            </form>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Memberships</CardTitle>
            <CardDescription>{memberships.length} workspace role(s)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {memberships.map((membership) => (
              <div key={membership.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <span className="font-mono text-xs text-muted-foreground">{membership.workspaceId}</span>
                <Badge variant="outline">{membership.role}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
