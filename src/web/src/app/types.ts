export type View =
  | "landing"
  | "device"
  | "assets"
  | "asset-detail"
  | "workspace"
  | "account";

export type AppShellView = Exclude<View, "landing" | "device">;

export interface AppRoute {
  view: View;
  assetQuery?: string;
}
