import { Github, KeyRound, Loader2, Mail, Send } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Separator } from "../components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import {
  getAuthConfig,
  login,
  requestEmailCode,
  signUp,
  verifyEmailCode,
  type AuthConfigResponse,
  type AuthResponse
} from "../lib/api";

export function AuthScreen({
  isLoading,
  error,
  inviteToken,
  onAuthenticated
}: {
  isLoading: boolean;
  error?: string;
  inviteToken?: string;
  onAuthenticated: (response: AuthResponse) => void;
}) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("admin@harhub.local");
  const [name, setName] = useState("Harhub Admin");
  const [password, setPassword] = useState("harhub");
  const [workspaceName, setWorkspaceName] = useState("Engineering Platform");
  const [message, setMessage] = useState<string | undefined>(error);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authConfig, setAuthConfig] = useState<AuthConfigResponse>();
  const [emailCode, setEmailCode] = useState("");
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);

  useEffect(() => {
    const callbackError = sessionStorage.getItem("harhub.auth_error");
    if (callbackError) {
      sessionStorage.removeItem("harhub.auth_error");
      setMessage(callbackError);
      return;
    }
    setMessage(error);
  }, [error]);

  useEffect(() => {
    void getAuthConfig()
      .then(setAuthConfig)
      .catch(() => undefined);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage(undefined);
    try {
      const response =
        mode === "login"
          ? await login({ email, password, inviteToken })
          : await signUp({ email, name, password, workspaceName, inviteToken });
      onAuthenticated(response);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function sendEmailCode() {
    setIsSendingCode(true);
    setMessage(undefined);
    try {
      await requestEmailCode({ email, inviteToken });
      setMessage("Verification code sent.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsSendingCode(false);
    }
  }

  async function submitEmailCode(event: FormEvent) {
    event.preventDefault();
    setIsVerifyingCode(true);
    setMessage(undefined);
    try {
      const response = await verifyEmailCode({ email, code: emailCode, inviteToken });
      onAuthenticated(response);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsVerifyingCode(false);
    }
  }

  function startOAuth(provider: "google" | "github") {
    const redirect = window.location.pathname || "/skills";
    const params = new URLSearchParams({ redirect });
    if (inviteToken) params.set("invite", inviteToken);
    window.location.href = `/api/auth/oauth/${provider}/start?${params.toString()}`;
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Harhub</CardTitle>
          <CardDescription>
            {inviteToken ? "Sign in to accept your workspace invitation." : "Sign in to your workspace."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={mode} onValueChange={(value) => setMode(value as "login" | "signup")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Create account</TabsTrigger>
            </TabsList>
            <TabsContent value={mode}>
              {mode === "login" ? (
                <div className="grid gap-3 py-4">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={authConfig?.oauth.google === false}
                      onClick={() => startOAuth("google")}
                    >
                      <span className="flex h-4 w-4 items-center justify-center rounded-full border text-[10px] font-semibold">
                        G
                      </span>
                      Google
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={authConfig?.oauth.github === false}
                      onClick={() => startOAuth("github")}
                    >
                      <Github className="h-4 w-4" aria-hidden="true" />
                      GitHub
                    </Button>
                  </div>
                  <form className="grid gap-2" onSubmit={submitEmailCode}>
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                      <Input
                        value={emailCode}
                        onChange={(event) => setEmailCode(event.target.value)}
                        placeholder="Email code"
                        inputMode="numeric"
                        maxLength={6}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        disabled={isSendingCode || authConfig?.emailCode === false || !email.trim()}
                        onClick={() => void sendEmailCode()}
                      >
                        {isSendingCode ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <Send className="h-4 w-4" aria-hidden="true" />
                        )}
                        Send code
                      </Button>
                    </div>
                    <Button type="submit" variant="secondary" disabled={isVerifyingCode || emailCode.length < 6}>
                      {isVerifyingCode ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Mail className="h-4 w-4" aria-hidden="true" />
                      )}
                      Continue with email
                    </Button>
                  </form>
                  <Separator />
                </div>
              ) : null}
              <form className="grid gap-4" onSubmit={submit}>
                {mode === "signup" ? (
                  <label className="grid gap-1.5 text-sm font-medium">
                    Name
                    <Input value={name} onChange={(event) => setName(event.target.value)} />
                  </label>
                ) : null}
                <label className="grid gap-1.5 text-sm font-medium">
                  Email
                  <Input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-medium">
                  Password
                  <Input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                </label>
                {mode === "signup" ? (
                  <label className="grid gap-1.5 text-sm font-medium">
                    Workspace
                    <Input
                      value={workspaceName}
                      onChange={(event) => setWorkspaceName(event.target.value)}
                    />
                  </label>
                ) : null}
                {message ? <p className="text-sm text-destructive">{message}</p> : null}
                <Button type="submit" disabled={isLoading || isSubmitting}>
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <KeyRound className="h-4 w-4" aria-hidden="true" />
                  )}
                  {mode === "login" ? "Sign in" : "Create account"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </main>
  );
}
