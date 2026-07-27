import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";

const baseDatabaseUrl = process.env.HARHUB_TEST_DATABASE_URL;

test("Postgres keeps repository scans queryable outside the JSONB application snapshot", {
  skip: baseDatabaseUrl ? false : "requires HARHUB_TEST_DATABASE_URL"
}, async () => {
  const schema = `harhub_repository_test_${Date.now()}_${randomBytes(4).toString("hex")}`;
  const adminPool = new Pool({ connectionString: baseDatabaseUrl });
  const previousDatabaseUrl = process.env.HARHUB_DATABASE_URL;
  await adminPool.query(`create schema ${schema}`);
  process.env.HARHUB_DATABASE_URL = databaseUrlForSchema(baseDatabaseUrl!, schema);
  const state = await import("../src/state/index.js");

  try {
    const project = await state.createGitHubAppProject({
      accountId: "acct_demo",
      workspaceId: "ws_demo",
      name: "Repository projection",
      description: "Tests normalized repository state.",
      repository: {
        provider: "github",
        id: "99",
        nodeId: "R_99",
        owner: "acme",
        name: "product",
        url: "https://github.com/acme/product",
        defaultBranch: "main"
      }
    });
    await state.saveProjectRepositoryConnection({
      workspaceId: "ws_demo",
      projectId: project.id,
      mode: "github-app",
      status: "active",
      installationId: "42",
      permissionMode: "read",
      repositoryId: "99",
      repositoryNodeId: "R_99",
      owner: "acme",
      name: "product",
      defaultBranch: "main",
      connectedAt: "2026-07-22T00:00:00.000Z"
    });
    const job = await state.createProjectScanJob({
      workspaceId: "ws_demo",
      projectId: project.id,
      trigger: "initial"
    });
    await state.markProjectScanRunning(job.id);
    await state.completeProjectScan(job.id, {
      id: "snapshot-1",
      workspaceId: "ws_demo",
      projectId: project.id,
      commitSha: "a".repeat(40),
      detectorVersion: "repository-harness-v1",
      trigger: "initial",
      artifacts: [{
        id: "artifact-1",
        kind: "instruction",
        format: "agents-instructions",
        path: "AGENTS.md",
        name: "Agent instructions",
        description: "Repository instructions.",
        digest: "b".repeat(64),
        fileCount: 1,
        size: 20,
        health: "valid",
        validation: { errors: 0, warnings: 0 },
        issues: [],
        relationship: "repository-owned"
      }],
      createdAt: "2026-07-22T00:01:00.000Z"
    }, [{ artifactId: "artifact-1", path: "AGENTS.md", content: Buffer.from("# Agents\n") }]);

    const inventory = await state.getProjectInventoryState("acct_demo", "ws_demo", project.id);
    assert.equal(inventory.latestSnapshot?.commitSha, "a".repeat(40));
    assert.equal(inventory.latestJob?.status, "succeeded");
    assert.equal(
      (await state.readProjectInventoryFile("ws_demo", project.id, "snapshot-1", "artifact-1", "AGENTS.md"))?.toString(),
      "# Agents\n"
    );
    assert.deepEqual(
      await state.listProjectInventoryFilePaths("ws_demo", project.id, "snapshot-1", "artifact-1"),
      ["AGENTS.md"]
    );
    const rows = await adminPool.query<{ connections: string; snapshots: string; json_snapshots: number }>(
      `select
         (select count(*)::text from ${schema}.harhub_project_repository_connections) as connections,
         (select count(*)::text from ${schema}.harhub_project_inventory_snapshots) as snapshots,
         jsonb_array_length((select data from ${schema}.harhub_state where id = 'app')->'projectInventorySnapshots') as json_snapshots`
    );
    assert.deepEqual(rows.rows[0], { connections: "1", snapshots: "1", json_snapshots: 0 });
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
