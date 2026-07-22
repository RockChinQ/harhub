import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";

import { normalizeAssetVersioning } from "../features/assets/index.js";
import type {
  AssetCatalog,
  AssetRecord,
  AssetVersionRecord,
  WorkspaceAuditEvent,
  WorkspaceAuditEventListResponse,
  WorkspaceAuditEventType
} from "../shared/types.js";
import type { AppState, ProjectStateRecord } from "./types.js";

type JsonRecord = Record<string, unknown>;

interface AssetVersionRow {
  asset_id: string;
  version: number;
  source: AssetVersionRecord["source"];
  created_by_account_id: string | null;
  created_at: Date | string;
  checksum: string | null;
  file_count: number | null;
  size: string | number | null;
  display_name: string;
  description: string;
  health: AssetVersionRecord["health"];
  validation_errors: number;
  validation_warnings: number;
  summary: string;
  changes: string[];
  storage: AssetVersionRecord["storage"] | null;
}

interface AuditEventRow {
  id: string;
  workspace_id: string;
  event_type: WorkspaceAuditEvent["eventType"];
  entity_type: WorkspaceAuditEvent["entityType"];
  entity_id: string;
  actor_account_id: string | null;
  source: WorkspaceAuditEvent["source"];
  occurred_at: Date | string;
  metadata: Record<string, unknown>;
}

interface PendingAuditEvent extends WorkspaceAuditEvent {
  deduplicationKey: string;
}

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
  const state = result.rows[0]?.data;
  if (state) state.auditEvents = [];
  return state;
}

