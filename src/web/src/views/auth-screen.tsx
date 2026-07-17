import { Github, KeyRound, Loader2, LogIn, Mail, Send } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

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
import { Separator } from "../components/ui/separator";
import {
  developmentLogin,
  getAuthConfig,
  login,
  requestEmailCode,
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | undefined>(error);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDevelopmentLoginSubmitting, setIsDevelopmentLoginSubmitting] = useState(false);
  const [authConfig, setAuthConfig] = useState<AuthConfigResponse>();
  const [isAuthConfigLoading, setIsAuthConfigLoading] = useState(true);
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
      .catch((caught) => {
        setMessage(caught instanceof Error ? caught.message : "Sign-in options could not be loaded.");
      })
      .finally(() => setIsAuthConfigLoading(false));
  }, []);

  async function submitPassword(event: FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage(undefined);
    try {
      const response = await login({ email, password, inviteToken });
      onAuthenticated(response);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitDevelopmentLogin() {
    setIsDevelopmentLoginSubmitting(true);
    setMessage(undefined);
    try {
      const response = await developmentLogin({ email, inviteToken });
      onAuthenticated(response);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsDevelopmentLoginSubmitting(false);
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
    const redirect = `${window.location.pathname}${window.location.search}` || "/skills";
    const params = new URLSearchParams({ redirect });
    if (inviteToken) params.set("invite", inviteToken);
    window.location.href = `/api/auth/oauth/${provider}/start?${params.toString()}`;
  }

  const hasOAuth = Boolean(authConfig?.oauth.google || authConfig?.oauth.github);
  const hasEmailAuth = Boolean(
    authConfig?.developmentLogin || authConfig?.password || authConfig?.emailCode
  );
  const hasAnyAuth = Boolean(hasOAuth || hasEmailAuth);
  const hasBothOAuthProviders = Boolean(authConfig?.oauth.google && authConfig?.oauth.github);

  return (
    <main className="flex min-h-[100dvh] items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Harhub</CardTitle>
          <CardDescription>
            {inviteToken
              ? "Continue to accept your workspace invitation."
              : "Continue to your workspace. New accounts are created automatically."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {isAuthConfigLoading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Loading sign-in options
            </div>
          ) : authConfig ? (
            <>
              {hasOAuth ? (
                <div className={`grid gap-2 ${hasBothOAuthProviders ? "sm:grid-cols-2" : ""}`}>
                  {authConfig.oauth.google ? (
                    <Button type="button" variant="outline" onClick={() => startOAuth("google")}>
                      <span className="flex h-4 w-4 items-center justify-center rounded-full border text-[10px] font-semibold">
                        G
                      </span>
                      Continue with Google
                    </Button>
                  ) : null}
                  {authConfig.oauth.github ? (
                    <Button type="button" variant="outline" onClick={() => startOAuth("github")}>
                      <Github className="h-4 w-4" aria-hidden="true" />
                      Continue with GitHub
                    </Button>
                  ) : null}
                </div>
              ) : null}

              {hasOAuth && hasEmailAuth ? <Separator /> : null}

              {hasEmailAuth ? (
                <label className="grid gap-2 text-sm font-medium">
                  Email
                  <Input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="email"
                    placeholder={authConfig.developmentLogin ? "admin@harhub.local" : undefined}
                    required
                  />
                </label>
              ) : null}

              {authConfig.developmentLogin ? (
                <div className="grid gap-3 rounded-lg border border-amber-200 bg-amber-50/70 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className="border-amber-300 bg-background text-amber-900"
                    >
                      Development mode
                    </Badge>
                    <span className="text-xs text-amber-900/80">
                      Password verification is bypassed.
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={isLoading || isDevelopmentLoginSubmitting || !email.trim()}
                    onClick={() => void submitDevelopmentLogin()}
                  >
                    {isDevelopmentLoginSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <LogIn className="h-4 w-4" aria-hidden="true" />
                    )}
                    Continue as this account
                  </Button>
                </div>
              ) : null}

              {authConfig.developmentLogin && (authConfig.password || authConfig.emailCode) ? (
                <Separator />
              ) : null}

              {authConfig.password ? (
                <form className="grid gap-4" onSubmit={submitPassword}>
                  <label className="grid gap-2 text-sm font-medium">
                    Password
                    <Input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      autoComplete="current-password"
                      minLength={6}
                      required
                    />
                    <span className="text-xs font-normal text-muted-foreground">
                      Use at least 6 characters. A new email creates an account and workspace.
                    </span>
                  </label>
                  <Button
                    type="submit"
                    disabled={isLoading || isSubmitting || !email.trim() || password.length < 6}
                  >
                    {isSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <KeyRound className="h-4 w-4" aria-hidden="true" />
                    )}
                    Continue
                  </Button>
                </form>
              ) : null}

              {authConfig.password && authConfig.emailCode ? <Separator /> : null}

              {authConfig.emailCode ? (
                <form className="grid gap-3" onSubmit={submitEmailCode}>
                  <label className="grid gap-2 text-sm font-medium">
                    Email verification code
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                      <Input
                        value={emailCode}
                        onChange={(event) => setEmailCode(event.target.value)}
                        placeholder="6-digit code"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        disabled={isSendingCode || !email.trim()}
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
                  </label>
                  <Button
                    type="submit"
                    variant="secondary"
                    disabled={isVerifyingCode || !email.trim() || emailCode.length < 6}
                  >
                    {isVerifyingCode ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Mail className="h-4 w-4" aria-hidden="true" />
                    )}
                    Continue with email code
                  </Button>
                </form>
              ) : null}

              {!hasAnyAuth ? (
                <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                  No sign-in methods are configured. Contact the Harhub administrator.
                </p>
              ) : null}
            </>
          ) : null}

          {message ? <p className="text-sm text-destructive">{message}</p> : null}
        </CardContent>
      </Card>
    </main>
  );
}
