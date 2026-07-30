import type {
  ProjectBinding,
  ProjectBindingPolicy,
  ProjectInventoryArtifact
} from "../../../shared/types";

export function withCurrentLibraryBaseline(
  artifact: ProjectInventoryArtifact,
  policies: ProjectBindingPolicy[],
  bindings: ProjectBinding[]
): ProjectInventoryArtifact {
  const policy = policies.find((candidate) => candidate.artifactPath === artifact.path);
  const binding = bindings.find((candidate) =>
    candidate.id === artifact.bindingId || candidate.path === artifact.path
  );
  const libraryPolicy = policy?.ownership === "library" ? policy : undefined;
  const libraryAssetId = libraryPolicy?.libraryAssetId ?? binding?.assetId ?? artifact.libraryAssetId;
  const libraryVersion = libraryPolicy?.libraryAssetId
    ? libraryPolicy.pinnedVersion ??
      (binding?.assetId === libraryPolicy.libraryAssetId ? binding.sourceVersion : undefined) ??
      (artifact.libraryAssetId === libraryPolicy.libraryAssetId ? artifact.libraryVersion : undefined)
    : binding?.assetId
      ? binding.sourceVersion ??
        (artifact.libraryAssetId === binding.assetId ? artifact.libraryVersion : undefined)
      : artifact.libraryVersion;

  if (
    libraryAssetId === artifact.libraryAssetId &&
    libraryVersion === artifact.libraryVersion
  ) {
    return artifact;
  }

  return {
    ...artifact,
    libraryAssetId,
    libraryVersion
  };
}
