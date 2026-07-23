import type { Express } from "express";
import type { AuthProvider } from "../../shared/types.js";
import {
  changeAccountPassword,
  consumeOAuthState,
  createEmailLoginCode,
  createOAuthEmailVerification,
  createOAuthState,
  deleteSession,
  getInvitationByToken,
  signInForDevelopment,
  signInWithOAuthProfile,
  signInWithPassword,
  updateAccountProfile,
  verifyEmailLoginCode
} from "../../state/index.js";
import {
  buildSessionPayload,
  getAuthContext,
  requireAuth
} from "../auth.js";
import {
  getBearerToken,
  sendError
} from "../utils/http.js";
import {
  isEmailDeliveryConfigured,
  sendLoginCodeEmail
} from "../services/email.js";
import {
  buildOAuthAuthorizationUrl,
  exchangeOAuthCode,
  OAuthEmailVerificationRequiredError,
  oauthProviderConfigured,
  oauthRedirectUri
} from "../services/oauth.js";
import { DEVELOPMENT_LOGIN_ENABLED, PASSWORD_LOGIN_ENABLED } from "../config.js";

export function registerAuthRoutes(app: Express): void {
  app.get("/api/auth/config", (_req, res) => {
    res.json({
      developmentLogin: DEVELOPMENT_LOGIN_ENABLED,
      password: PASSWORD_LOGIN_ENABLED,
      emailCode: isEmailDeliveryConfigured(),
      oauth: {
        google: oauthProviderConfigured("google"),
        github: oauthProviderConfigured("github")
      }
    });
  });

  app.post("/api/auth/dev-login", async (req, res) => {
    if (!DEVELOPMENT_LOGIN_ENABLED) {
      res.status(404).json({ error: "Not found." });
      return;
    }

    try {
      const { account, token } = await signInForDevelopment({
        email: String(req.body?.email ?? ""),
        inviteToken:
          typeof req.body?.inviteToken === "string" ? req.body.inviteToken : undefined
      }, true);
      res.set("Cache-Control", "no-store");
      res.json({ token, ...(await buildSessionPayload(account)) });
    } catch (error) {
      sendError(res, error, 401);
    }
  });

  app.get("/api/session", async (req, res) => {
    const context = await getAuthContext(req);
    if (!context) {
      res.status(401).json({
        error: "Not signed in",
        ...(PASSWORD_LOGIN_ENABLED
          ? {
              demo: {
                email: "admin@harhub.local",
                password: "harhub"
              }
            }
          : {})
      });
      return;
    }

    res.json(await buildSessionPayload(context.account));
  });

  app.post("/api/auth/login", async (req, res) => {
    if (!PASSWORD_LOGIN_ENABLED) {
      res.status(403).json({ error: "Password authentication is disabled." });
      return;
    }

    try {
      const { account, token } = await signInWithPassword({
        email: String(req.body?.email ?? ""),
        password: String(req.body?.password ?? ""),
        inviteToken:
          typeof req.body?.inviteToken === "string" ? req.body.inviteToken : undefined
      }, true);
      res.json({ token, ...(await buildSessionPayload(account)) });
    } catch (error) {
      sendError(res, error, 401);
    }
  });

  app.post("/api/auth/email-code/request", async (req, res) => {
    try {
      const result = await createEmailLoginCode({
        email: String(req.body?.email ?? ""),
        inviteToken:
          typeof req.body?.inviteToken === "string" ? req.body.inviteToken : undefined,
        oauthEmailVerificationToken:
          typeof req.body?.oauthEmailVerificationToken === "string"
            ? req.body.oauthEmailVerificationToken
            : undefined
      });
      await sendLoginCodeEmail({
        email: result.email,
        code: result.code
      });
      res.json({ sent: true, expiresAt: result.expiresAt });
    } catch (error) {
      sendError(res, error, 400);
    }
  });

  app.post("/api/auth/email-code/verify", async (req, res) => {
    try {
      const { account, token } = await verifyEmailLoginCodeRoute(req.body);
      res.json({ token, ...(await buildSessionPayload(account)) });
    } catch (error) {
      sendError(res, error, 401);
    }
  });

  app.get("/api/auth/oauth/:provider/start", async (req, res) => {
    const provider = readProvider(req.params.provider);
    if (!provider) {
      res.status(404).json({ error: "OAuth provider not found." });
      return;
    }

    try {
      const state = await createOAuthState({
        provider,
        redirectPath: typeof req.query.redirect === "string" ? req.query.redirect : "/skills",
        inviteToken: typeof req.query.invite === "string" ? req.query.invite : undefined
      });
      res.redirect(buildOAuthAuthorizationUrl({
        provider,
        state: state.state,
        redirectUri: oauthRedirectUri(req, provider)
      }));
    } catch (error) {
      sendError(res, error, 400);
    }
  });

  app.get("/api/auth/oauth/:provider/callback", async (req, res) => {
    const provider = readProvider(req.params.provider);
    if (!provider) {
      res.status(404).send("OAuth provider not found.");
      return;
    }

    let oauthState: Awaited<ReturnType<typeof consumeOAuthState>> | undefined;
    try {
      oauthState = await consumeOAuthState(provider, String(req.query.state ?? ""));
      const profile = await exchangeOAuthCode({
        provider,
        code: String(req.query.code ?? ""),
        redirectUri: oauthRedirectUri(req, provider)
      });
      const { account, token } = await signInWithOAuthProfile({
        ...profile,
        inviteToken: oauthState.inviteToken
      }, true);
      res.type("html").send(authCallbackHtml({
        token,
        redirectPath: oauthState.redirectPath
      }));
    } catch (error) {
      if (error instanceof OAuthEmailVerificationRequiredError && oauthState) {
        try {
          if (!isEmailDeliveryConfigured()) {
            throw new Error(
              "GitHub did not share a verified email, and email verification is not configured."
            );
          }
          const pending = await createOAuthEmailVerification({
            ...error.proof,
            redirectPath: oauthState.redirectPath,
            inviteToken: oauthState.inviteToken
          });
          res.type("html").send(authCallbackHtml({
            oauthEmailVerification: {
              token: pending.token,
              provider: error.proof.provider,
              expiresAt: pending.expiresAt
            },
            redirectPath: pending.redirectPath
          }));
          return;
        } catch (pendingError) {
          error = pendingError;
        }
      }
      res.status(400).type("html").send(authCallbackHtml({
        error: error instanceof Error ? error.message : String(error),
        redirectPath: "/"
      }));
    }
  });

  app.get("/api/invitations/:token", async (req, res) => {
    const result = await getInvitationByToken(req.params.token);
    if (!result) {
      res.status(404).json({ error: "Invitation not found." });
      return;
    }

    res.json({
      invitation: result.invitation,
      workspace: result.workspace
    });
  });

  app.post("/api/auth/logout", async (req, res) => {
    const token = getBearerToken(req);
    if (token) await deleteSession(token);
    res.status(204).send();
  });

  app.patch("/api/account", async (req, res) => {
    const context = await requireAuth(req, res);
    if (!context) return;

    try {
      const account = await updateAccountProfile(context.account.id, {
        name: typeof req.body?.name === "string" ? req.body.name : undefined,
        email: typeof req.body?.email === "string" ? req.body.email : undefined
      });
      res.json(await buildSessionPayload(account));
    } catch (error) {
      sendError(res, error, 400);
    }
  });

  app.post("/api/account/password", async (req, res) => {
    const context = await requireAuth(req, res);
    if (!context) return;

    if (!PASSWORD_LOGIN_ENABLED) {
      res.status(403).json({ error: "Password authentication is disabled." });
      return;
    }

    try {
      await changeAccountPassword(context.account.id, {
        currentPassword: String(req.body?.currentPassword ?? ""),
        newPassword: String(req.body?.newPassword ?? "")
      });
      res.status(204).send();
    } catch (error) {
      sendError(res, error, 400);
    }
  });
}

