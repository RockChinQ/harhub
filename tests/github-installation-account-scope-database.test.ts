import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";

const baseDatabaseUrl = process.env.HARHUB_TEST_DATABASE_URL;

test("Postgres migrates legacy Workspace-scoped installations to one Account-scoped binding", {
  skip: baseDatabaseUrl ? false : "requires HARHUB_TEST_DATABASE_URL"
}, async () => {
  const schema = `harhub_github_scope_${Date.now()}_${randomBytes(4).toString("hex")}`;
  const adminPool = new Pool({ connectionString: baseDatabaseUrl });
  const previousDatabase = process.env.HARHUB_DATABASE_URL;
  await adminPool.query(`create schema ${schema}`);
  await adminPool.query(`
    create table ${schema}.harhub_github_installations (
      installation_id text not null,
      workspace_id text not null,
      account_login text not null,
      account_type text not null,
      repository_selection text not null,
      permissions jsonb not null default '{}'::jsonb,
      linked_by_account_id text not null,
      linked_at timestamptz not null,
      suspended_at timestamptz,
      primary key (workspace_id, installation_id)
    )
  `);
  await adminPool.query(
    `insert into ${schema}.harhub_github_installations (
       installation_id, workspace_id, account_login, account_type,
       repository_selection, permissions, linked_by_account_id, linked_at
     ) values
       ('42', 'ws_older', 'acme', 'Organization', 'selected', '{}', 'acct_demo', '2026-01-01T00:00:00Z'),
       ('42', 'ws_newer', 'acme', 'Organization', 'selected', '{}', 'acct_demo', '2026-02-01T00:00:00Z')`
  );
  process.env.HARHUB_DATABASE_URL = databaseUrlForSchema(baseDatabaseUrl!, schema);
  const state = await import("../src/state/index.js");

  try {
    const migrated = await state.listGitHubInstallations("acct_demo", "ws_demo");
    assert.equal(migrated.length, 1);
    assert.equal(migrated[0]?.workspaceId, "ws_newer");

    await state.upsertGitHubInstallation({
      ...migrated[0]!,
      workspaceId: "ws_demo",
      linkedAt: "2026-03-01T00:00:00.000Z"
    });
    const rows = await adminPool.query<{ rows: string; workspace_id: string }>(
      `select count(*)::text as rows, max(workspace_id) as workspace_id
       from ${schema}.harhub_github_installations
       where linked_by_account_id = 'acct_demo' and installation_id = '42'`
    );
    assert.deepEqual(rows.rows[0], { rows: "1", workspace_id: "ws_demo" });

    await state.upsertGitHubInstallation({
      ...migrated[0]!,
      workspaceId: "ws_demo",
      linkedByAccountId: "second-harhub-account",
      linkedAt: "2026-03-02T00:00:00.000Z"
    });
    const accountBindings = await adminPool.query<{ rows: string }>(
      `select count(*)::text as rows
       from ${schema}.harhub_github_installations
       where workspace_id = 'ws_demo' and installation_id = '42'`
    );
    assert.equal(accountBindings.rows[0]?.rows, "2");

    const primaryKey = await adminPool.query<{ columns: string[] }>(
      `select array_agg(attribute.attname::text order by key_column.ordinality)::text[] as columns
       from pg_constraint as constraint_record
       cross join lateral unnest(constraint_record.conkey)
         with ordinality as key_column(attnum, ordinality)
       join pg_attribute as attribute
         on attribute.attrelid = constraint_record.conrelid
        and attribute.attnum = key_column.attnum
       where constraint_record.conrelid = $1::regclass
         and constraint_record.contype = 'p'`,
      [`${schema}.harhub_github_installations`]
    );
    assert.deepEqual(primaryKey.rows[0]?.columns, ["linked_by_account_id", "installation_id"]);

    const connectionBase = {
      mode: "github-app" as const,
      status: "active" as const,
      installationId: "42",
      permissionMode: "read" as const,
      repositoryId: "99",
      repositoryNodeId: "R_99",
      owner: "acme",
      name: "product",
      defaultBranch: "main",
      connectedAt: "2026-03-03T00:00:00.000Z"
    };
    await state.saveProjectRepositoryConnection({
      ...connectionBase,
      workspaceId: "ws_demo",
      projectId: "project-account-a"
    });
    await state.saveProjectRepositoryConnection({
      ...connectionBase,
      workspaceId: "ws_independent",
      projectId: "project-account-b"
    });
    assert.equal(
      (await state.findProjectRepositoryConnection("ws_demo", "42", "99"))?.projectId,
      "project-account-a"
    );
    assert.equal(
      (await state.findProjectRepositoryConnection("ws_independent", "42", "99"))?.projectId,
      "project-account-b"
    );
    assert.deepEqual(
      (await state.listProjectRepositoryConnectionsForRepository("42", "99"))
        .map((connection) => connection.projectId)
        .sort(),
      ["project-account-a", "project-account-b"]
    );
  } finally {
    await state.closeDatabaseConnection();
    if (previousDatabase === undefined) delete process.env.HARHUB_DATABASE_URL;
    else process.env.HARHUB_DATABASE_URL = previousDatabase;
    await adminPool.query(`drop schema ${schema} cascade`);
    await adminPool.end();
  }
});

function databaseUrlForSchema(baseUrl: string, schema: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set("options", `-csearch_path=${schema}`);
  return url.toString();
}
