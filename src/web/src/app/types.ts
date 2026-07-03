export type View = "landing" | "assets" | "asset-detail" | "workspace" | "account";

export interface AppRoute {
  view: View;
  assetQuery?: string;
}
