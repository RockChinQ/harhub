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
  if (route.view === "blog") {
    return route.blogSlug
      ? "Harhub：面向团队的 Agent Skills 与 MCP 资产治理平台 — Harhub Blog"
      : "Harhub Blog — Agent Skills, MCPs, and GitHub workflows";
  }
  if (route.view === "landing" && !inviteToken) return undefined;
  if (!authenticated) return inviteToken ? "Join Workspace" : "Sign in";
  if (route.view === "landing") return undefined;
  if (route.view === "device") return "Authorize Device";
  if (route.view === "asset-detail") return assetName || "Skill";
  if (route.view === "mcp-detail") return assetName || "MCP";
  if (route.view === "mcps") return "MCPs";
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
