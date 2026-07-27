import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";

const baseDatabaseUrl = process.env.HARHUB_TEST_DATABASE_URL;

test("GitHub installation upsert supports account-scoped and workspace-scoped primary keys", {
  skip: baseDatabaseUrl ? false : "requires HARHUB_TEST_DATABASE_URL"
}, async () => {
  const schema = `harhub_installation_conflict_${Date.now()}_${randomBytes(4).toString("hex")}`;
  const adminPool = new Pool({ connectionString: baseDatabaseUrl });
  const previousDatabaseUrl = process.env.HARHUB_DATABASE_URL;
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
      primary key (linked_by_account_id, installation_id)
    )
  `);
  await adminPool.query(`
    insert into ${schema}.harhub_github_installations (
      installation_id, workspace_id, account_login, account_type,
      repository_selection, permissions, linked_by_account_id, linked_at
    ) values ('42', 'ws_old', 'old-org', 'Organization', 'all', '{}', 'acct_1', now())
  `);
  process.env.HARHUB_DATABASE_URL = databaseUrlForSchema(baseDatabaseUrl!, schema);
  const state = await import("../src/state/index.js");

  try {
    await state.upsertGitHubInstallation(installation("ws_new", "acct_1", "new-org"));
    const migrated = await adminPool.query(
      `select workspace_id, account_login from ${schema}.harhub_github_installations where installation_id = '42'`
    );
    assert.deepEqual(migrated.rows, [{ workspace_id: "ws_new", account_login: "new-org" }]);

    await adminPool.query(`delete from ${schema}.harhub_github_installations`);
    await adminPool.query(`
      alter table ${schema}.harhub_github_installations drop constraint harhub_github_installations_pkey;
      alter table ${schema}.harhub_github_installations add primary key (workspace_id, installation_id)
    `);
    await state.upsertGitHubInstallation(installation("ws_legacy", "acct_2", "first"));
    await state.upsertGitHubInstallation(installation("ws_legacy", "acct_3", "updated"));
    const legacy = await adminPool.query(
      `select linked_by_account_id, account_login from ${schema}.harhub_github_installations where installation_id = '42'`
    );
    assert.deepEqual(legacy.rows, [{ linked_by_account_id: "acct_3", account_login: "updated" }]);
  } finally {
    await state.closeDatabaseConnection();
    if (previousDatabaseUrl === undefined) delete process.env.HARHUB_DATABASE_URL;
    else process.env.HARHUB_DATABASE_URL = previousDatabaseUrl;
    await adminPool.query(`drop schema ${schema} cascade`);
    await adminPool.end();
  }
});

function installation(workspaceId: string, accountId: string, login: string) {
  return {
    id: "42",
    workspaceId,
    accountLogin: login,
    accountType: "Organization",
    repositorySelection: "all",
    permissions: {},
    linkedByAccountId: accountId,
    linkedAt: new Date().toISOString()
  };
}

function databaseUrlForSchema(baseUrl: string, schema: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set("options", `-csearch_path=${schema}`);
  return url.toString();
}
