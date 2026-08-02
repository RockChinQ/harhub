import {
  analyzeStoredSkillFiles,
  type SkillPackageFile
} from "../../features/skills/index.js";
import {
  createImportedSkillAsset,
  findAsset,
  obsoleteAssetStorageObjects,
  upsertAsset
} from "../../features/assets/index.js";
import type { AssetRecord, StoredObject } from "../../shared/types.js";
import { writeWorkspaceAssetCatalog } from "../../state/index.js";
import type { WorkspaceContext } from "../../state/types.js";
import {
  deleteStoredObject,
  uploadSkillFiles
} from "../../storage/index.js";
import { assertWorkspaceAdminContext } from "../authorization.js";
import {
  MAX_PREVIEW_BYTES,
  MAX_PREVIEW_CHARS
} from "../config.js";
import { isTextAssetFile } from "../utils/zip-preview.js";
import { loadStoredSkill } from "./skill-packages.js";
import { loadOrCreateWorkspaceAssetCatalog } from "./workspace-catalogs.js";

export async function updateWorkspaceSkillFile(input: {
  context: WorkspaceContext;
  assetQuery: string;
  path: unknown;
  content: unknown;
  expectedVersion: number;
}): Promise<{ asset: AssetRecord }> {
  assertWorkspaceAdminContext(input.context);
  const filePath = requireFilePath(input.path);
  const content = requireFileContent(input.content);
  const catalog = await loadOrCreateWorkspaceAssetCatalog(input.context.workspace);
  const previous = findAsset(catalog, input.assetQuery);

  if (!previous) throw new Error("Asset not found.");
  if (previous.version !== input.expectedVersion) {
    throw new Error(
      "This Skill changed after the file was opened. Refresh it before saving."
    );
  }
  if (previous.kind !== "skill") {
    throw new Error("Only Skill files can be edited.");
  }
  if (!previous.storage) {
    throw new Error("This Skill has no stored files to edit.");
  }
  if (!isTextAssetFile(filePath)) {
    throw new Error("Only text files can be edited.");
  }

  const stored = await loadStoredSkill(previous.storage);
  const target = stored.files.find((file) => file.path === filePath);
  if (!target) throw new Error("Skill file not found.");

  const nextContent = Buffer.from(content, "utf8");
  if (target.content.equals(nextContent)) return { asset: previous };

  const files = replaceSkillFile(stored.files, filePath, nextContent);
  const skill = analyzeStoredSkillFiles(files);
  if (skill.name !== previous.name) {
    throw new Error(
      "The Skill name in SKILL.md cannot be changed in the file editor."
    );
  }

  let storage: StoredObject | undefined;
  try {
    storage = await uploadSkillFiles({
      workspaceId: input.context.workspace.id,
      skillName: previous.name,
      files,
      checksum: skill.checksum
    });
    const asset = createImportedSkillAsset({
      workspaceId: input.context.workspace.id,
      skill,
      storage,
      previous,
      versionSource: "manual-edit",
      createdByAccountId: input.context.account.id,
      versionSummary: `Edited ${filePath} in Harhub`
    });
    const nextCatalog = upsertAsset(catalog, asset);
    await writeWorkspaceAssetCatalog(input.context.workspace.id, nextCatalog);
    await Promise.all(
      obsoleteAssetStorageObjects([previous], [asset]).map((candidate) =>
        deleteStoredObject(candidate).catch(() => undefined)
      )
    );
    return { asset };
  } catch (error) {
    if (storage) {
      await deleteStoredObject(storage).catch(() => undefined);
    }
    throw error;
  }
}

function replaceSkillFile(
  files: SkillPackageFile[],
  filePath: string,
  content: Buffer
): SkillPackageFile[] {
  return files.map((file) =>
    file.path === filePath ? { ...file, content } : file
  );
}

function requireFilePath(value: unknown): string {
  const filePath = typeof value === "string" ? value : "";
  if (!filePath || filePath.length > 1_000) {
    throw new Error("A valid Skill file path is required.");
  }
  return filePath;
}

function requireFileContent(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Skill file content must be text.");
  }
  if (
    Buffer.byteLength(value, "utf8") > MAX_PREVIEW_BYTES ||
    value.length > MAX_PREVIEW_CHARS
  ) {
    throw new Error("Skill files larger than 256 KB cannot be edited here.");
  }
  return value;
}
