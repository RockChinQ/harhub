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

export function metadataList(asset: AssetRecord, key: string): string[] {
  const value = asset.metadata[key];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

export function metadataNumber(asset: AssetRecord, key: string): number {
  const value = asset.metadata[key];
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function metadataText(asset: AssetRecord, key: string): string {
  const value = asset.metadata[key];
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.join(", ");
  return "";
}
