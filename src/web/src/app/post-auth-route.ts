import type { AppRoute } from "./types";

export function routeAfterAuthentication(route: AppRoute): AppRoute {
  return route.view === "landing" ? { view: "projects" } : route;
}
