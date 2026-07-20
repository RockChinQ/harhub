export type View =
  | "landing"
  | "device"
  | "share"
  | "assets"
  | "asset-detail"
  | "projects"
  | "project-detail"
  | "forge"
  | "workspace"
  | "account";

export type AppShellView = Exclude<View, "landing" | "device" | "share">;

export interface AppRoute {
  view: View;
  assetQuery?: string;
  forgeSessionId?: string;
  projectId?: string;
  shareToken?: string;
}
