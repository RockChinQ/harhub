import type { AssetRecord } from "../../../shared/types";

export function routeQueryForAsset(asset: AssetRecord): string {
  return asset.slug || asset.name || asset.id;
}

export function findUiAsset(assets: AssetRecord[], query: string): AssetRecord | undefined {
  const normalized = query.toLowerCase();
  return assets.find((asset) =>
    [asset.id, asset.slug, asset.name, asset.displayName]
      .filter(Boolean)
      .some((value) => value.toLowerCase() === normalized)
  );
}
