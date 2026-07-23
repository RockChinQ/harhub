import type { AssetCatalog, AssetRecord } from "../../shared/types.js";

export function resolveExplicitLibraryAsset(
  catalog: AssetCatalog,
  input: { libraryAssetId?: string; repositoryOwned?: boolean }
): AssetRecord | undefined {
  if (input.repositoryOwned || !input.libraryAssetId) return undefined;
  return catalog.assets.find((asset) => asset.id === input.libraryAssetId);
}
