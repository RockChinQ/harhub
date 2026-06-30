import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type {
  AssetCatalog,
  AssetHealth,
  AssetRecord,
  SkillCatalog,
  SkillRecord,
  ValidationIssue
} from "../../shared/types.js";

export const DEFAULT_ASSET_CATALOG_PATH = ".harhub/assets.json";

export function createAssetCatalog(
  skills: SkillRecord[],
  issues: ValidationIssue[] = []
): AssetCatalog {
  const assets = skills
    .map((skill) => skillToAsset(skill, issues))
    .sort((a, b) => a.id.localeCompare(b.id));

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    assets,
    skills: skills.sort((a, b) => a.id.localeCompare(b.id))
  };
}

export function readAssetCatalog(catalogPath: string): AssetCatalog {
  if (!existsSync(catalogPath)) {
    throw new Error(
      `Asset catalog not found at ${catalogPath}. Run "harhub assets scan" first.`
    );
  }

  return normalizeAssetCatalog(
    JSON.parse(readFileSync(catalogPath, "utf8")) as AssetCatalog | SkillCatalog
  );
}

export function writeAssetCatalog(catalogPath: string, catalog: AssetCatalog): void {
  mkdirSync(path.dirname(catalogPath), { recursive: true });
  writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
}

export function skillToAsset(
  skill: SkillRecord,
  issues: ValidationIssue[] = []
): AssetRecord {
  const skillIssues = issues.filter((issue) => issue.skillId === skill.id);
  const errors = skillIssues.filter((issue) => issue.severity === "error").length;
  const warnings = skillIssues.filter((issue) => issue.severity === "warning").length;

  return {
    id: skill.id.replace(/^skill:/, "asset:skill:"),
    kind: "skill",
    name: skill.name,
    displayName: skill.displayName,
    slug: skill.slug,
    description: skill.description,
    owner: skill.owner,
    packageName: skill.packageName,
    lifecycleState: skill.lifecycleState,
    health: healthFromIssueCounts(errors, warnings),
    tags: skill.tags,
    contentHash: skill.contentHash,
    source: skill.source,
    validation: {
      errors,
      warnings
    },
    metadata: {
      agents: skill.agents,
      headings: skill.headings,
      scripts: skill.resources.scripts.length,
      references: skill.resources.references.length,
      assets: skill.resources.assets.length
    },
    skill,
    discoveredAt: skill.discoveredAt,
    updatedAt: new Date().toISOString()
  };
}

export function filterAssets(
  catalog: AssetCatalog,
  filters: { kind?: string; tag?: string; owner?: string; packageName?: string }
): AssetRecord[] {
  return catalog.assets.filter((asset) => {
    if (filters.kind && asset.kind !== filters.kind) return false;
    if (filters.tag && !asset.tags.includes(filters.tag)) return false;
    if (filters.owner && asset.owner !== filters.owner) return false;
    if (filters.packageName && asset.packageName !== filters.packageName) return false;
    return true;
  });
}

export function upsertAsset(catalog: AssetCatalog, asset: AssetRecord): AssetCatalog {
  const assets = [
    ...catalog.assets.filter((item) => item.id !== asset.id),
    asset
  ].sort((a, b) => a.id.localeCompare(b.id));

  return {
    ...catalog,
    generatedAt: new Date().toISOString(),
    assets
  };
}

export function updateCatalogAsset(
  catalog: AssetCatalog,
  assetId: string,
  input: {
    description?: string;
    owner?: string;
    tags?: string[];
    lifecycleState?: string;
    agents?: string[];
  }
): AssetCatalog {
  const asset = catalog.assets.find((item) => item.id === assetId);
  if (!asset) throw new Error("Asset not found.");

  const next: AssetRecord = {
    ...asset,
    description:
      typeof input.description === "string" && input.description.trim()
        ? input.description.trim()
        : asset.description,
    owner:
      typeof input.owner === "string"
        ? input.owner.trim() || undefined
        : asset.owner,
    tags: input.tags ? unique(input.tags) : asset.tags,
    lifecycleState: normalizeLifecycle(input.lifecycleState) ?? asset.lifecycleState,
    metadata: {
      ...asset.metadata,
      ...(input.agents ? { agents: unique(input.agents) } : {})
    },
    updatedAt: new Date().toISOString()
  };

  return upsertAsset(catalog, next);
}

export function removeCatalogAsset(catalog: AssetCatalog, assetId: string): AssetCatalog {
  return {
    ...catalog,
    generatedAt: new Date().toISOString(),
    assets: catalog.assets.filter((asset) => asset.id !== assetId),
    skills: catalog.skills.filter((skill) => skill.id.replace(/^skill:/, "asset:skill:") !== assetId)
  };
}

export function findAsset(
  catalog: AssetCatalog,
  query: string
): AssetRecord | undefined {
  const normalized = query.toLowerCase();
  return catalog.assets.find(
    (asset) =>
      asset.id.toLowerCase() === normalized ||
      asset.slug.toLowerCase() === normalized ||
      asset.name.toLowerCase() === normalized ||
      asset.displayName.toLowerCase() === normalized ||
      asset.skill?.id.toLowerCase() === normalized
  );
}

export function assetCatalogToSkillCatalog(catalog: AssetCatalog): SkillCatalog {
  return {
    schemaVersion: 1,
    generatedAt: catalog.generatedAt,
    workspaceId: catalog.workspaceId,
    skills: catalog.skills.length > 0
      ? catalog.skills
      : catalog.assets
        .map((asset) => asset.skill)
        .filter((skill): skill is SkillRecord => Boolean(skill))
  };
}

function normalizeAssetCatalog(catalog: AssetCatalog | SkillCatalog): AssetCatalog {
  if ("assets" in catalog && Array.isArray(catalog.assets)) {
    catalog.skills ??= catalog.assets
      .map((asset) => asset.skill)
      .filter((skill): skill is SkillRecord => Boolean(skill));
    return catalog;
  }

  return {
    ...createAssetCatalog(catalog.skills),
    workspaceId: catalog.workspaceId,
    generatedAt: catalog.generatedAt
  };
}

function normalizeLifecycle(value: unknown): AssetRecord["lifecycleState"] | undefined {
  if (
    value === "experimental" ||
    value === "stable" ||
    value === "deprecated" ||
    value === "archived"
  ) {
    return value;
  }

  return undefined;
}

function healthFromIssueCounts(errors: number, warnings: number): AssetHealth {
  if (errors > 0) return "error";
  if (warnings > 0) return "warning";
  return "valid";
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort();
}