export async function writeDatabaseState(state: AppState): Promise<void> {
  if (!isDatabaseStateEnabled()) return;
  await ensureDatabase();
  const client = await getPool().connect();
  try {
    await client.query("begin");
    await acquireTransactionLock(client, "state:app");
    const previousResult = await client.query<{ data: AppState }>(
      "select data from harhub_state where id = $1 for update",
      ["app"]
    );
    const previous = previousResult.rows[0]?.data;
    const snapshot: AppState = { ...state, auditEvents: [] };
    await client.query(
      `insert into harhub_state (id, data, updated_at)
       values ($1, $2::jsonb, now())
       on conflict (id) do update set data = excluded.data, updated_at = now()`,
      ["app", JSON.stringify(snapshot)]
    );
    await insertAuditEvents(client, stateAuditEvents(previous, state));
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function readDatabaseAssetCatalog(
  workspaceId: string
): Promise<AssetCatalog | undefined> {
  if (!isDatabaseStateEnabled()) return undefined;
  await ensureDatabase();
  const [catalogResult, versionResult] = await Promise.all([
    getPool().query<{ asset_catalog: AssetCatalog | null }>(
      "select asset_catalog from harhub_workspace_catalogs where workspace_id = $1",
      [workspaceId]
    ),
    getPool().query<AssetVersionRow>(
      `select asset_id, version, source, created_by_account_id, created_at, checksum,
              file_count, size, display_name, description, health,
              validation_errors, validation_warnings, summary, changes, storage
       from harhub_asset_versions
       where workspace_id = $1
       order by asset_id, version`,
      [workspaceId]
    )
  ]);
  const catalog = catalogResult.rows[0]?.asset_catalog ?? undefined;
  if (!catalog) return undefined;

  const versionsByAsset = new Map<string, AssetVersionRecord[]>();
  for (const row of versionResult.rows) {
    const versions = versionsByAsset.get(row.asset_id) ?? [];
    versions.push(assetVersionFromRow(row));
    versionsByAsset.set(row.asset_id, versions);
  }
  return {
    ...catalog,
    assets: catalog.assets.map((asset) => ({
      ...asset,
      ...(versionsByAsset.has(asset.id)
        ? { versionHistory: versionsByAsset.get(asset.id) }
        : {})
    }))
  };
}

export async function writeDatabaseAssetCatalog(
  workspaceId: string,
  catalog: AssetCatalog
): Promise<void> {
  if (!isDatabaseStateEnabled()) return;
  await ensureDatabase();
  await persistAssetCatalogProjection(workspaceId, catalog);
}

export async function listDatabaseAuditEvents(
  workspaceId: string,
  options: { limit: number; before?: string }
): Promise<WorkspaceAuditEventListResponse> {
  if (!isDatabaseStateEnabled()) return { events: [] };
  await ensureDatabase();
  const result = await getPool().query<AuditEventRow>(
    `select id, workspace_id, event_type, entity_type, entity_id,
            actor_account_id, source, occurred_at, metadata
     from harhub_audit_events
     where workspace_id = $1
       and ($2::timestamptz is null or occurred_at < $2::timestamptz)
     order by occurred_at desc, id desc
     limit $3`,
    [workspaceId, options.before ?? null, options.limit]
  );
  const events = result.rows.map(auditEventFromRow);
  return {
    events,
    ...(events.length === options.limit
      ? { nextBefore: events.at(-1)?.occurredAt }
      : {})
  };
}

export async function closeDatabaseConnection(): Promise<void> {
  if (!pool) return;
  const current = pool;
  pool = undefined;
  setupPromise = undefined;
  await current.end();
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
  await getPool().query(`
    create table if not exists harhub_asset_versions (
      workspace_id text not null,
      asset_id text not null,
      version integer not null check (version > 0),
      kind text not null,
      name text not null,
      display_name text not null,
      description text not null,
      source text not null,
      created_by_account_id text,
      created_at timestamptz not null,
      checksum text,
      file_count integer,
      size bigint,
      health text not null,
      validation_errors integer not null default 0,
      validation_warnings integer not null default 0,
      summary text not null,
      changes jsonb not null default '[]'::jsonb,
      storage jsonb,
      primary key (workspace_id, asset_id, version)
    )
  `);
  await getPool().query(`
    create index if not exists harhub_asset_versions_workspace_created_idx
    on harhub_asset_versions (workspace_id, created_at desc)
  `);
  await getPool().query(`
    create index if not exists harhub_asset_versions_checksum_idx
    on harhub_asset_versions (workspace_id, checksum)
    where checksum is not null
  `);
  await getPool().query(`
    create table if not exists harhub_audit_events (
      id text primary key,
      workspace_id text not null,
      event_type text not null,
      entity_type text not null,
      entity_id text not null,
      actor_account_id text,
      source text not null,
      occurred_at timestamptz not null,
      metadata jsonb not null default '{}'::jsonb,
      deduplication_key text not null,
      unique (workspace_id, deduplication_key)
    )
  `);
  await getPool().query(`
    create index if not exists harhub_audit_events_workspace_time_idx
    on harhub_audit_events (workspace_id, occurred_at desc)
  `);
  await getPool().query(`
    create index if not exists harhub_audit_events_entity_idx
    on harhub_audit_events (workspace_id, entity_type, entity_id, occurred_at desc)
  `);
  await backfillLegacyAssetVersions();
}

async function backfillLegacyAssetVersions(): Promise<void> {
  const result = await getPool().query<{
    workspace_id: string;
    asset_catalog: AssetCatalog;
  }>(`
    select workspace_id, asset_catalog
    from harhub_workspace_catalogs
    where jsonb_typeof(asset_catalog->'assets') = 'array'
      and exists (
        select 1
        from jsonb_array_elements(asset_catalog->'assets') as asset
        where asset ? 'versionHistory'
      )
  `);
  for (const row of result.rows) {
    await persistAssetCatalogProjection(row.workspace_id, row.asset_catalog, true);
  }
}

async function persistAssetCatalogProjection(
  workspaceId: string,
  catalog: AssetCatalog,
  backfilled = false
): Promise<void> {
  const normalized: AssetCatalog = {
    ...catalog,
    schemaVersion: 2,
    assets: catalog.assets.map(normalizeAssetVersioning)
  };
  const summary: AssetCatalog = {
    ...normalized,
    assets: normalized.assets.map(({ versionHistory: _versionHistory, ...asset }) => asset)
  };
  const desiredVersions = normalized.assets.flatMap((asset) =>
    (asset.versionHistory ?? []).map((version) => ({ asset, version }))
  );
  const client = await getPool().connect();
  try {
    await client.query("begin");
    await acquireTransactionLock(client, `catalog:${workspaceId}`);
    const existingCatalogResult = await client.query<{ asset_catalog: AssetCatalog | null }>(
      `select asset_catalog from harhub_workspace_catalogs
       where workspace_id = $1 for update`,
      [workspaceId]
    );
    const existingCatalog = existingCatalogResult.rows[0]?.asset_catalog ?? undefined;
    const existingVersionsResult = await client.query<{ asset_id: string; version: number }>(
      `select asset_id, version from harhub_asset_versions where workspace_id = $1`,
      [workspaceId]
    );
    const existingVersions = new Set(
      existingVersionsResult.rows.map((row) => assetVersionKey(row.asset_id, row.version))
    );

    await client.query(
      `insert into harhub_workspace_catalogs (workspace_id, asset_catalog, updated_at)
       values ($1, $2::jsonb, now())
       on conflict (workspace_id) do update
       set asset_catalog = excluded.asset_catalog, updated_at = now()`,
      [workspaceId, JSON.stringify(summary)]
    );
    await upsertAssetVersions(client, workspaceId, desiredVersions);

    const desiredKeys = desiredVersions.map(({ asset, version }) => ({
      assetId: asset.id,
      version: version.version
    }));
    const removedVersions = await client.query<{ asset_id: string; version: number }>(
      `delete from harhub_asset_versions as version
       where version.workspace_id = $1
         and not exists (
           select 1
           from jsonb_to_recordset($2::jsonb) as retained("assetId" text, version integer)
           where retained."assetId" = version.asset_id
             and retained.version = version.version
         )
       returning asset_id, version`,
      [workspaceId, JSON.stringify(desiredKeys)]
    );

    const auditEvents: PendingAuditEvent[] = [];
    for (const { asset, version } of desiredVersions) {
      if (existingVersions.has(assetVersionKey(asset.id, version.version))) continue;
      auditEvents.push(assetVersionAuditEvent(workspaceId, asset, version, backfilled));
    }
    const retainedAssetIds = new Set(normalized.assets.map((asset) => asset.id));
    for (const removed of removedVersions.rows) {
      if (!retainedAssetIds.has(removed.asset_id)) continue;
      auditEvents.push(createAuditEvent({
        workspaceId,
        eventType: "asset.version.pruned",
        entityType: "asset",
        entityId: removed.asset_id,
        source: "system",
        occurredAt: normalized.generatedAt,
        metadata: { version: removed.version },
        deduplicationKey: `asset-version-pruned:${removed.asset_id}:${removed.version}`
      }));
    }
    const currentAssetIds = new Set(normalized.assets.map((asset) => asset.id));
    for (const asset of existingCatalog?.assets ?? []) {
      if (currentAssetIds.has(asset.id)) continue;
      auditEvents.push(createAuditEvent({
        workspaceId,
        eventType: "asset.deleted",
        entityType: "asset",
        entityId: asset.id,
        source: "api",
        occurredAt: normalized.generatedAt,
        metadata: { name: asset.name, version: asset.version },
        deduplicationKey: `asset-deleted:${asset.id}:${normalized.generatedAt}`
      }));
    }
    await insertAuditEvents(client, auditEvents);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function upsertAssetVersions(
  client: PoolClient,
  workspaceId: string,
  versions: Array<{ asset: AssetRecord; version: AssetVersionRecord }>
): Promise<void> {
  if (versions.length === 0) return;
  const values: unknown[] = [];
  const rows = versions.map(({ asset, version }, rowIndex) => {
    const offset = rowIndex * 19;
    values.push(
      workspaceId,
      asset.id,
      version.version,
      asset.kind,
      asset.name,
      version.displayName,
      version.description,
      version.source,
      version.createdByAccountId ?? null,
      version.createdAt,
      version.checksum ?? null,
      version.fileCount ?? null,
      version.size ?? null,
      version.health,
      version.validation.errors,
      version.validation.warnings,
      version.summary,
      JSON.stringify(version.changes),
      version.storage ? JSON.stringify(version.storage) : null
    );
    return `(${Array.from({ length: 19 }, (_, index) => `$${offset + index + 1}`).join(", ")})`;
  });
  await client.query(
    `insert into harhub_asset_versions (
       workspace_id, asset_id, version, kind, name, display_name, description,
       source, created_by_account_id, created_at, checksum, file_count, size,
       health, validation_errors, validation_warnings, summary, changes, storage
     ) values ${rows.join(", ")}
     on conflict (workspace_id, asset_id, version) do update set
       kind = excluded.kind,
       name = excluded.name,
       display_name = excluded.display_name,
       description = excluded.description,
       source = excluded.source,
       created_by_account_id = excluded.created_by_account_id,
       created_at = excluded.created_at,
       checksum = excluded.checksum,
       file_count = excluded.file_count,
       size = excluded.size,
       health = excluded.health,
       validation_errors = excluded.validation_errors,
       validation_warnings = excluded.validation_warnings,
       summary = excluded.summary,
       changes = excluded.changes,
       storage = excluded.storage`,
    values
  );
}

function stateAuditEvents(
  previous: AppState | undefined,
  next: AppState
): PendingAuditEvent[] {
  const events: PendingAuditEvent[] = [];
  const previousWorkspaces = new Set((previous?.workspaces ?? []).map((item) => item.id));
  for (const workspace of next.workspaces) {
    if (previousWorkspaces.has(workspace.id)) continue;
    events.push(createAuditEvent({
      workspaceId: workspace.id,
      eventType: "workspace.created",
      entityType: "workspace",
      entityId: workspace.id,
      source: "api",
      occurredAt: workspace.createdAt,
      metadata: { name: workspace.name, slug: workspace.slug },
      deduplicationKey: `workspace-created:${workspace.id}`
    }));
  }

  const previousProjects = new Map(
    (previous?.projects ?? []).map((project) => [project.id, project])
  );
  for (const project of next.projects) {
    const before = previousProjects.get(project.id);
    if (!before) {
      events.push(createProjectCreatedEvent(project));
      continue;
    }
    events.push(...projectChangeEvents(before, project));
  }

  const previousShares = new Map(
    (previous?.assetShares ?? []).map((share) => [share.token, share])
  );
  const nextShares = new Map(next.assetShares.map((share) => [share.token, share]));
  for (const share of next.assetShares) {
    if (previousShares.has(share.token)) continue;
    events.push(createAuditEvent({
      workspaceId: share.workspaceId,
      eventType: "share.created",
      entityType: "share",
      entityId: share.token,
      actorAccountId: share.createdByAccountId,
      source: "api",
      occurredAt: share.createdAt,
      metadata: { assetId: share.assetId },
      deduplicationKey: `share-created:${share.token}`
    }));
  }
  for (const share of previousShares.values()) {
    if (nextShares.has(share.token)) continue;
    events.push(createAuditEvent({
      workspaceId: share.workspaceId,
      eventType: "share.revoked",
      entityType: "share",
      entityId: share.token,
      source: "api",
      occurredAt: new Date().toISOString(),
      metadata: { assetId: share.assetId },
      deduplicationKey: `share-revoked:${share.token}`
    }));
  }
  return events;
}

function createProjectCreatedEvent(project: ProjectStateRecord): PendingAuditEvent {
  const frozen = Boolean(project.sourceForgeSessionId);
  return createAuditEvent({
    workspaceId: project.workspaceId,
    eventType: frozen ? "project.frozen" : "project.created",
    entityType: "project",
    entityId: project.id,
    source: "api",
    occurredAt: project.createdAt,
    metadata: {
      name: project.name,
      repository: project.repository
        ? `${project.repository.owner}/${project.repository.name}`
        : null,
      sourceForgeSessionId: project.sourceForgeSessionId ?? null
    },
    deduplicationKey: `project-created:${project.id}`
  });
}

function projectChangeEvents(
  before: ProjectStateRecord,
  project: ProjectStateRecord
): PendingAuditEvent[] {
  const events: PendingAuditEvent[] = [];
  if (JSON.stringify(before.repository) !== JSON.stringify(project.repository) && project.repository) {
    events.push(createAuditEvent({
      workspaceId: project.workspaceId,
      eventType: "project.repository.connected",
      entityType: "project",
      entityId: project.id,
      source: "api",
      occurredAt: project.updatedAt,
      metadata: {
        repository: `${project.repository.owner}/${project.repository.name}`,
        defaultBranch: project.repository.defaultBranch
      },
      deduplicationKey: `project-repository:${project.id}:${project.updatedAt}`
    }));
  }
  if (before.syncTokenHash !== project.syncTokenHash && project.syncTokenHash) {
    events.push(createAuditEvent({
      workspaceId: project.workspaceId,
      eventType: "project.sync_token.rotated",
      entityType: "project",
      entityId: project.id,
      source: "api",
      occurredAt: project.updatedAt,
      metadata: { tokenLastFour: project.syncTokenLastFour },
      deduplicationKey: `project-sync-token:${project.id}:${project.updatedAt}`
    }));
  }
  if (before.status !== "archived" && project.status === "archived") {
    events.push(createAuditEvent({
      workspaceId: project.workspaceId,
      eventType: "project.archived",
      entityType: "project",
      entityId: project.id,
      source: "api",
      occurredAt: project.archivedAt ?? project.updatedAt,
      metadata: {},
      deduplicationKey: `project-archived:${project.id}`
    }));
  }
  if (project.sync.revision > before.sync.revision) {
    events.push(createAuditEvent({
      workspaceId: project.workspaceId,
      eventType: "project.repository.synced",
      entityType: "project",
      entityId: project.id,
      source: "project-sync",
      occurredAt: project.sync.lastSyncedAt ?? project.updatedAt,
      metadata: {
        revision: project.sync.revision,
        commitSha: project.sync.lastCommitSha,
        ref: project.sync.lastRef
      },
      deduplicationKey: `project-sync:${project.id}:${project.sync.revision}`
    }));
  }
  const previousBindings = new Map(before.bindings.map((binding) => [binding.id, binding]));
  for (const binding of project.bindings) {
    const previous = previousBindings.get(binding.id);
    if (
      binding.kind !== "skill" ||
      binding.status !== "synced" ||
      binding.source !== "harhub" ||
      !previous?.fork
    ) continue;
    events.push(createAuditEvent({
      workspaceId: project.workspaceId,
      eventType: "project.skill.published",
      entityType: "project",
      entityId: project.id,
      source: "api",
      occurredAt: project.updatedAt,
      metadata: {
        bindingId: binding.id,
        assetId: binding.assetId,
        digest: binding.sourceDigest,
        path: binding.path
      },
      deduplicationKey: `project-skill-published:${project.id}:${binding.id}:${binding.sourceDigest}`
    }));
  }
  return events;
}

function assetVersionAuditEvent(
  workspaceId: string,
  asset: AssetRecord,
  version: AssetVersionRecord,
  backfilled: boolean
): PendingAuditEvent {
  const restored = version.source === "rollback";
  return createAuditEvent({
    workspaceId,
    eventType: restored ? "asset.version.restored" : "asset.version.created",
    entityType: "asset",
    entityId: asset.id,
    actorAccountId: version.createdByAccountId,
    source: backfilled
      ? "migration"
      : version.source === "project-sync"
        ? "project-sync"
        : "api",
    occurredAt: version.createdAt,
    metadata: {
      version: version.version,
      source: version.source,
      checksum: version.checksum,
      fileCount: version.fileCount,
      size: version.size,
      backfilled
    },
    deduplicationKey: `asset-version:${asset.id}:${version.version}`
  });
}

function createAuditEvent(input: {
  workspaceId: string;
  eventType: WorkspaceAuditEventType;
  entityType: WorkspaceAuditEvent["entityType"];
  entityId: string;
  actorAccountId?: string;
  source: WorkspaceAuditEvent["source"];
  occurredAt: string;
  metadata: Record<string, unknown>;
  deduplicationKey: string;
}): PendingAuditEvent {
  return {
    id: randomUUID(),
    workspaceId: input.workspaceId,
    eventType: input.eventType,
    entityType: input.entityType,
    entityId: input.entityId,
    ...(input.actorAccountId ? { actorAccountId: input.actorAccountId } : {}),
    source: input.source,
    occurredAt: input.occurredAt,
    metadata: input.metadata,
    deduplicationKey: input.deduplicationKey
  };
}

async function insertAuditEvents(
  client: PoolClient,
  events: PendingAuditEvent[]
): Promise<void> {
  if (events.length === 0) return;
  const values: unknown[] = [];
  const rows = events.map((event, rowIndex) => {
    const offset = rowIndex * 10;
    values.push(
      event.id,
      event.workspaceId,
      event.eventType,
      event.entityType,
      event.entityId,
      event.actorAccountId ?? null,
      event.source,
      event.occurredAt,
      JSON.stringify(event.metadata),
      event.deduplicationKey
    );
    return `(${Array.from({ length: 10 }, (_, index) => `$${offset + index + 1}`).join(", ")})`;
  });
  await client.query(
    `insert into harhub_audit_events (
       id, workspace_id, event_type, entity_type, entity_id,
       actor_account_id, source, occurred_at, metadata, deduplication_key
     ) values ${rows.join(", ")}
     on conflict (workspace_id, deduplication_key) do nothing`,
    values
  );
}

function assetVersionFromRow(row: AssetVersionRow): AssetVersionRecord {
  return {
    version: Number(row.version),
    createdAt: timestampString(row.created_at),
    source: row.source,
    ...(row.created_by_account_id
      ? { createdByAccountId: row.created_by_account_id }
      : {}),
    summary: row.summary,
    changes: Array.isArray(row.changes) ? row.changes : [],
    ...(row.checksum ? { checksum: row.checksum } : {}),
    ...(row.file_count === null ? {} : { fileCount: Number(row.file_count) }),
    ...(row.size === null ? {} : { size: Number(row.size) }),
    displayName: row.display_name,
    description: row.description,
    health: row.health,
    validation: {
      errors: Number(row.validation_errors),
      warnings: Number(row.validation_warnings)
    },
    ...(row.storage ? { storage: row.storage } : {})
  };
}

function auditEventFromRow(row: AuditEventRow): WorkspaceAuditEvent {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    eventType: row.event_type,
    entityType: row.entity_type,
    entityId: row.entity_id,
    ...(row.actor_account_id ? { actorAccountId: row.actor_account_id } : {}),
    source: row.source,
    occurredAt: timestampString(row.occurred_at),
    metadata: row.metadata ?? {}
  };
}

function assetVersionKey(assetId: string, version: number): string {
  return `${assetId}:${version}`;
}

function timestampString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

async function acquireTransactionLock(client: PoolClient, key: string): Promise<void> {
  await client.query(
    "select pg_advisory_xact_lock(hashtextextended($1, 0))",
    [key]
  );
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