async function verifyEmailLoginCodeRoute(body: unknown) {
  return verifyEmailLoginCode({
    email: String((body as { email?: unknown })?.email ?? ""),
    code: String((body as { code?: unknown })?.code ?? ""),
    inviteToken:
      typeof (body as { inviteToken?: unknown })?.inviteToken === "string"
        ? (body as { inviteToken: string }).inviteToken
        : undefined,
    oauthEmailVerificationToken:
      typeof (body as { oauthEmailVerificationToken?: unknown })?.oauthEmailVerificationToken === "string"
        ? (body as { oauthEmailVerificationToken: string }).oauthEmailVerificationToken
        : undefined
  }, true);
}

function readProvider(value: string): AuthProvider | undefined {
  return value === "google" || value === "github" ? value : undefined;
}

function authCallbackHtml(input: {
  token?: string;
  error?: string;
  oauthEmailVerification?: {
    token: string;
    provider: AuthProvider;
    expiresAt: string;
  };
  redirectPath: string;
}): string {
  const payload = JSON.stringify(input).replace(/</g, "\\u003c");
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Harhub Authentication</title>
  </head>
  <body>
    <script>
      const payload = ${payload};
      if (payload.token) {
        localStorage.setItem("harhub.token", payload.token);
        sessionStorage.removeItem("harhub.oauth_email_verification");
      }
      if (payload.oauthEmailVerification) {
        sessionStorage.setItem(
          "harhub.oauth_email_verification",
          JSON.stringify(payload.oauthEmailVerification)
        );
        sessionStorage.removeItem("harhub.auth_error");
      }
      if (payload.error) {
        sessionStorage.setItem("harhub.auth_error", payload.error);
      }
      window.location.replace(payload.redirectPath || "/skills");
    </script>
  </body>
</html>`;
}
