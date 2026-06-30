export type View = "assets" | "asset-detail" | "workspace" | "account";

export interface AppRoute {
  view: View;
  assetQuery?: string;
}
