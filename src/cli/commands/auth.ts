import { spawn } from "node:child_process";
import type { WorkspaceRecord } from "../../shared/types.js";
import {
  getHarhubSession,
  pollDeviceToken,
  requestDeviceAuthorization,
  resolveHarhubApiUrl,
  resolveHarhubToken,
  resolveHarhubWorkspaceId,
  revokeHarhubSession
} from "../api.js";
import { optionString } from "../args.js";
import {
  clearCliConfig,
  getCliConfigPath,
  readCliConfig,
  writeCliConfig
} from "../config.js";
import { canUseInteractiveTerminal, selectWorkspace } from "../interactive.js";
import type { ParsedArgs } from "../types.js";

export async function runLogin(parsed: ParsedArgs): Promise<number> {
  const apiUrl = resolveHarhubApiUrl(parsed);
  const authorization = await requestDeviceAuthorization(apiUrl);
  const output = parsed.options.json ? console.error : console.log;

  output(`Open ${authorization.verification_uri}`);
  output(`Enter code: ${authorization.user_code}`);
  if (!hasBooleanOption(parsed, "no-browser")) {
    openBrowser(authorization.verification_uri_complete);
  }

  const accessToken = await waitForDeviceToken(apiUrl, authorization);
  let session: Awaited<ReturnType<typeof getHarhubSession>>;
  let workspace: WorkspaceRecord;
  try {
    session = await getHarhubSession(apiUrl, accessToken);
    const previousConfig = readCliConfig();
    const requestedWorkspace =
      optionString(parsed, "workspace") ??
      (previousConfig?.apiUrl === apiUrl ? previousConfig.workspaceId : undefined);
    const selectedWorkspace = await chooseWorkspace(
      session.workspaces,
      requestedWorkspace
    );
    if (!selectedWorkspace) {
      throw new Error(
        session.workspaces.length === 0
          ? "This account does not have access to a workspace."
          : "Choose a workspace with --workspace <id|slug|name>."
      );
    }
    workspace = selectedWorkspace;

    writeCliConfig({
      version: 1,
      apiUrl,
      accessToken,
      workspaceId: workspace.id,
      account: {
        id: session.account.id,
        email: session.account.email,
        name: session.account.name
      },
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug
      }
    });
  } catch (error) {
    await revokeHarhubSession(apiUrl, accessToken).catch(() => undefined);
    throw error;
  }

  if (parsed.options.json) {
    console.log(
      JSON.stringify(
        {
          authenticated: true,
          apiUrl,
          account: session.account,
          workspace,
          configPath: getCliConfigPath()
        },
        null,
        2
      )
    );
  } else {
    console.log(`Logged in as ${session.account.email}.`);
    console.log(`Default workspace: ${workspace.name} (${workspace.id})`);
    console.log(`Saved login: ${getCliConfigPath()}`);
  }
  return 0;
}

export async function runLogout(parsed: ParsedArgs): Promise<number> {
  const config = readCliConfig();
  const token = resolveHarhubToken(parsed);
  const apiUrl = resolveHarhubApiUrl(parsed);
  const savedLoginMatchesTarget =
    config?.apiUrl.replace(/\/+$/g, "") === apiUrl;
  let warning: string | undefined;
  if (token) {
    try {
      await revokeHarhubSession(apiUrl, token);
    } catch (error) {
      warning = error instanceof Error ? error.message : String(error);
    }
  }
  if (savedLoginMatchesTarget) clearCliConfig();

  if (parsed.options.json) {
    console.log(
      JSON.stringify(
        {
          loggedOut: Boolean(token || savedLoginMatchesTarget),
          apiUrl,
          removedSavedLogin: savedLoginMatchesTarget,
          warning
        },
        null,
        2
      )
    );
  } else {
    console.log(
      savedLoginMatchesTarget
        ? "Logged out. Saved CLI credentials were removed."
        : token
          ? `Logged out from ${apiUrl}.`
          : `No saved login for ${apiUrl}.`
    );
    if (warning) console.error(`Warning: ${warning}`);
  }
  return 0;
}

export async function runWhoami(parsed: ParsedArgs): Promise<number> {
  const token = resolveHarhubToken(parsed);
  if (!token) {
    console.error("Not logged in. Run `harhub login`.");
    return 1;
  }

  const apiUrl = resolveHarhubApiUrl(parsed);
  const session = await getHarhubSession(apiUrl, token);
  const workspaceId = resolveHarhubWorkspaceId(parsed);
  const workspace = session.workspaces.find((item) => item.id === workspaceId);
  if (parsed.options.json) {
    console.log(JSON.stringify({ apiUrl, account: session.account, workspace }, null, 2));
  } else {
    console.log(`${session.account.name} <${session.account.email}>`);
    console.log(`Server: ${apiUrl}`);
    console.log(
      workspace
        ? `Workspace: ${workspace.name} (${workspace.id})`
        : "Workspace: not configured"
    );
  }
  return 0;
}

async function waitForDeviceToken(
  apiUrl: string,
  authorization: {
    device_code: string;
    expires_in: number;
    interval: number;
  }
): Promise<string> {
  const expiresAt = Date.now() + authorization.expires_in * 1000;
  let intervalSeconds = authorization.interval || 5;

  while (Date.now() < expiresAt) {
    await delay(intervalSeconds * 1000);
    const result = await pollDeviceToken(apiUrl, authorization.device_code);
    if ("access_token" in result) return result.access_token;
    if (result.error === "authorization_pending") continue;
    if (result.error === "slow_down") {
      intervalSeconds += 5;
      continue;
    }
    throw new Error(
      result.error_description ?? `Device authorization failed: ${result.error}`
    );
  }

  throw new Error("Device authorization expired before it was completed.");
}

async function chooseWorkspace(
  workspaces: WorkspaceRecord[],
  requested: string | undefined
): Promise<WorkspaceRecord | undefined> {
  if (requested) {
    const normalized = requested.toLowerCase();
    const matches = workspaces.filter(
      (workspace) =>
        workspace.id === requested ||
        workspace.slug.toLowerCase() === normalized ||
        workspace.name.toLowerCase() === normalized
    );
    if (matches.length === 1) return matches[0];
    if (matches.length === 0) {
      throw new Error(`Workspace not found for this account: ${requested}`);
    }
    throw new Error(`Workspace selection is ambiguous: ${requested}`);
  }
  if (workspaces.length === 1) return workspaces[0];
  if (!canUseInteractiveTerminal()) return undefined;
  return selectWorkspace({ workspaces });
}

function openBrowser(url: string): void {
  const command =
    process.platform === "darwin"
      ? { file: "open", args: [url] }
      : process.platform === "win32"
        ? { file: "cmd.exe", args: ["/d", "/s", "/c", "start", "", url] }
        : { file: "xdg-open", args: [url] };
  const child = spawn(command.file, command.args, {
    detached: true,
    stdio: "ignore"
  });
  child.on("error", () => undefined);
  child.unref();
}

function hasBooleanOption(parsed: ParsedArgs, name: string): boolean {
  const value = parsed.options[name];
  return value === true || value === "true";
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
