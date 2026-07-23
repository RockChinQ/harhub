import type { Request } from "express";
import type { AuthProvider } from "../../shared/types.js";
import {
  GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  PUBLIC_APP_URL
} from "../config.js";
import {
  resolveGitHubEmail,
  type GitHubEmailRecordSource,
  type GitHubProfileEmailSource
} from "./github-email.js";

export interface OAuthProfile {
  provider: AuthProvider;
  providerAccountId: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

export interface OAuthEmailVerificationProof {
  provider: AuthProvider;
  providerAccountId: string;
  name: string;
}

export class OAuthEmailVerificationRequiredError extends Error {
  constructor(readonly proof: OAuthEmailVerificationProof) {
    super("GitHub requires email verification to finish signing in.");
    this.name = "OAuthEmailVerificationRequiredError";
  }
}

export function buildGitHubOAuthProfile(
  profile: GitHubProfileEmailSource,
  emailRecords: GitHubEmailRecordSource[]
): OAuthProfile {
  const providerAccountId =
    typeof profile.id === "number" || typeof profile.id === "string"
      ? String(profile.id).trim()
      : "";
  if (!providerAccountId) throw new Error("GitHub profile did not include a stable account ID.");
  const fallbackName = typeof profile.login === "string" && profile.login.trim()
    ? profile.login.trim()
    : "GitHub User";
  const name = typeof profile.name === "string" && profile.name.trim()
    ? profile.name.trim()
    : fallbackName;
  let resolvedEmail;
  try {
    resolvedEmail = resolveGitHubEmail(profile, emailRecords);
  } catch {
    throw new OAuthEmailVerificationRequiredError({
      provider: "github",
      providerAccountId,
      name
    });
  }
  return {
    provider: "github",
    providerAccountId,
    email: resolvedEmail.email,
    emailVerified: resolvedEmail.emailVerified,
    name
  };
}

export function oauthProviderConfigured(provider: AuthProvider): boolean {
  if (provider === "google") return Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
  return Boolean(GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET);
}

export function buildOAuthAuthorizationUrl(input: {
  provider: AuthProvider;
  state: string;
  redirectUri: string;
}): string {
  if (input.provider === "google") {
    if (!GOOGLE_CLIENT_ID) throw new Error("Google OAuth is not configured.");
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", GOOGLE_CLIENT_ID);
    url.searchParams.set("redirect_uri", input.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("state", input.state);
    url.searchParams.set("access_type", "online");
    url.searchParams.set("prompt", "select_account");
    return url.toString();
  }

  if (!GITHUB_CLIENT_ID) throw new Error("GitHub OAuth is not configured.");
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", GITHUB_CLIENT_ID);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("scope", "read:user user:email");
  url.searchParams.set("state", input.state);
  return url.toString();
}

export async function exchangeOAuthCode(input: {
  provider: AuthProvider;
  code: string;
  redirectUri: string;
}): Promise<OAuthProfile> {
  return input.provider === "google"
    ? exchangeGoogleCode(input.code, input.redirectUri)
    : exchangeGitHubCode(input.code, input.redirectUri);
}

export function oauthRedirectUri(req: Request, provider: AuthProvider): string {
  return `${publicAppUrl(req)}/api/auth/oauth/${provider}/callback`;
}

export function publicAppUrl(req: Request): string {
  if (PUBLIC_APP_URL) return PUBLIC_APP_URL.replace(/\/+$/g, "");
  const protocol = String(req.headers["x-forwarded-proto"] ?? req.protocol ?? "http")
    .split(",")[0]
    .trim();
  return `${protocol}://${req.get("host")}`;
}

async function exchangeGoogleCode(code: string, redirectUri: string): Promise<OAuthProfile> {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error("Google OAuth is not configured.");
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code"
    })
  });
  const tokenData = await tokenResponse.json().catch(() => undefined);
  if (!tokenResponse.ok || typeof tokenData?.access_token !== "string") {
    throw new Error("Google OAuth token exchange failed.");
  }

  const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` }
  });
  const profile = await profileResponse.json().catch(() => undefined);
  if (
    !profileResponse.ok ||
    typeof profile?.sub !== "string" ||
    typeof profile?.email !== "string"
  ) {
    throw new Error("Google OAuth profile fetch failed.");
  }

  return {
    provider: "google",
    providerAccountId: profile.sub,
    email: profile.email,
    emailVerified: profile.email_verified === true,
    name:
      typeof profile.name === "string" && profile.name.trim()
        ? profile.name
        : profile.email
  };
}

async function exchangeGitHubCode(code: string, redirectUri: string): Promise<OAuthProfile> {
  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    throw new Error("GitHub OAuth is not configured.");
  }

  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri
    })
  });
  const tokenData = await tokenResponse.json().catch(() => undefined);
  if (!tokenResponse.ok || typeof tokenData?.access_token !== "string") {
    throw new Error("GitHub OAuth token exchange failed.");
  }

  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${tokenData.access_token}`,
    "User-Agent": "Harhub"
  };
  const profileResponse = await fetch("https://api.github.com/user", { headers });
  const profile = await profileResponse.json().catch(() => undefined);
  if (!profileResponse.ok || typeof profile?.id !== "number") {
    throw new Error("GitHub OAuth profile fetch failed.");
  }

  const emailsResponse = await fetch("https://api.github.com/user/emails", { headers });
  const emails = await emailsResponse.json().catch(() => undefined);
  const emailRecords = emailsResponse.ok && Array.isArray(emails) ? emails : [];
  try {
    return buildGitHubOAuthProfile(profile, emailRecords);
  } catch (error) {
    const login = typeof profile.login === "string" ? profile.login.trim() : "";
    if (!(error instanceof OAuthEmailVerificationRequiredError) || !login) throw error;

    const publicProfileUrl = new URL(
      `https://api.github.com/users/${encodeURIComponent(login)}`
    );
    publicProfileUrl.searchParams.set("harhub_email", String(Date.now()));
    const publicProfileResponse = await fetch(publicProfileUrl, {
      cache: "no-store",
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "Harhub"
      }
    });
    const publicProfile = await publicProfileResponse.json().catch(() => undefined);
    if (
      publicProfileResponse.ok &&
      publicProfile?.id === profile.id &&
      typeof publicProfile.email === "string" &&
      publicProfile.email.trim()
    ) {
      return buildGitHubOAuthProfile(publicProfile, [
        { email: publicProfile.email, verified: true }
      ]);
    }
    throw error;
  }
}
