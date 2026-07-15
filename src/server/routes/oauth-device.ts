import type { Express, Response } from "express";
import {
  HARHUB_CLI_CLIENT_ID,
  HARHUB_CLI_SCOPE,
  OAUTH_DEVICE_GRANT_TYPE,
  type OAuthDeviceTokenErrorCode
} from "../../shared/oauth.js";
import {
  createDeviceAuthorization,
  decideDeviceAuthorization,
  getDeviceAuthorization,
  pollDeviceAuthorization
} from "../../state/index.js";
import { requireAuth } from "../auth.js";
import { publicAppUrl } from "../services/oauth.js";

export function registerOAuthDeviceRoutes(app: Express): void {
  app.get("/.well-known/oauth-authorization-server", (req, res) => {
    const issuer = publicAppUrl(req);
    res.json({
      issuer,
      token_endpoint: `${issuer}/api/oauth/token`,
      device_authorization_endpoint: `${issuer}/api/oauth/device/code`,
      grant_types_supported: [OAUTH_DEVICE_GRANT_TYPE],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: [HARHUB_CLI_SCOPE]
    });
  });

  app.post("/api/oauth/device/code", async (req, res) => {
    const clientId = readString(req.body?.client_id);
    const scope = readString(req.body?.scope) || HARHUB_CLI_SCOPE;
    if (!clientId) {
      sendOAuthError(res, "invalid_request", "client_id is required.");
      return;
    }
    if (clientId !== HARHUB_CLI_CLIENT_ID) {
      sendOAuthError(res, "invalid_client", "The OAuth client is not registered.");
      return;
    }
    if (scope !== HARHUB_CLI_SCOPE) {
      sendOAuthError(res, "invalid_scope", "The requested scope is not supported.");
      return;
    }

    const authorization = await createDeviceAuthorization({ clientId, scope });
    const verificationUri = `${publicAppUrl(req)}/device`;
    noStore(res);
    res.json({
      device_code: authorization.deviceCode,
      user_code: authorization.userCode,
      verification_uri: verificationUri,
      verification_uri_complete:
        `${verificationUri}?user_code=${encodeURIComponent(authorization.userCode)}`,
      expires_in: authorization.expiresIn,
      interval: authorization.interval
    });
  });

  app.post("/api/oauth/token", async (req, res) => {
    const grantType = readString(req.body?.grant_type);
    const deviceCode = readString(req.body?.device_code);
    const clientId = readString(req.body?.client_id);
    if (grantType !== OAUTH_DEVICE_GRANT_TYPE) {
      sendOAuthError(
        res,
        "unsupported_grant_type",
        "Only the OAuth device authorization grant is supported."
      );
      return;
    }
    if (!clientId || clientId !== HARHUB_CLI_CLIENT_ID) {
      sendOAuthError(res, "invalid_client", "The OAuth client is not registered.");
      return;
    }
    if (!deviceCode) {
      sendOAuthError(res, "invalid_request", "device_code is required.");
      return;
    }

    const result = await pollDeviceAuthorization({ deviceCode, clientId });
    noStore(res);
    if (result.status === "authorized") {
      res.json({
        access_token: result.accessToken,
        token_type: "Bearer",
        scope: result.scope
      });
      return;
    }

    const descriptions: Record<typeof result.status, string> = {
      authorization_pending: "The user has not completed authorization yet.",
      slow_down: "The client is polling too quickly.",
      access_denied: "The user denied the authorization request.",
      expired_token: "The device authorization has expired.",
      invalid_grant: "The device code is invalid or has already been used."
    };
    sendOAuthError(res, result.status, descriptions[result.status]);
  });

  app.get("/api/oauth/device/authorization", async (req, res) => {
    const context = await requireAuth(req, res);
    if (!context) return;
    try {
      res.json(
        await getDeviceAuthorization(
          typeof req.query.user_code === "string" ? req.query.user_code : ""
        )
      );
    } catch (error) {
      res.status(404).json({
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.post("/api/oauth/device/authorization", async (req, res) => {
    const context = await requireAuth(req, res);
    if (!context) return;
    const action = readString(req.body?.action);
    if (action !== "approve" && action !== "deny") {
      res.status(400).json({ error: "action must be approve or deny." });
      return;
    }

    try {
      res.json(
        await decideDeviceAuthorization({
          userCode: readString(req.body?.userCode),
          accountId: context.account.id,
          approve: action === "approve"
        })
      );
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function noStore(res: Response): void {
  res.set("Cache-Control", "no-store");
  res.set("Pragma", "no-cache");
}

function sendOAuthError(
  res: Response,
  error: OAuthDeviceTokenErrorCode,
  description: string
): void {
  noStore(res);
  res.status(400).json({ error, error_description: description });
}
