import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";

const baseDatabaseUrl = process.env.HARHUB_TEST_DATABASE_URL;

test("deletes normalized PostgreSQL tracking rows with the Project index", {
  skip: baseDatabaseUrl ? false : "requires HARHUB_TEST_DATABASE_URL"
}, async () => {
  const schema = `harhub_project_delete_${Date.now()}_${randomBytes(4).toString("hex")}`;
  const adminPool = new Pool({ connectionString: baseDatabaseUrl });
  const previousDatabaseUrl = process.env.HARHUB_DATABASE_URL;
  await adminPool.query(`create schema ${schema}`);
  process.env.HARHUB_DATABASE_URL = databaseUrlForSchema(baseDatabaseUrl!, schema);

  const state = await import("../src/state/index.js");
  const { deleteTrackedProject } = await import(
    "../src/server/services/project-repository-inventory.js"
  );

  try {
    const created = await state.createProject({
      accountId: "acct_demo",
      workspaceId: "ws_demo",
      name: "Postgres deletion",
      description: "Delete normalized repository tracking rows."
    });
    const projectId = created.project.id;
    const now = new Date().toISOString();
    await state.saveProjectRepositoryConnection({
      workspaceId: "ws_demo",
      projectId,
      mode: "github-app",
      status: "active",
      installationId: "installation-delete",
      permissionMode: "read",
      repositoryId: "repository-delete",
      repositoryNodeId: "R_repository_delete",
      owner: "RockChinQ",
      name: "existing-repository",
      defaultBranch: "main",
      connectedAt: now
    });
    const scan = await state.createProjectScanJob({
      workspaceId: "ws_demo",
      projectId,
      trigger: "manual"
    });
    await state.completeProjectScan(scan.id, {
      id: "snapshot-delete",
      workspaceId: "ws_demo",
      projectId,
      commitSha: "a".repeat(40),
      detectorVersion: "test",
      trigger: "manual",
      artifacts: [],
      createdAt: now
    }, []);
    await state.upsertProjectBindingPolicy({
      projectId,
      artifactPath: ".harness/skills/example",
      ownership: "repository",
      decidedByAccountId: "acct_demo",
      decidedAt: now
    });
    await state.saveProjectChangeProposal({
      id: "proposal-delete",
      workspaceId: "ws_demo",
      projectId,
      kind: "bootstrap",
      status: "preview",
      baseSha: "a".repeat(40),
      branch: "harhub/bootstrap",
      files: [],
      createdByAccountId: "acct_demo",
      createdAt: now,
      updatedAt: now
    });

    await deleteTrackedProject({
      accountId: "acct_demo",
      workspaceId: "ws_demo",
      projectId
    });

    await assert.rejects(
      state.getProject("acct_demo", "ws_demo", projectId),
      /Project not found/
    );
    for (const table of [
      "harhub_project_repository_connections",
      "harhub_project_scan_jobs",
      "harhub_project_inventory_snapshots",
      "harhub_project_inventory_artifacts",
      "harhub_project_inventory_files",
      "harhub_project_binding_policies",
      "harhub_project_change_proposals"
    ]) {
      const result = await adminPool.query<{ count: string }>(
        `select count(*)::text as count from ${schema}.${table}`
      );
      assert.equal(result.rows[0]?.count, "0", table);
    }
    const audit = await adminPool.query<{ count: string }>(
      `select count(*)::text as count
       from ${schema}.harhub_audit_events
       where event_type = 'project.deleted' and entity_id = $1`,
      [projectId]
    );
    assert.equal(audit.rows[0]?.count, "1");
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
