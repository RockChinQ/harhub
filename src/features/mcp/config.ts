import { contentHash } from "../../shared/markdown.js";
import {
  MCP_CONFIG_CHECKSUM_ALGORITHM,
  type AssetHealth,
  type AssetRecord,
  type StoredObject,
  type ValidationIssue
} from "../../shared/types.js";
import { recordAssetVersion } from "../assets/versioning.js";

export const MCP_CONFIG_FILE_NAME = "mcp.json";
export const MAX_MCP_CONFIG_BYTES = 1024 * 1024;

export interface AnalyzedMcpConfiguration {
  content: Buffer;
  checksum: string;
  metadata: NonNullable<AssetRecord["mcp"]>;
  health: AssetHealth;
  validation: AssetRecord["validation"];
  validationIssues: ValidationIssue[];
}

export function analyzeMcpConfiguration(content: Buffer): AnalyzedMcpConfiguration {
  const issues: ValidationIssue[] = [];
  let value: unknown;

  if (content.byteLength === 0) {
    issues.push(issue("error", "mcp.empty", "MCP configuration cannot be empty."));
  } else if (content.byteLength > MAX_MCP_CONFIG_BYTES) {
    issues.push(issue("error", "mcp.too_large", "MCP configuration exceeds the 1 MB limit."));
  } else {
    try {
      value = JSON.parse(content.toString("utf8"));
    } catch {
      issues.push(issue("error", "mcp.invalid_json", "MCP configuration must be valid JSON."));
    }
  }

  const root = isRecord(value) ? value : undefined;
  if (value !== undefined && !root) {
    issues.push(issue("error", "mcp.invalid_root", "MCP configuration must be a JSON object."));
  }
  const serverMap = root && (
    isRecord(root.mcpServers) ? root.mcpServers :
      isRecord(root.servers) ? root.servers :
        undefined
  );
  if (root && !serverMap) {
    issues.push(issue(
      "error",
      "mcp.servers_required",
      'MCP configuration must contain a "mcpServers" or "servers" object.'
    ));
  }

  const serverNames = serverMap ? Object.keys(serverMap).sort() : [];
  if (serverMap && serverNames.length === 0) {
    issues.push(issue("error", "mcp.no_servers", "MCP configuration must define at least one server."));
  }

  const transports = new Set<string>();
  for (const serverName of serverNames) {
    const server = serverMap?.[serverName];
    if (!isRecord(server)) {
      issues.push(issue(
        "error",
        "mcp.invalid_server",
        `MCP server "${serverName}" must be a JSON object.`
      ));
      continue;
    }
    if (typeof server.command === "string" && server.command.trim()) transports.add("stdio");
    else if (typeof server.url === "string" && server.url.trim()) {
      transports.add(readTransport(server));
    } else {
      issues.push(issue(
        "error",
        "mcp.transport_required",
        `MCP server "${serverName}" must define a command or URL.`
      ));
    }
    if (isRecord(server.env)) {
      for (const [key, rawValue] of Object.entries(server.env)) {
        if (
          looksSensitive(key) &&
          typeof rawValue === "string" &&
          rawValue.trim() &&
          !isEnvironmentReference(rawValue)
        ) {
          issues.push(issue(
            "warning",
            "mcp.literal_secret",
            `MCP server "${serverName}" contains a literal value for ${key}; use an environment variable placeholder instead.`
          ));
        }
      }
    }
  }

  const errors = issues.filter((candidate) => candidate.severity === "error").length;
  const warnings = issues.length - errors;
  return {
    content,
    checksum: contentHash(content),
    metadata: {
      serverCount: serverNames.length,
      serverNames,
      transports: Array.from(transports).sort()
    },
    health: errors > 0 ? "error" : warnings > 0 ? "warning" : "valid",
    validation: { errors, warnings },
    validationIssues: issues
  };
}

export function createImportedMcpAsset(input: {
  workspaceId: string;
  name: string;
  displayName: string;
  description: string;
  analyzed: AnalyzedMcpConfiguration;
  storage: StoredObject;
  previous?: AssetRecord;
  rejectInvalid?: boolean;
  versionSource?: "upload" | "project-sync" | "rollback";
  createdByAccountId?: string;
  versionSummary?: string;
  versionCreatedAt?: string;
}): AssetRecord {
  if (input.analyzed.validation.errors > 0 && input.rejectInvalid !== false) {
    const first = input.analyzed.validationIssues.find((candidate) => candidate.severity === "error");
    throw new Error(first?.message ?? "MCP configuration validation failed.");
  }
  if (input.storage.checksumAlgorithm !== MCP_CONFIG_CHECKSUM_ALGORITHM) {
    throw new Error("Stored MCP configuration uses an unsupported checksum algorithm.");
  }
  const assetId = `asset:mcp:${input.workspaceId}:${input.name}`;
  const asset: AssetRecord = {
    id: assetId,
    kind: "mcp",
    name: input.name,
    displayName: input.displayName,
    slug: input.name,
    description: input.description,
    health: input.analyzed.health,
    storage: input.storage,
    validation: input.analyzed.validation,
    validationIssues: input.analyzed.validationIssues.map((candidate) => ({
      ...candidate,
      assetId
    })),
    mcp: input.analyzed.metadata
  };
  return recordAssetVersion({
    asset,
    previous: input.previous,
    source: input.versionSource ?? "upload",
    ...(input.createdByAccountId ? { createdByAccountId: input.createdByAccountId } : {}),
    ...(input.versionSummary ? { summary: input.versionSummary } : {}),
    ...(input.versionCreatedAt ? { createdAt: input.versionCreatedAt } : {})
  });
}

function readTransport(server: Record<string, unknown>): string {
  const type = typeof server.type === "string" ? server.type.trim().toLowerCase() : "";
  if (type === "sse" || type === "http" || type === "streamable-http") return type;
  return "remote";
}

function issue(
  severity: "error" | "warning",
  code: string,
  message: string
): ValidationIssue {
  return { severity, code, message, path: MCP_CONFIG_FILE_NAME };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function looksSensitive(key: string): boolean {
  return /(token|secret|password|api[_-]?key|credential)/i.test(key);
}

function isEnvironmentReference(value: string): boolean {
  return /^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/.test(value.trim()) ||
    /^\$[A-Za-z_][A-Za-z0-9_]*$/.test(value.trim());
}
