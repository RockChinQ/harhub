import { useEffect, useMemo, useState } from "react";

import type {
  AssetRecord,
  StorageStatus,
  ValidationIssue,
  WorkspaceRecord
} from "../../shared/types";
import { AppContent } from "./app/app-content";
import { AppLayout } from "./app/app-layout";
import { findUiAsset, routeQueryForAsset } from "./app/asset-utils";
import { TOKEN_KEY, WORKSPACE_KEY } from "./app/constants";
import {
  normalizeRoute,
  pathForRoute,
  readRouteFromLocation,
  replaceBrowserRoute
} from "./app/routing";
import type { AppRoute } from "./app/types";
import {
  getSession,
  getWorkspaceAssets,
  logout,
  type AuthResponse,
  type SessionResponse
} from "./lib/api";
import { AuthScreen } from "./views/auth-screen";

export function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) ?? "");
  const [session, setSession] = useState<SessionResponse | undefined>();
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(
    () => localStorage.getItem(WORKSPACE_KEY) ?? ""
  );
  const [route, setRoute] = useState<AppRoute>(() => readRouteFromLocation());
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [storageStatus, setStorageStatus] = useState<StorageStatus | undefined>();
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const view = route.view;

  useEffect(() => {
    if (!token) {
      setIsLoading(false);
      return;
    }

    void loadSession(token);
  }, [token]);

  useEffect(() => {
    const nextRoute = readRouteFromLocation();
    replaceBrowserRoute(nextRoute);
    setRoute(nextRoute);

    function handlePopState() {
      setRoute(readRouteFromLocation());
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const activeWorkspace = useMemo(() => {
    if (!session) return undefined;
    return (
      session.workspaces.find((workspace) => workspace.id === activeWorkspaceId) ??
      session.workspaces[0]
    );
  }, [activeWorkspaceId, session]);
  const routedAsset = useMemo(
    () => route.assetQuery ? findUiAsset(assets, route.assetQuery) : undefined,
    [assets, route.assetQuery]
  );
  const selectedAsset = useMemo(
    () => routedAsset ?? assets.find((asset) => asset.id === selectedId),
    [assets, routedAsset, selectedId]
  );

  useEffect(() => {
    if (!activeWorkspace || !token) return;
    localStorage.setItem(WORKSPACE_KEY, activeWorkspace.id);
    void refreshAssets(activeWorkspace.id);
  }, [activeWorkspace?.id, token]);

  useEffect(() => {
    if (routedAsset && routedAsset.id !== selectedId) {
      setSelectedId(routedAsset.id);
    }
  }, [routedAsset?.id, selectedId]);

  function navigate(nextRoute: AppRoute, options: { replace?: boolean } = {}) {
    const normalizedRoute = normalizeRoute(nextRoute);
    const path = pathForRoute(normalizedRoute);

    if (options.replace) {
      window.history.replaceState(null, "", path);
    } else if (window.location.pathname !== path) {
      window.history.pushState(null, "", path);
    }

    setRoute(normalizedRoute);
  }

  async function loadSession(nextToken: string) {
    setIsLoading(true);
    setError(undefined);
    try {
      const nextSession = await getSession(nextToken);
      setSession(nextSession);
      const preferredWorkspace =
        nextSession.workspaces.find((workspace) => workspace.id === activeWorkspaceId) ??
        nextSession.workspaces[0];
      setActiveWorkspaceId(preferredWorkspace?.id ?? "");
    } catch (caught) {
      localStorage.removeItem(TOKEN_KEY);
      setToken("");
      setSession(undefined);
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsLoading(false);
    }
  }

  async function refreshAssets(workspaceId = activeWorkspace?.id) {
    if (!token || !workspaceId) return;
    setIsLoading(true);
    setError(undefined);
    try {
      const result = await getWorkspaceAssets(token, workspaceId);
      setAssets(result.assets);
      setIssues(result.issues);
      setStorageStatus(result.storage);
      const storedAssets = result.assets.filter((asset) => asset.storage);
      const routeAsset = route.assetQuery ? findUiAsset(storedAssets, route.assetQuery) : undefined;
      setSelectedId((current) =>
        routeAsset?.id ??
        (storedAssets.some((asset) => asset.id === current) ? current : storedAssets[0]?.id)
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsLoading(false);
    }
  }

  function handleAuth(response: AuthResponse) {
    localStorage.setItem(TOKEN_KEY, response.token);
    setToken(response.token);
    setSession(response);
    const workspace = response.workspaces[0];
    if (workspace) {
      setActiveWorkspaceId(workspace.id);
      localStorage.setItem(WORKSPACE_KEY, workspace.id);
    }
    navigate({ view: "assets" }, { replace: true });
  }

  async function handleLogout() {
    if (token) await logout(token).catch(() => undefined);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(WORKSPACE_KEY);
    setToken("");
    setSession(undefined);
    setAssets([]);
    setIssues([]);
    navigate({ view: "assets" }, { replace: true });
  }

  async function applySession(nextSession: SessionResponse, workspace?: WorkspaceRecord) {
    setSession(nextSession);
    if (workspace) {
      setActiveWorkspaceId(workspace.id);
      localStorage.setItem(WORKSPACE_KEY, workspace.id);
    }
    await refreshAssets(workspace?.id ?? activeWorkspace?.id);
  }

  if (!token || !session) {
    return (
      <AuthScreen
        isLoading={isLoading}
        error={error}
        onAuthenticated={handleAuth}
      />
    );
  }

  return (
    <AppLayout
      session={session}
      activeWorkspace={activeWorkspace}
      view={view}
      onNavigate={navigate}
      onWorkspaceChange={(workspaceId) => {
        setActiveWorkspaceId(workspaceId);
        navigate({ view: "assets" });
      }}
      onLogout={handleLogout}
    >
      <AppContent
        error={error}
        view={view}
        activeWorkspace={activeWorkspace}
        token={token}
        assets={assets}
        storage={storageStatus}
        issues={issues}
        query={query}
        tagFilter={tagFilter}
        isLoading={isLoading}
        selectedId={selectedId}
        selectedAsset={selectedAsset}
        session={session}
        onQueryChange={setQuery}
        onTagFilterChange={setTagFilter}
        onSelectAsset={setSelectedId}
        onOpenAssetDetail={(assetId) => {
          const asset = findUiAsset(assets, assetId);
          if (!asset) return;
          setSelectedId(asset.id);
          navigate({ view: "asset-detail", assetQuery: routeQueryForAsset(asset) });
        }}
        onRefreshAssets={refreshAssets}
        onNavigate={navigate}
        onSessionChange={applySession}
        onSessionSet={setSession}
        onPasswordChanged={handleLogout}
      />
    </AppLayout>
  );
}
