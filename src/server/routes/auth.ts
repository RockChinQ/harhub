import type { Express } from "express";
import {
  changeAccountPassword,
  createSession,
  deleteSession,
  loginAccount,
  signUpAccount,
  updateAccountProfile
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

export function registerAuthRoutes(app: Express): void {
  app.get("/api/session", (req, res) => {
    const context = getAuthContext(req);
    if (!context) {
      res.status(401).json({
        error: "Not signed in",
        demo: {
          email: "admin@harhub.local",
          password: "harhub"
        }
      });
      return;
    }

    res.json(buildSessionPayload(context.account));
  });

  app.post("/api/auth/login", (req, res) => {
    try {
      const account = loginAccount(String(req.body?.email ?? ""), String(req.body?.password ?? ""));
      const token = createSession(account.id);
      res.json({ token, ...buildSessionPayload(account) });
    } catch (error) {
      sendError(res, error, 401);
    }
  });

  app.post("/api/auth/signup", (req, res) => {
    try {
      const account = signUpAccount({
        email: String(req.body?.email ?? ""),
        name: String(req.body?.name ?? ""),
        password: String(req.body?.password ?? ""),
        workspaceName:
          typeof req.body?.workspaceName === "string" ? req.body.workspaceName : undefined
      });
      const token = createSession(account.id);
      res.status(201).json({ token, ...buildSessionPayload(account) });
    } catch (error) {
      sendError(res, error, 400);
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    const token = getBearerToken(req);
    if (token) deleteSession(token);
    res.status(204).send();
  });

  app.patch("/api/account", (req, res) => {
    const context = requireAuth(req, res);
    if (!context) return;

    try {
      const account = updateAccountProfile(context.account.id, {
        name: typeof req.body?.name === "string" ? req.body.name : undefined,
        email: typeof req.body?.email === "string" ? req.body.email : undefined
      });
      res.json(buildSessionPayload(account));
    } catch (error) {
      sendError(res, error, 400);
    }
  });

  app.post("/api/account/password", (req, res) => {
    const context = requireAuth(req, res);
    if (!context) return;

    try {
      changeAccountPassword(context.account.id, {
        currentPassword: String(req.body?.currentPassword ?? ""),
        newPassword: String(req.body?.newPassword ?? "")
      });
      res.status(204).send();
    } catch (error) {
      sendError(res, error, 400);
    }
  });
}
