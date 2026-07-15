import { createHash, randomBytes } from "node:crypto";
import type { OAuthDeviceAuthorizationSummary } from "../shared/oauth.js";
import { loadState, saveState } from "./store.js";
import type { OAuthDeviceAuthorizationRecord } from "./types.js";

const DEVICE_AUTHORIZATION_TTL_MS = 10 * 60 * 1000;
const DEVICE_POLL_INTERVAL_SECONDS = 5;
const USER_CODE_ALPHABET = "BCDFGHJKLMNPQRSTVWXYZ23456789";

export interface CreatedDeviceAuthorization {
  deviceCode: string;
  userCode: string;
  expiresIn: number;
  interval: number;
}

export type DeviceTokenPollResult =
  | { status: "authorized"; accessToken: string; scope: string }
  | { status: "authorization_pending" }
  | { status: "slow_down"; interval: number }
  | { status: "access_denied" }
  | { status: "expired_token" }
  | { status: "invalid_grant" };

export async function createDeviceAuthorization(input: {
  clientId: string;
  scope: string;
}): Promise<CreatedDeviceAuthorization> {
  const state = await loadState();
  pruneDeviceAuthorizations(state.deviceAuthorizations);

  const deviceCode = randomBytes(32).toString("base64url");
  const userCode = createUniqueUserCode(state.deviceAuthorizations);
  const record: OAuthDeviceAuthorizationRecord = {
    deviceCodeHash: hashDeviceCode(deviceCode),
    userCode,
    clientId: input.clientId,
    scope: input.scope,
    status: "pending",
    intervalSeconds: DEVICE_POLL_INTERVAL_SECONDS,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + DEVICE_AUTHORIZATION_TTL_MS).toISOString()
  };
  state.deviceAuthorizations.push(record);
  await saveState(state);

  return {
    deviceCode,
    userCode,
    expiresIn: Math.floor(DEVICE_AUTHORIZATION_TTL_MS / 1000),
    interval: record.intervalSeconds
  };
}

export async function getDeviceAuthorization(
  userCode: string
): Promise<OAuthDeviceAuthorizationSummary> {
  const state = await loadState();
  const record = findByUserCode(state.deviceAuthorizations, userCode);
  if (!record || isExpired(record) || record.status === "consumed") {
    throw new Error("Device authorization code is invalid or expired.");
  }

  return toSummary(record);
}

export async function decideDeviceAuthorization(input: {
  userCode: string;
  accountId: string;
  approve: boolean;
}): Promise<OAuthDeviceAuthorizationSummary> {
  const state = await loadState();
  const record = findByUserCode(state.deviceAuthorizations, input.userCode);
  if (!record || isExpired(record) || record.status === "consumed") {
    throw new Error("Device authorization code is invalid or expired.");
  }
  if (record.status !== "pending") {
    throw new Error("Device authorization has already been completed.");
  }
  if (!state.accounts.some((account) => account.id === input.accountId)) {
    throw new Error("Account not found.");
  }

  const now = new Date().toISOString();
  record.status = input.approve ? "approved" : "denied";
  if (input.approve) {
    record.accountId = input.accountId;
    record.approvedAt = now;
  } else {
    record.deniedAt = now;
  }
  await saveState(state);
  return toSummary(record);
}

export async function pollDeviceAuthorization(input: {
  deviceCode: string;
  clientId: string;
}): Promise<DeviceTokenPollResult> {
  const state = await loadState();
  const record = state.deviceAuthorizations.find(
    (item) =>
      item.deviceCodeHash === hashDeviceCode(input.deviceCode) &&
      item.clientId === input.clientId
  );

  if (!record || record.status === "consumed") {
    return { status: "invalid_grant" };
  }
  if (isExpired(record)) {
    return { status: "expired_token" };
  }
  if (record.status === "denied") {
    return { status: "access_denied" };
  }
  if (record.status === "approved") {
    if (!record.accountId) return { status: "invalid_grant" };
    const accessToken = randomBytes(32).toString("hex");
    record.status = "consumed";
    record.consumedAt = new Date().toISOString();
    state.sessions.push({
      token: accessToken,
      accountId: record.accountId,
      createdAt: record.consumedAt
    });
    await saveState(state);
    return { status: "authorized", accessToken, scope: record.scope };
  }

  const now = Date.now();
  const lastPolledAt = record.lastPolledAt
    ? new Date(record.lastPolledAt).getTime()
    : undefined;
  if (
    lastPolledAt !== undefined &&
    now - lastPolledAt < record.intervalSeconds * 1000
  ) {
    record.intervalSeconds += 5;
    record.lastPolledAt = new Date(now).toISOString();
    await saveState(state);
    return { status: "slow_down", interval: record.intervalSeconds };
  }

  record.lastPolledAt = new Date(now).toISOString();
  await saveState(state);
  return { status: "authorization_pending" };
}

function pruneDeviceAuthorizations(records: OAuthDeviceAuthorizationRecord[]): void {
  const cutoff = Date.now() - DEVICE_AUTHORIZATION_TTL_MS;
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = records[index];
    const expiredAt = new Date(record?.expiresAt ?? 0).getTime();
    if (!record || expiredAt < cutoff || record.status === "consumed") {
      records.splice(index, 1);
    }
  }
}

function createUniqueUserCode(records: OAuthDeviceAuthorizationRecord[]): string {
  const activeCodes = new Set(
    records.filter((record) => !isExpired(record)).map((record) => record.userCode)
  );
  let code: string;
  do {
    const raw = Array.from({ length: 8 }, () => {
      const index = randomBytes(1)[0]! % USER_CODE_ALPHABET.length;
      return USER_CODE_ALPHABET[index];
    }).join("");
    code = `${raw.slice(0, 4)}-${raw.slice(4)}`;
  } while (activeCodes.has(code));
  return code;
}

function findByUserCode(
  records: OAuthDeviceAuthorizationRecord[],
  userCode: string
): OAuthDeviceAuthorizationRecord | undefined {
  const normalized = normalizeUserCode(userCode);
  return records.find((record) => normalizeUserCode(record.userCode) === normalized);
}

function normalizeUserCode(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function hashDeviceCode(deviceCode: string): string {
  return createHash("sha256").update(deviceCode).digest("hex");
}

function isExpired(record: OAuthDeviceAuthorizationRecord): boolean {
  return new Date(record.expiresAt).getTime() <= Date.now();
}

function toSummary(
  record: OAuthDeviceAuthorizationRecord
): OAuthDeviceAuthorizationSummary {
  return {
    clientId: record.clientId,
    scope: record.scope,
    userCode: record.userCode,
    status: record.status === "consumed" ? "approved" : record.status,
    expiresAt: record.expiresAt
  };
}
