import { CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

import type { AccountProfile } from "../../../shared/types";
import type { OAuthDeviceAuthorizationSummary } from "../../../shared/oauth";
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
  decideOAuthDeviceAuthorization,
  getOAuthDeviceAuthorization
} from "../lib/api";

export function DeviceAuthorizationView({
  token,
  account
}: {
  token: string;
  account: AccountProfile;
}) {
  const [inputCode, setInputCode] = useState(() => readUserCodeFromLocation());
  const [userCode, setUserCode] = useState(() => readUserCodeFromLocation());
  const [authorization, setAuthorization] =
    useState<OAuthDeviceAuthorizationSummary>();
  const [message, setMessage] = useState<string>();
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!userCode) return;
    setIsLoading(true);
    setMessage(undefined);
    void getOAuthDeviceAuthorization(token, userCode)
      .then(setAuthorization)
      .catch((caught) => {
        setAuthorization(undefined);
        setMessage(caught instanceof Error ? caught.message : String(caught));
      })
      .finally(() => setIsLoading(false));
  }, [token, userCode]);

  function findAuthorization(event: FormEvent) {
    event.preventDefault();
    const nextCode = inputCode.trim().toUpperCase();
    if (!nextCode) return;
    const url = new URL(window.location.href);
    url.searchParams.set("user_code", nextCode);
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
    setUserCode(nextCode);
  }

  async function decide(action: "approve" | "deny") {
    if (!authorization) return;
    setIsSubmitting(true);
    setMessage(undefined);
    try {
      const next = await decideOAuthDeviceAuthorization(token, {
        userCode: authorization.userCode,
        action
      });
      setAuthorization(next);
      setMessage(
        action === "approve"
          ? "Authorization complete. You can return to the terminal."
          : "Authorization denied."
      );
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsSubmitting(false);
    }
  }

  const completed = authorization?.status !== "pending";

  return (
    <main className="flex min-h-[100dvh] items-center justify-center px-4 py-8">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <CardTitle>Authorize Harhub CLI</CardTitle>
          <CardDescription>
            Confirm the code shown in your terminal before granting CLI access.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          {!authorization && !isLoading ? (
            <form className="grid gap-3" onSubmit={findAuthorization}>
              <label className="grid gap-2 text-sm font-medium">
                Device code
                <Input
                  value={inputCode}
                  onChange={(event) => setInputCode(event.target.value)}
                  placeholder="ABCD-EFGH"
                  autoCapitalize="characters"
                  autoComplete="one-time-code"
                  required
                />
              </label>
              <Button type="submit">Continue</Button>
            </form>
          ) : null}

          {isLoading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Checking device code
            </div>
          ) : null}

          {authorization ? (
            <div className="grid gap-4">
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Device code
                </div>
                <div className="mt-1 font-mono text-2xl font-semibold tracking-wider">
                  {authorization.userCode}
                </div>
              </div>
              <div className="grid gap-1 text-sm">
                <p>
                  Signed in as <span className="font-medium">{account.email}</span>
                </p>
                <p className="text-muted-foreground">
                  Harhub CLI will receive an access token with your account permissions.
                </p>
              </div>
              {completed ? (
                <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                  {authorization.status === "approved" ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                  ) : (
                    <XCircle className="h-4 w-4 text-destructive" aria-hidden="true" />
                  )}
                  {authorization.status === "approved"
                    ? "This device is authorized."
                    : "This request was denied."}
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    onClick={() => void decide("approve")}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                    )}
                    Authorize
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void decide("deny")}
                    disabled={isSubmitting}
                  >
                    Deny
                  </Button>
                </div>
              )}
            </div>
          ) : null}

          {message ? (
            <p className={authorization ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>
              {message}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}

function readUserCodeFromLocation(): string {
  return new URLSearchParams(window.location.search).get("user_code")?.trim() ?? "";
}
