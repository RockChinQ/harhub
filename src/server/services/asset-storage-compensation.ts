import type { AssetCatalog, StoredObject, WorkspaceRecord } from "../../shared/types.js";
import { assetStorageObjects } from "../../features/assets/index.js";
import { readWorkspaceAssetCatalog } from "../../state/index.js";
import { deleteStoredObject } from "../../storage/index.js";

export type StoredObjectReferenceState = "referenced" | "unreferenced" | "unknown";

export function storedObjectReferenceState(
  catalog: AssetCatalog | undefined,
  storage: StoredObject
): StoredObjectReferenceState {
  if (!catalog) return "unreferenced";
  const identity = storageIdentity(storage);
  return catalog.assets.some((asset) =>
    assetStorageObjects(asset).some((candidate) => storageIdentity(candidate) === identity)
  ) ? "referenced" : "unreferenced";
}

export function shouldDeleteUncommittedObject(input: {
  status: StoredObjectReferenceState;
}): boolean {
  return input.status === "unreferenced";
}

export async function deleteStoredObjectIfUnreferenced(
  workspace: WorkspaceRecord,
  storage: StoredObject
): Promise<void> {
  try {
    const catalog = await readWorkspaceAssetCatalog(workspace.id);
    if (shouldDeleteUncommittedObject({ status: storedObjectReferenceState(catalog, storage) })) {
      await deleteStoredObject(storage);
    }
  } catch {
    // Keep the object when authoritative catalog state cannot be confirmed.
  }
}

function storageIdentity(storage: StoredObject): string {
  return [storage.provider, storage.endpoint ?? "aws", storage.bucket, storage.key].join(":");
}
