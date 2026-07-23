import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";

const baseDatabaseUrl = process.env.HARHUB_TEST_DATABASE_URL;

test("Postgres persists and consumes a pending OAuth email verification atomically", {
  skip: baseDatabaseUrl ? false : "requires HARHUB_TEST_DATABASE_URL"
}, async () => {
  const schema = `harhub_oauth_email_${Date.now()}_${randomBytes(4).toString("hex")}`;
  const adminPool = new Pool({ connectionString: baseDatabaseUrl });
  const previousDatabaseUrl = process.env.HARHUB_DATABASE_URL;

  await adminPool.query(`create schema ${schema}`);
  process.env.HARHUB_DATABASE_URL = databaseUrlForSchema(baseDatabaseUrl!, schema);
  const state = await import("../src/state/index.js");

  try {
    const pending = await state.createOAuthEmailVerification({
      provider: "github",
      providerAccountId: "private-github-account",
      name: "Private GitHub Account",
      redirectPath: "/workspace"
    });
    const requested = await state.createEmailLoginCode({
      email: "owner@example.com",
      oauthEmailVerificationToken: pending.token
    });

    const beforeVerification = await readStoredState(adminPool, schema);
    assert.equal(beforeVerification.oauthEmailVerifications.length, 1);
    assert.equal(beforeVerification.identities.length, 0);

    const verified = await state.verifyEmailLoginCode({
      email: "owner@example.com",
      code: requested.code,
      oauthEmailVerificationToken: pending.token
    }, true);
    const afterVerification = await readStoredState(adminPool, schema);

    assert.equal(verified.account.email, "owner@example.com");
    assert.ok(afterVerification.accounts.find((account) => account.id === verified.account.id)?.emailVerifiedAt);
    assert.equal(afterVerification.oauthEmailVerifications.length, 0);
    assert.equal(afterVerification.identities.length, 1);
    assert.equal(afterVerification.identities[0]?.providerAccountId, "private-github-account");
    assert.equal(afterVerification.identities[0]?.accountId, verified.account.id);
  } finally {
    process.env.HARHUB_DATABASE_URL = previousDatabaseUrl;
    await adminPool.query(`drop schema ${schema} cascade`);
    await adminPool.end();
  }
});

interface StoredState {
  accounts: Array<{ id: string; emailVerifiedAt?: string }>;
  oauthEmailVerifications: unknown[];
  identities: Array<{ accountId: string; providerAccountId: string }>;
}

async function readStoredState(pool: Pool, schema: string): Promise<StoredState> {
  const result = await pool.query<{ data: StoredState }>(
    `select data from ${schema}.harhub_state where id = 'app'`
  );
  assert.ok(result.rows[0]);
  return result.rows[0].data;
}

function databaseUrlForSchema(baseUrl: string, schema: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set("options", `-csearch_path=${schema}`);
  return url.toString();
}
