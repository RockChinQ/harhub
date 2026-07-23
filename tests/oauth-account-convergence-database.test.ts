import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";

const baseDatabaseUrl = process.env.HARHUB_TEST_DATABASE_URL;

test("OAuth account convergence atomically updates Postgres state and account projections", {
  skip: baseDatabaseUrl ? false : "requires HARHUB_TEST_DATABASE_URL"
}, async () => {
  const schema = `harhub_oauth_test_${Date.now()}_${randomBytes(4).toString("hex")}`;
  const adminPool = new Pool({ connectionString: baseDatabaseUrl });
  const previousDatabaseUrl = process.env.HARHUB_DATABASE_URL;

  await adminPool.query(`create schema ${schema}`);
  process.env.HARHUB_DATABASE_URL = databaseUrlForSchema(baseDatabaseUrl!, schema);
  const state = await import("../src/state/index.js");

  try {
    const identityAccount = await state.signInWithOAuthProfile({
      provider: "github",
      providerAccountId: "45992437",
      email: "45992437+user@users.noreply.github.com",
      emailVerified: true,
      name: "GitHub Identity"
    });
    const sourceAccount = await state.signInForDevelopment({ email: "owner@example.com" });
    const sourceState = await state.loadState();
    const sourceWorkspaceId = sourceState.memberships.find(
      (membership) => membership.accountId === sourceAccount.id
    )?.workspaceId;
    assert.ok(sourceWorkspaceId);

    await adminPool.query(
      `insert into ${schema}.harhub_audit_events
       (id, workspace_id, event_type, entity_type, entity_id, actor_account_id,
        source, occurred_at, metadata, deduplication_key)
       values ($1, $2, $3, $4, $5, $6, $7, now(), '{}'::jsonb, $8)`,
      [
        "merge-projection",
        sourceWorkspaceId,
        "workspace.updated",
        "workspace",
        sourceWorkspaceId,
        sourceAccount.id,
        "user",
        "merge-projection"
      ]
    );
    await adminPool.query(`
      create table ${schema}.harhub_github_installations (
        id text primary key, linked_by_account_id text not null
      );
      create table ${schema}.harhub_project_binding_policies (
        id text primary key, decided_by_account_id text not null
      );
      create table ${schema}.harhub_project_change_proposals (
        id text primary key, created_by_account_id text not null
      );
    `);
    await Promise.all([
      adminPool.query(
        `insert into ${schema}.harhub_github_installations values ('projection', $1)`,
        [sourceAccount.id]
      ),
      adminPool.query(
        `insert into ${schema}.harhub_project_binding_policies values ('projection', $1)`,
        [sourceAccount.id]
      ),
      adminPool.query(
        `insert into ${schema}.harhub_project_change_proposals values ('projection', $1)`,
        [sourceAccount.id]
      )
    ]);
    await adminPool.query(
      `insert into ${schema}.harhub_asset_versions
       (workspace_id, asset_id, version, kind, name, display_name, description, source,
        created_by_account_id, created_at, health, summary)
       values ('projection-workspace', 'projection', 1, 'skill', 'projection', 'Projection', '', 'manual',
        $1, now(), 'healthy', '')`,
      [sourceAccount.id]
    );
    await adminPool.query(`
      create function ${schema}.reject_account_rewrite() returns trigger
      language plpgsql as $$
      begin
        if new.actor_account_id = '${identityAccount.id}' then
          raise exception 'forced projection failure';
        end if;
        return new;
      end
      $$;
      create trigger reject_account_rewrite
      before update on ${schema}.harhub_audit_events
      for each row execute function ${schema}.reject_account_rewrite();
    `);

    await assert.rejects(
      state.signInWithOAuthProfile({
        provider: "github",
        providerAccountId: "45992437",
        email: "owner@example.com",
        emailVerified: true,
        name: "Updated GitHub Identity"
      }),
      /forced projection failure/
    );

    const failedState = await readAppState(adminPool, schema);
    assert.ok(failedState.accounts.some((account) => account.id === sourceAccount.id));
    assert.equal(
      failedState.accounts.find((account) => account.id === identityAccount.id)?.email,
      "45992437+user@users.noreply.github.com"
    );
    assert.equal(await readAuditActor(adminPool, schema), sourceAccount.id);
    assert.deepEqual(
      await readProjectionActors(adminPool, schema),
      Array(5).fill(sourceAccount.id)
    );

    await adminPool.query(`
      drop trigger reject_account_rewrite on ${schema}.harhub_audit_events;
      drop function ${schema}.reject_account_rewrite();
    `);
    await state.signInWithOAuthProfile({
      provider: "github",
      providerAccountId: "45992437",
      email: "owner@example.com",
      emailVerified: true,
      name: "Updated GitHub Identity"
    });

    const convergedState = await readAppState(adminPool, schema);
    assert.equal(convergedState.accounts.some((account) => account.id === sourceAccount.id), false);
    assert.equal(
      convergedState.accounts.find((account) => account.id === identityAccount.id)?.email,
      "owner@example.com"
    );
    assert.equal(await readAuditActor(adminPool, schema), identityAccount.id);
    assert.deepEqual(
      await readProjectionActors(adminPool, schema),
      Array(5).fill(identityAccount.id)
    );
  } finally {
    await state.closeDatabaseConnection();
    if (previousDatabaseUrl === undefined) delete process.env.HARHUB_DATABASE_URL;
    else process.env.HARHUB_DATABASE_URL = previousDatabaseUrl;
    await adminPool.query(`drop schema ${schema} cascade`);
    await adminPool.end();
  }
});

interface StoredState {
  accounts: Array<{ id: string; email: string }>;
}

async function readAppState(pool: Pool, schema: string): Promise<StoredState> {
  const result = await pool.query<{ data: StoredState }>(
    `select data from ${schema}.harhub_state where id = 'app'`
  );
  assert.ok(result.rows[0]);
  return result.rows[0].data;
}

async function readAuditActor(pool: Pool, schema: string): Promise<string | null> {
  const result = await pool.query<{ actor_account_id: string | null }>(
    `select actor_account_id from ${schema}.harhub_audit_events where id = 'merge-projection'`
  );
  return result.rows[0]?.actor_account_id ?? null;
}

async function readProjectionActors(pool: Pool, schema: string): Promise<Array<string | null>> {
  const result = await pool.query<{ account_id: string | null }>(`
    select 1 as position, created_by_account_id as account_id
      from ${schema}.harhub_asset_versions where asset_id = 'projection'
    union all
    select 2, actor_account_id
      from ${schema}.harhub_audit_events where id = 'merge-projection'
    union all
    select 3, linked_by_account_id
      from ${schema}.harhub_github_installations where id = 'projection'
    union all
    select 4, decided_by_account_id
      from ${schema}.harhub_project_binding_policies where id = 'projection'
    union all
    select 5, created_by_account_id
      from ${schema}.harhub_project_change_proposals where id = 'projection'
    order by position
  `);
  return result.rows.map((row) => row.account_id);
}

function databaseUrlForSchema(baseUrl: string, schema: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set("options", `-csearch_path=${schema}`);
  return url.toString();
}
