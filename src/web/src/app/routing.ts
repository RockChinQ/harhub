import type { AppRoute, View } from "./types";

export function readRouteFromLocation(): AppRoute {
  return normalizeRoute(routeFromPath(window.location.pathname));
}

export function routeFromPath(pathname: string): AppRoute {
  const segments = pathname.split("/").filter(Boolean);
  const section = segments[0];

  if (!section) return { view: "landing" };

  if (section === "skills" || section === "assets") {
    const assetQuery = segments[1] ? decodeRoutePart(segments.slice(1).join("/")) : undefined;
    return assetQuery ? { view: "asset-detail", assetQuery } : { view: "assets" };
  }

  if (section === "workspace") return { view: "workspace" };
  if (section === "account") return { view: "account" };
  if (section === "device") return { view: "device" };

  return { view: "assets" };
}

export function normalizeRoute(route: AppRoute): AppRoute {
  if (route.view === "asset-detail" && !route.assetQuery) {
    return { view: "assets" };
  }
  return route;
}

export function pathForRoute(route: AppRoute): string {
  if (route.view === "asset-detail" && route.assetQuery) {
    return `/skills/${encodeURIComponent(route.assetQuery)}`;
  }
  if (route.view === "workspace") return "/workspace";
  if (route.view === "account") return "/account";
  if (route.view === "device") return "/device";
  if (route.view === "landing") return "/";
  return "/skills";
}

export function replaceBrowserRoute(route: AppRoute): void {
  const path = pathForRoute(normalizeRoute(route));
  if (window.location.pathname !== path) {
    window.history.replaceState(null, "", path);
  }
}

export function viewTitle(view: View): string {
  if (view === "asset-detail") return "Skill Detail";
  if (view === "workspace") return "Workspace";
  if (view === "account") return "Account";
  if (view === "device") return "Authorize Device";
  if (view === "landing") return "Home";
  return "Skills";
}

function decodeRoutePart(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
