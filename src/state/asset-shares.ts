import { randomBytes } from "node:crypto";

import type { AssetShareRecord } from "../shared/types.js";
import { loadState, saveState } from "./store.js";

export async function findAssetShare(
  workspaceId: string,
  assetId: string
): Promise<AssetShareRecord | undefined> {
  const state = await loadState();
  return state.assetShares.find(
    (share) => share.workspaceId === workspaceId && share.assetId === assetId
  );
}

export async function findAssetShareByToken(
  token: string
): Promise<AssetShareRecord | undefined> {
  const state = await loadState();
  return state.assetShares.find((share) => share.token === token);
}

export async function createAssetShare(input: {
  workspaceId: string;
  assetId: string;
  createdByAccountId: string;
}): Promise<AssetShareRecord> {
  const state = await loadState();
  const existing = state.assetShares.find(
    (share) => share.workspaceId === input.workspaceId && share.assetId === input.assetId
  );
  if (existing) return existing;

  const share: AssetShareRecord = {
    token: createUniqueToken(state.assetShares),
    workspaceId: input.workspaceId,
    assetId: input.assetId,
    createdByAccountId: input.createdByAccountId,
    createdAt: new Date().toISOString()
  };
  state.assetShares.push(share);
  await saveState(state);
  return share;
}

export async function revokeAssetShare(
  workspaceId: string,
  assetId: string
): Promise<boolean> {
  const state = await loadState();
  const nextShares = state.assetShares.filter(
    (share) => !(share.workspaceId === workspaceId && share.assetId === assetId)
  );
  if (nextShares.length === state.assetShares.length) return false;
  state.assetShares = nextShares;
  await saveState(state);
  return true;
}

export async function removeAssetShares(
  workspaceId: string,
  assetIds: string[]
): Promise<void> {
  if (assetIds.length === 0) return;
  const state = await loadState();
  const ids = new Set(assetIds);
  const nextShares = state.assetShares.filter(
    (share) => share.workspaceId !== workspaceId || !ids.has(share.assetId)
  );
  if (nextShares.length === state.assetShares.length) return;
  state.assetShares = nextShares;
  await saveState(state);
}

function createUniqueToken(shares: AssetShareRecord[]): string {
  const existing = new Set(shares.map((share) => share.token));
  let token: string;
  do {
    token = randomBytes(24).toString("base64url");
  } while (existing.has(token));
  return token;
}
