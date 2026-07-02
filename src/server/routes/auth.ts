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
  app.get("/api/session", async (req, res) => {
    const context = await getAuthContext(req);
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

    res.json(await buildSessionPayload(context.account));
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const account = await loginAccount(String(req.body?.email ?? ""), String(req.body?.password ?? ""));
      const token = await createSession(account.id);
      res.json({ token, ...(await buildSessionPayload(account)) });
    } catch (error) {
      sendError(res, error, 401);
    }
  });

  app.post("/api/auth/signup", async (req, res) => {
    try {
      const account = await signUpAccount({
        email: String(req.body?.email ?? ""),
        name: String(req.body?.name ?? ""),
        password: String(req.body?.password ?? ""),
        workspaceName:
          typeof req.body?.workspaceName === "string" ? req.body.workspaceName : undefined
      });
      const token = await createSession(account.id);
      res.status(201).json({ token, ...(await buildSessionPayload(account)) });
    } catch (error) {
      sendError(res, error, 400);
    }
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
