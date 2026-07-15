import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from "node:fs";
import os from "node:os";
import path from "node:path";

export interface HarhubCliConfig {
  version: 1;
  apiUrl: string;
  accessToken: string;
  workspaceId: string;
  account?: {
    id: string;
    email: string;
    name: string;
  };
  workspace?: {
    id: string;
    name: string;
    slug: string;
  };
}

export function getCliConfigPath(): string {
  if (process.env.HARHUB_CONFIG) {
    return path.resolve(process.env.HARHUB_CONFIG);
  }

  const configRoot =
    process.platform === "win32"
      ? process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming")
      : process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config");
  return path.join(configRoot, "harhub", "config.json");
}

export function readCliConfig(): HarhubCliConfig | undefined {
  const configPath = getCliConfigPath();
  if (!existsSync(configPath)) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(configPath, "utf8"));
  } catch (error) {
    throw new Error(
      `Could not read Harhub CLI config at ${configPath}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  if (!isCliConfig(parsed)) {
    throw new Error(`Harhub CLI config is invalid: ${configPath}`);
  }
  return parsed;
}

export function writeCliConfig(config: HarhubCliConfig): void {
  const configPath = getCliConfigPath();
  const configDir = path.dirname(configPath);
  const configDirExists = existsSync(configDir);
  mkdirSync(configDir, { recursive: true, mode: 0o700 });

  const temporaryPath = `${configPath}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
  renameSync(temporaryPath, configPath);
  if (process.platform !== "win32") {
    if (!configDirExists || !process.env.HARHUB_CONFIG) {
      chmodSync(configDir, 0o700);
    }
    chmodSync(configPath, 0o600);
  }
}

export function clearCliConfig(): void {
  rmSync(getCliConfigPath(), { force: true });
}

function isCliConfig(value: unknown): value is HarhubCliConfig {
  if (!value || typeof value !== "object") return false;
  const config = value as Partial<HarhubCliConfig>;
  return (
    config.version === 1 &&
    typeof config.apiUrl === "string" &&
    Boolean(config.apiUrl.trim()) &&
    typeof config.accessToken === "string" &&
    Boolean(config.accessToken.trim()) &&
    typeof config.workspaceId === "string" &&
    Boolean(config.workspaceId.trim())
  );
}
