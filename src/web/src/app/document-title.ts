import { useEffect } from "react";

import type { AppRoute } from "./types";

const APP_NAME = "Harhub";

export function appPageTitle({
  route,
  authenticated,
  inviteToken,
  assetName,
  workspaceName,
  accountName
}: {
  route: AppRoute;
  authenticated: boolean;
  inviteToken?: string;
  assetName?: string;
  workspaceName?: string;
  accountName?: string;
}): string | undefined {
  if (route.view === "share") return "Shared Skill";
  if (route.view === "landing" && !inviteToken) return undefined;
  if (!authenticated) return inviteToken ? "Join Workspace" : "Sign in";
  if (route.view === "landing") return undefined;
  if (route.view === "device") return "Authorize Device";
  if (route.view === "asset-detail") return assetName || "Skill";
  if (route.view === "assets") return "Skills";
  if (route.view === "projects") return "Projects";
  if (route.view === "project-detail") return "Project";
  if (route.view === "forge") return "Forge";
  if (route.view === "workspace") {
    return workspaceName ? `${workspaceName} · Workspace` : "Workspace";
  }
  if (route.view === "account") {
    return accountName ? `${accountName} · Account` : "Account";
  }
  return APP_NAME;
}

export function formatDocumentTitle(pageTitle?: string): string {
  const normalizedTitle = pageTitle?.trim();
  if (!normalizedTitle || normalizedTitle === APP_NAME) return APP_NAME;
  return `${normalizedTitle} · ${APP_NAME}`;
}

export function useDocumentTitle(pageTitle?: string): void {
  useEffect(() => {
    document.title = formatDocumentTitle(pageTitle);
  }, [pageTitle]);
}
