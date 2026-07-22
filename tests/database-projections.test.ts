import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";

import type { AssetCatalog, AssetRecord, StoredObject } from "../src/shared/types.js";

const baseDatabaseUrl = process.env.HARHUB_TEST_DATABASE_URL;

test("Postgres stores queryable asset versions and workspace audit events", {
  skip: baseDatabaseUrl ? false : "requires HARHUB_TEST_DATABASE_URL"
}, async () => {
  const schema = `harhub_test_${Date.now()}_${randomBytes(4).toString("hex")}`;
  const adminPool = new Pool({ connectionString: baseDatabaseUrl });
  const previousDatabaseUrl = process.env.HARHUB_DATABASE_URL;

  await adminPool.query(`create schema ${schema}`);
  process.env.HARHUB_DATABASE_URL = databaseUrlForSchema(baseDatabaseUrl!, schema);

  const state = await import("../src/state/index.js");
  const assets = await import("../src/features/assets/index.js");

  try {
    await state.loadState();
    const first = assets.recordAssetVersion({
      asset: assetRecord(1),
      source: "upload",
      createdByAccountId: "acct_demo",
      createdAt: "2026-07-22T01:00:00.000Z"
    });
    const second = assets.recordAssetVersion({
      asset: assetRecord(2),
      previous: first,
      source: "upload",
      createdByAccountId: "acct_demo",
      createdAt: "2026-07-22T02:00:00.000Z"
    });
    const catalog: AssetCatalog = {
      schemaVersion: 2,
      generatedAt: "2026-07-22T02:00:00.000Z",
      workspaceId: "ws_demo",
      assets: [second],
      skills: []
    };
    await state.writeWorkspaceAssetCatalog("ws_demo", catalog);

    const versionRows = await adminPool.query<{
      version: number;
      checksum: string;
      source: string;
    }>(
      `select version, checksum, source
       from ${schema}.harhub_asset_versions
       where workspace_id = $1 and asset_id = $2
       order by version`,
      ["ws_demo", second.id]
    );
    assert.deepEqual(versionRows.rows, [
      { version: 1, checksum: "checksum-1", source: "upload" },
      { version: 2, checksum: "checksum-2", source: "upload" }
    ]);

    const catalogRows = await adminPool.query<{ contains_history: boolean }>(
      `select (asset_catalog #> '{assets,0}') ? 'versionHistory' as contains_history
       from ${schema}.harhub_workspace_catalogs
       where workspace_id = $1`,
      ["ws_demo"]
    );
    assert.equal(catalogRows.rows[0]?.contains_history, false);

    const hydrated = await state.readWorkspaceAssetCatalog("ws_demo");
    assert.deepEqual(
      hydrated?.assets[0]?.versionHistory?.map((version) => version.version),
      [1, 2]
    );

    await state.createProject({
      accountId: "acct_demo",
      workspaceId: "ws_demo",
      name: "Queryable projection test",
      description: "Verifies transactional audit projection."
    });
    const events = await state.listWorkspaceAuditEvents("acct_demo", "ws_demo", {
      limit: 50
    });
    assert.ok(events.events.some((event) => event.eventType === "workspace.created"));
    assert.equal(
      events.events.filter((event) => event.eventType === "asset.version.created").length,
      2
    );
    assert.ok(events.events.some((event) => event.eventType === "project.created"));

    const eventRows = await adminPool.query<{ event_type: string; count: string }>(
      `select event_type, count(*)::text as count
       from ${schema}.harhub_audit_events
       where workspace_id = $1
       group by event_type`,
      ["ws_demo"]
    );
    assert.ok(eventRows.rows.some((row) => row.event_type === "project.created"));
  } finally {
    await state.closeDatabaseConnection();
    if (previousDatabaseUrl === undefined) delete process.env.HARHUB_DATABASE_URL;
    else process.env.HARHUB_DATABASE_URL = previousDatabaseUrl;
    await adminPool.query(`drop schema ${schema} cascade`);
    await adminPool.end();
  }
});

function databaseUrlForSchema(baseUrl: string, schema: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set("options", `-csearch_path=${schema}`);
  return url.toString();
}

function assetRecord(version: number): AssetRecord {
  return {
    id: "asset:skill:queryable-test",
    kind: "skill",
    name: "queryable-test",
    displayName: "Queryable Test",
    slug: "queryable-test",
    description: `Projection version ${version}`,
    health: "valid",
    validation: { errors: 0, warnings: 0 },
    storage: storedObject(version)
  };
}

function storedObject(version: number): StoredObject {
  return {
    provider: "s3",
    layout: "files",
    bucket: "projection-test",
    key: `workspaces/ws_demo/assets/queryable-test/v${version}`,
    size: version * 10,
    fileCount: 1,
    contentType: "application/vnd.harhub.skill-directory",
    checksum: `checksum-${version}`,
    uploadedAt: `2026-07-22T0${version}:00:00.000Z`
  };
}
