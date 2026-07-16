import type { Request } from "express";

import { findAsset } from "../../features/assets/index.js";
import {
  createAssetShare,
  findAssetShare,
  findAssetShareByToken,
  loadState,
  revokeAssetShare
} from "../../state/index.js";
import type {
  AgentSkillsDiscoveryIndex,
  AssetRecord,
  AssetShareRecord,
  AssetShareResponse,
  WorkspaceRecord
} from "../../shared/types.js";
import type { WorkspaceContext } from "../../state/types.js";
import { publicAppUrl } from "./oauth.js";
import { getStoredSkillArchive } from "./skill-packages.js";
import { loadOrCreateWorkspaceAssetCatalog } from "./workspace-catalogs.js";

export async function getWorkspaceAssetShare(
  req: Request,
  context: WorkspaceContext,
  assetQuery: string
): Promise<AssetShareResponse | undefined> {
  const asset = await requireStoredWorkspaceAsset(context.workspace, assetQuery);
  const share = await findAssetShare(context.workspace.id, asset.id);
  return share ? buildAssetShareResponse(req, share, asset) : undefined;
}

export async function shareWorkspaceAsset(
  req: Request,
  context: WorkspaceContext,
  assetQuery: string
): Promise<AssetShareResponse> {
  const asset = await requireStoredWorkspaceAsset(context.workspace, assetQuery);
  const share = await createAssetShare({
    workspaceId: context.workspace.id,
    assetId: asset.id,
    createdByAccountId: context.account.id
  });
  return buildAssetShareResponse(req, share, asset);
}

export async function unshareWorkspaceAsset(
  context: WorkspaceContext,
  assetQuery: string
): Promise<boolean> {
  const asset = await requireStoredWorkspaceAsset(context.workspace, assetQuery);
  return revokeAssetShare(context.workspace.id, asset.id);
}

export async function resolvePublicAssetShare(
  req: Request,
  token: string
): Promise<{ response: AssetShareResponse; asset: AssetRecord } | undefined> {
  const share = await findAssetShareByToken(token);
  if (!share) return undefined;

  const state = await loadState();
  const workspace = state.workspaces.find((item) => item.id === share.workspaceId);
  if (!workspace) return undefined;

  const asset = findAsset(await loadOrCreateWorkspaceAssetCatalog(workspace), share.assetId);
  if (!asset?.storage) return undefined;

  return {
    response: buildAssetShareResponse(req, share, asset),
    asset
  };
}

export async function resolvePublicAssetShareArchive(
  req: Request,
  token: string
): Promise<
  | {
      response: AssetShareResponse;
      asset: AssetRecord;
      buffer: Buffer;
      checksum: string;
    }
  | undefined
> {
  const resolved = await resolvePublicAssetShare(req, token);
  if (!resolved?.asset.storage) return undefined;

  const archive = await getStoredSkillArchive(resolved.asset);
  return {
    ...resolved,
    buffer: archive.buffer,
    checksum: archive.checksum
  };
}

export function buildAgentSkillsDiscoveryIndex(
  response: AssetShareResponse,
  asset: AssetRecord,
  checksum: string
): AgentSkillsDiscoveryIndex {
  return {
    $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
    skills: [{
      name: asset.name,
      type: "archive",
      description: asset.description,
      url: response.downloadUrl,
      digest: `sha256:${checksum}`
    }]
  };
}

function buildAssetShareResponse(
  req: Request,
  share: AssetShareRecord,
  asset: AssetRecord
): AssetShareResponse {
  const baseUrl = publicAppUrl(req);
  const token = encodeURIComponent(share.token);
  const shareUrl = `${baseUrl}/s/${token}`;
  return {
    token: share.token,
    createdAt: share.createdAt,
    shareUrl,
    downloadUrl: `${baseUrl}/api/public/shares/${token}/download`,
    cliCommand: `harhub install ${shareUrl}`,
    skillsCliCommand: `npx skills add ${shareUrl}`,
    fileName: `${asset.slug || "skill"}.zip`,
    asset: {
      id: asset.id,
      kind: asset.kind,
      name: asset.name,
      displayName: asset.displayName,
      slug: asset.slug,
      description: asset.description,
      health: asset.health,
      validation: asset.validation,
      fileCount: asset.storage?.fileCount ?? 0,
      size: asset.storage?.size ?? 0
    }
  };
}

async function requireStoredWorkspaceAsset(
  workspace: WorkspaceRecord,
  assetQuery: string
): Promise<AssetRecord> {
  const asset = findAsset(await loadOrCreateWorkspaceAssetCatalog(workspace), assetQuery);
  if (!asset) throw new Error("Asset not found.");
  if (!asset.storage) throw new Error("Only uploaded skill packages can be shared.");
  return asset;
}
