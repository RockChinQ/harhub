import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import {
  findNearestManifest,
  pathRelativeToRoot
} from "../../shared/fs-utils.js";
import { slugify } from "../../shared/markdown.js";
import type {
  SkillLifecycleState,
  SkillPackageManifest,
  SkillRecord
} from "../../shared/types.js";
import { unique } from "./utils.js";

export function upsertHarhubManifest(
  skillRoot: string,
  artifact: {
    path: string;
    owner?: string;
    tags?: string[];
    lifecycleState?: SkillLifecycleState;
    agents?: string[];
    replaceTags?: boolean;
  }
): void {
  const manifestPath = path.join(skillRoot, "harhub.yaml");
  const manifest =
    (existsSync(manifestPath)
      ? YAML.parse(readFileSync(manifestPath, "utf8"))
      : undefined) as SkillPackageManifest | undefined;

  const next = createManifestBase(manifest, skillRoot);
  mergeManifestMetadata(next, artifact);
  upsertArtifact(next, artifact);
  writeFileSync(manifestPath, YAML.stringify(next));
}

export function removeHarhubManifestArtifact(skill: SkillRecord): void {
  const skillDir = path.dirname(skill.source.absolutePath);
  const manifestInfo = findNearestManifest(skillDir, skill.source.root);
  if (!manifestInfo.path) return;

  const manifest =
    (YAML.parse(readFileSync(manifestInfo.path, "utf8")) as SkillPackageManifest | undefined) ??
    undefined;
  if (!manifest?.spec?.artifacts) return;

  const manifestRoot = path.dirname(manifestInfo.path);
  const artifactPath = pathRelativeToRoot(manifestRoot, skill.source.absolutePath);
  manifest.spec.artifacts = manifest.spec.artifacts.filter(
    (artifact) => artifact.type !== "skill" || artifact.path !== artifactPath
  );

  writeFileSync(manifestInfo.path, YAML.stringify(manifest));
}

function createManifestBase(
  manifest: SkillPackageManifest | undefined,
  skillRoot: string
): SkillPackageManifest {
  const next: SkillPackageManifest = manifest ?? {
    apiVersion: "harhub.io/v1",
    kind: "HarnessPackage",
    metadata: {
      name: slugify(path.basename(skillRoot)) || "local-skills"
    },
    spec: {
      maturity: "experimental",
      artifacts: []
    }
  };

  next.metadata ??= {};
  next.spec ??= {};
  next.spec.artifacts ??= [];
  return next;
}

function mergeManifestMetadata(
  manifest: SkillPackageManifest,
  artifact: Parameters<typeof upsertHarhubManifest>[1]
): void {
  manifest.metadata ??= {};
  manifest.spec ??= {};

  if (artifact.owner && !manifest.metadata.owner) {
    manifest.metadata.owner = artifact.owner;
  }

  if (artifact.tags && artifact.tags.length > 0 && !artifact.replaceTags) {
    manifest.metadata.tags = unique([...(manifest.metadata.tags ?? []), ...artifact.tags]);
  }

  if (artifact.lifecycleState) {
    manifest.spec.maturity = artifact.lifecycleState;
  }

  if (artifact.agents) {
    manifest.spec.compatibility ??= {};
    manifest.spec.compatibility.agents = artifact.agents;
  }
}

function upsertArtifact(
  manifest: SkillPackageManifest,
  artifact: Parameters<typeof upsertHarhubManifest>[1]
): void {
  manifest.spec ??= {};
  manifest.spec.artifacts ??= [];

  const existing = manifest.spec.artifacts.find(
    (item) => item.type === "skill" && item.path === artifact.path
  );

  if (!existing) {
    manifest.spec.artifacts.push({
      type: "skill",
      path: artifact.path,
      ...(artifact.owner ? { owner: artifact.owner } : {}),
      ...(artifact.tags && artifact.tags.length > 0 ? { tags: artifact.tags } : {})
    });
    return;
  }

  if (Object.hasOwn(artifact, "owner")) {
    if (artifact.owner) existing.owner = artifact.owner;
    else delete existing.owner;
  }

  if (artifact.tags) {
    existing.tags = artifact.replaceTags
      ? artifact.tags
      : unique([...(existing.tags ?? []), ...artifact.tags]);
  }
}
