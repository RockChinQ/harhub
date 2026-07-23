import assert from "node:assert/strict";
import test from "node:test";

import type { AssetCatalog } from "../src/shared/types.js";
import { resolveExplicitLibraryAsset } from "../src/server/services/project-repository-ownership.js";

const matchingAsset = {
  id: "asset-release-notes",
  kind: "skill",
  name: "release-notes"
};
const catalog = { assets: [matchingAsset] } as AssetCatalog;

test("repository discovery does not match a same-name Library Skill implicitly", () => {
  assert.equal(resolveExplicitLibraryAsset(catalog, {}), undefined);
});

test("repository discovery binds a Library Skill only through an explicit asset id", () => {
  assert.equal(
    resolveExplicitLibraryAsset(catalog, { libraryAssetId: matchingAsset.id }),
    matchingAsset
  );
});

test("repository ownership overrides a stale Library asset id", () => {
  assert.equal(
    resolveExplicitLibraryAsset(catalog, {
      libraryAssetId: matchingAsset.id,
      repositoryOwned: true
    }),
    undefined
  );
});
