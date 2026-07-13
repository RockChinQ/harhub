import { Pool } from "pg";
import type { AssetCatalog } from "../shared/types.js";
import type { AppState } from "./types.js";

type JsonRecord = Record<string, unknown>;

const databaseUrl = process.env.HARHUB_DATABASE_URL ?? process.env.DATABASE_URL;
let pool: Pool | undefined;
let setupPromise: Promise<void> | undefined;

export function isDatabaseStateEnabled(): boolean {
  return Boolean(databaseUrl);
}

export function getStateBackend(): "postgres" | "local-json" {
  return isDatabaseStateEnabled() ? "postgres" : "local-json";
}

export function getCatalogStorageLabel(workspaceId: string): string {
  return isDatabaseStateEnabled()
    ? `postgres:harhub_workspace_catalogs/${workspaceId}`
    : "local-json";
}

export async function readDatabaseState(): Promise<AppState | undefined> {
  if (!isDatabaseStateEnabled()) return undefined;
  await ensureDatabase();
  const result = await getPool().query<{ data: AppState }>(
    "select data from harhub_state where id = $1",
    ["app"]
  );
  return result.rows[0]?.data;
}

export async function writeDatabaseState(state: AppState): Promise<void> {
  if (!isDatabaseStateEnabled()) return;
  await ensureDatabase();
  await getPool().query(
    `insert into harhub_state (id, data, updated_at)
     values ($1, $2::jsonb, now())
     on conflict (id) do update set data = excluded.data, updated_at = now()`,
    ["app", JSON.stringify(state)]
  );
}

export async function readDatabaseAssetCatalog(
  workspaceId: string
): Promise<AssetCatalog | undefined> {
  if (!isDatabaseStateEnabled()) return undefined;
  await ensureDatabase();
  const result = await getPool().query<{ asset_catalog: AssetCatalog | null }>(
    "select asset_catalog from harhub_workspace_catalogs where workspace_id = $1",
    [workspaceId]
  );
  return result.rows[0]?.asset_catalog ?? undefined;
}

export async function writeDatabaseAssetCatalog(
  workspaceId: string,
  catalog: AssetCatalog
): Promise<void> {
  if (!isDatabaseStateEnabled()) return;
  await ensureDatabase();
  await getPool().query(
    `insert into harhub_workspace_catalogs (workspace_id, asset_catalog, updated_at)
     values ($1, $2::jsonb, now())
     on conflict (workspace_id) do update
     set asset_catalog = excluded.asset_catalog, updated_at = now()`,
    [workspaceId, JSON.stringify(catalog)]
  );
}

async function ensureDatabase(): Promise<void> {
  setupPromise ??= setupDatabase();
  return setupPromise;
}

async function setupDatabase(): Promise<void> {
  await getPool().query(`
    create table if not exists harhub_state (
      id text primary key,
      data jsonb not null,
      updated_at timestamptz not null default now()
    )
  `);
  await getPool().query(`
    create table if not exists harhub_workspace_catalogs (
      workspace_id text primary key,
      asset_catalog jsonb,
      updated_at timestamptz not null default now()
    )
  `);
  await getPool().query(`
    alter table harhub_workspace_catalogs
    drop column if exists skill_catalog
  `);
}

function getPool(): Pool {
  if (!databaseUrl) {
    throw new Error("HARHUB_DATABASE_URL is required for database-backed state.");
  }

  pool ??= new Pool({
    connectionString: databaseUrl,
    ssl: readSslConfig()
  });
  return pool;
}

function readSslConfig(): JsonRecord | boolean | undefined {
  const value = process.env.HARHUB_DATABASE_SSL;
  if (!value) return undefined;
  if (["1", "true", "require"].includes(value.toLowerCase())) {
    return { rejectUnauthorized: false };
  }
  if (["0", "false", "disable"].includes(value.toLowerCase())) {
    return false;
  }
  return undefined;
}
