export type View =
  | "landing"
  | "blog"
  | "device"
  | "share"
  | "assets"
  | "asset-detail"
  | "mcps"
  | "mcp-detail"
  | "projects"
  | "project-detail"
  | "forge"
  | "workspace"
  | "account";

export type AppShellView = Exclude<View, "landing" | "blog" | "device" | "share">;

export interface AppRoute {
  view: View;
  assetQuery?: string;
  forgeSessionId?: string;
  projectId?: string;
  projectImport?: "github";
  shareToken?: string;
  blogSlug?: string;
}
