import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import packageJson from "../../package.json" with { type: "json" };
import { resolveRemoteContext } from "../cli/remote.js";
import type { ParsedArgs } from "../cli/types.js";
import { HarhubMcpClient, type ForgeAnswer } from "./client.js";
import { AllowedPaths } from "./paths.js";
import { toolError, toolResult } from "./result.js";

export interface CreateHarhubMcpServerOptions {
  client?: HarhubMcpClient;
  apiUrl?: string;
  workspaceId?: string;
  token?: string;
  allowedRoots?: string[];
}

const readOnly: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true
};

const mutation: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true
};

const destructive: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true
};

export function createHarhubMcpServer(
  options: CreateHarhubMcpServerOptions = {}
): McpServer {
  const client = options.client ?? createClient(options);
  const server = new McpServer(
    { name: "harhub", version: packageJson.version },
    {
      instructions: [
        "Operate the configured Harhub workspace on the user's behalf.",
        "Read current state before changing it.",
        "Only call mutation tools when the user has requested that change.",
        "High-impact tools require confirm=true and must never be inferred from unrelated requests.",
        "Never put Harhub access tokens in tool arguments or output."
      ].join(" ")
    }
  );

  registerIdentityTools(server, client);
  registerLibraryTools(server, client);
  registerProjectTools(server, client);
  registerRepositoryTools(server, client);
  registerForgeTools(server, client);
  return server;
}

function createClient(options: CreateHarhubMcpServerOptions): HarhubMcpClient {
  const parsed: ParsedArgs = {
    positionals: [],
    options: compact({
      url: options.apiUrl,
      workspace: options.workspaceId,
      token: options.token
    }) as Record<string, string | boolean | string[]>
  };
  return new HarhubMcpClient(
    resolveRemoteContext(parsed),
    new AllowedPaths(options.allowedRoots)
  );
}

function registerIdentityTools(server: McpServer, client: HarhubMcpClient): void {
  register(server, {
    name: "harhub_whoami",
    title: "Show Harhub identity",
    description: "Return the authenticated Harhub account, configured server, and active workspace.",
    schema: z.object({}),
    annotations: readOnly,
    run: async () => {
      const session = await client.session();
      return {
        apiUrl: client.context.apiUrl,
        account: session.account,
        workspace: session.workspaces.find((item) => item.id === client.context.workspaceId)
      };
    }
  });
}

function registerLibraryTools(server: McpServer, client: HarhubMcpClient): void {
  register(server, {
    name: "harhub_assets_list",
    title: "List Library assets",
    description: "List assets in the active workspace Library, optionally filtered to one asset kind.",
    schema: z.object({
      kind: z.string().min(1).optional().describe("Asset kind, such as skill.")
    }),
    annotations: readOnly,
    run: ({ kind }) => client.json(`/assets${kind ? `?kind=${encodeURIComponent(kind)}` : ""}`)
  });

  register(server, {
    name: "harhub_asset_get",
    title: "Get Library asset",
    description: "Get one workspace Library asset by ID, name, or slug.",
    schema: z.object({ asset: querySchema }),
    annotations: readOnly,
    run: ({ asset }) => client.json(`/assets/${encodeURIComponent(asset)}`)
  });

  register(server, {
    name: "harhub_asset_download",
    title: "Download asset version",
    description: "Download one Library asset version to an allowed local path.",
    schema: z.object({
      asset: querySchema,
      version: positiveInteger.optional(),
      output: z.string().min(1).optional().describe("Destination file or directory."),
      overwrite: z.boolean().default(false)
    }),
    annotations: { ...readOnly, readOnlyHint: false },
    run: (input) => client.downloadAsset(input)
  });

  register(server, {
    name: "harhub_asset_upload_archive",
    title: "Upload Skill archive",
    description: "Upload a local zip containing one or more Skills into the workspace Library.",
    schema: z.object({
      archive: z.string().min(1).describe("Zip path inside an allowed local root."),
      share: z.boolean().default(false).describe("Create public share links after upload.")
    }),
    annotations: mutation,
    run: (input) => client.uploadArchive(input)
  });

  register(server, {
    name: "harhub_skills_upload_paths",
    title: "Upload local Skills",
    description: "Discover, validate, package, and upload every Skill found under the supplied local paths.",
    schema: z.object({
      paths: z.array(z.string().min(1)).min(1),
      share: z.boolean().default(false)
    }),
    annotations: mutation,
    run: (input) => client.uploadSkillPaths(input)
  });

  register(server, {
    name: "harhub_skill_edit_file",
    title: "Edit remote Skill file",
    description: "Replace one file in a remote Skill package, validate it, and upload a new immutable version.",
    schema: z.object({
      asset: querySchema,
      file: z.string().min(1).default("SKILL.md"),
      content: z.string().describe("Complete replacement file content.")
    }),
    annotations: mutation,
    run: (input) => client.editSkillFile(input)
  });

  register(server, {
    name: "harhub_asset_revalidate",
    title: "Revalidate Library assets",
    description: "Revalidate one asset by ID/name/slug, or all workspace assets when asset is omitted.",
    schema: z.object({ asset: querySchema.optional() }),
    annotations: { ...mutation, idempotentHint: true },
    run: ({ asset }) => client.json(
      asset
        ? `/assets/${encodeURIComponent(asset)}/validate`
        : "/assets/validate",
      { method: "POST", body: {} }
    )
  });

  register(server, {
    name: "harhub_asset_delete",
    title: "Delete Library asset",
    description: "Delete one workspace Library asset. Requires explicit confirmation.",
    schema: z.object({ asset: querySchema, confirm: confirmSchema }),
    annotations: destructive,
    run: async ({ asset }) => {
      await client.json(`/assets/${encodeURIComponent(asset)}`, { method: "DELETE" });
      return { deleted: asset };
    }
  });

  register(server, {
    name: "harhub_asset_share",
    title: "Share Library asset",
    description: "Create or return the public share link for a workspace Library asset.",
    schema: z.object({ asset: querySchema }),
    annotations: mutation,
    run: ({ asset }) => client.shareAsset(asset)
  });

  register(server, {
    name: "harhub_asset_unshare",
    title: "Revoke asset share",
    description: "Revoke a Library asset's public share link. Requires explicit confirmation.",
    schema: z.object({ asset: querySchema, confirm: confirmSchema }),
    annotations: destructive,
    run: ({ asset }) => client.unshareAsset(asset)
  });

  register(server, {
    name: "harhub_public_skill_install",
    title: "Install shared Skill",
    description: "Install a Skill from a Harhub public share URL or token with the Skills CLI. Requires explicit confirmation.",
    schema: z.object({
      reference: z.string().min(1),
      agents: z.array(z.string().min(1)).optional(),
      global: z.boolean().default(false),
      copy: z.boolean().default(false),
      confirm: confirmSchema
    }),
    annotations: destructive,
    run: ({ confirm: _confirm, ...input }) => client.installPublicSkill(input)
  });
}

function registerProjectTools(server: McpServer, client: HarhubMcpClient): void {
  register(server, {
    name: "harhub_projects_list",
    title: "List Projects",
    description: "List Projects tracked by the active Harhub workspace.",
    schema: z.object({}),
    annotations: readOnly,
    run: () => client.json("/projects")
  });

  register(server, {
    name: "harhub_project_get",
    title: "Get Project",
    description: "Get one Harhub Project and its tracked bindings.",
    schema: projectIdSchema,
    annotations: readOnly,
    run: ({ projectId }) => client.json(projectPath(projectId))
  });

  register(server, {
    name: "harhub_project_create",
    title: "Create Project",
    description: "Create a tracked Harhub Project. A repository can be connected later.",
    schema: z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      repository: z.string().min(1).optional().describe("Legacy owner/repository connection."),
      defaultBranch: z.string().min(1).optional()
    }),
    annotations: mutation,
    run: (input) => client.json("/projects", { method: "POST", body: compact(input) })
  });

  register(server, {
    name: "harhub_project_connect_repository",
    title: "Connect Project repository",
    description: "Connect an owner/repository reference to a Project without a GitHub App installation.",
    schema: z.object({
      projectId: idSchema,
      repository: z.string().min(1),
      defaultBranch: z.string().min(1).optional()
    }),
    annotations: mutation,
    run: ({ projectId, repository, defaultBranch }) => client.json(
      `${projectPath(projectId)}/repository`,
      { method: "PUT", body: compact({ repository, defaultBranch }) }
    )
  });

  register(server, {
    name: "harhub_project_archive",
    title: "Archive Project",
    description: "Archive a tracked Project without deleting its repository. Requires explicit confirmation.",
    schema: projectIdSchema.extend({ confirm: confirmSchema }),
    annotations: destructive,
    run: async ({ projectId }) => {
      await client.json(`${projectPath(projectId)}/archive`, { method: "POST" });
      return { archived: projectId };
    }
  });

  register(server, {
    name: "harhub_project_delete",
    title: "Delete Project",
    description: "Permanently delete a Harhub Project index and its tracking history without deleting the GitHub repository or Library assets. Requires explicit confirmation.",
    schema: projectIdSchema.extend({ confirm: confirmSchema }),
    annotations: destructive,
    run: async ({ projectId }) => {
      await client.json(projectPath(projectId), {
        method: "DELETE",
        body: { confirm: true }
      });
      return { deleted: projectId };
    }
  });

  register(server, {
    name: "harhub_project_rotate_sync_token",
    title: "Rotate Project sync token",
    description: "Invalidate the current Project sync token and return a replacement. Requires explicit confirmation.",
    schema: projectIdSchema.extend({ confirm: confirmSchema }),
    annotations: destructive,
    run: ({ projectId }) => client.json(
      `${projectPath(projectId)}/rotate-sync-token`,
      { method: "POST" }
    )
  });

  register(server, {
    name: "harhub_project_inventory",
    title: "Get repository inventory",
    description: "Read the repository artifact inventory and current ownership/binding status for a Project.",
    schema: projectIdSchema,
    annotations: readOnly,
    run: ({ projectId }) => client.json(`${projectPath(projectId)}/inventory`)
  });

  register(server, {
    name: "harhub_project_scan",
    title: "Scan Project repository",
    description: "Start a fresh repository scan for a tracked Project.",
    schema: projectIdSchema,
    annotations: mutation,
    run: ({ projectId }) => client.json(`${projectPath(projectId)}/scans`, { method: "POST" })
  });

  register(server, {
    name: "harhub_project_binding_diff",
    title: "Review Skill fork diff",
    description: "Compare a Project Skill fork with its linked workspace Library asset.",
    schema: z.object({
      projectId: idSchema,
      bindingId: idSchema,
      path: z.string().min(1).optional().describe("Optional changed file path.")
    }),
    annotations: readOnly,
    run: ({ projectId, bindingId, path }) => client.json(
      `${projectPath(projectId)}/bindings/${encodeURIComponent(bindingId)}/diff${path ? `?path=${encodeURIComponent(path)}` : ""}`
    )
  });

  register(server, {
    name: "harhub_project_publish_binding",
    title: "Publish Skill fork",
    description: "Publish a reviewed repository Skill fork as a new Library version. Requires explicit confirmation.",
    schema: z.object({
      projectId: idSchema,
      bindingId: idSchema,
      confirm: confirmSchema
    }),
    annotations: destructive,
    run: ({ projectId, bindingId }) => client.json(
      `${projectPath(projectId)}/bindings/${encodeURIComponent(bindingId)}/publish`,
      { method: "POST" }
    )
  });

  register(server, {
    name: "harhub_project_create_proposal",
    title: "Create repository proposal",
    description: "Stage a Project repository change proposal without opening a pull request.",
    schema: proposalSchema,
    annotations: mutation,
    run: ({ projectId, ...input }) => client.json(
      `${projectPath(projectId)}/proposals`,
      { method: "POST", body: proposalBody(input) }
    )
  });

  register(server, {
    name: "harhub_project_open_proposal",
    title: "Open proposal pull request",
    description: "Open a GitHub pull request for a staged Project proposal. Requires explicit confirmation.",
    schema: z.object({
      projectId: idSchema,
      proposalId: idSchema,
      confirm: confirmSchema
    }),
    annotations: destructive,
    run: ({ projectId, proposalId }) => client.json(
      `${projectPath(projectId)}/proposals/${encodeURIComponent(proposalId)}/open`,
      { method: "POST" }
    )
  });
}

function registerRepositoryTools(server: McpServer, client: HarhubMcpClient): void {
  register(server, {
    name: "harhub_github_status",
    title: "Get GitHub integration status",
    description: "Return whether the Harhub GitHub App integration is configured.",
    schema: z.object({}),
    annotations: readOnly,
    run: () => client.json("/github/status")
  });

  register(server, {
    name: "harhub_github_authorization_url",
    title: "Create GitHub authorization URL",
    description: "Create a URL where the user can install or authorize the Harhub GitHub App.",
    schema: z.object({
      redirectPath: z.string().min(1).default("/projects")
    }),
    annotations: mutation,
    run: ({ redirectPath }) => client.json(
      "/github/installations/authorize",
      { method: "POST", body: { redirectPath } }
    )
  });

  register(server, {
    name: "harhub_github_installations_list",
    title: "List GitHub installations",
    description: "List GitHub App installations connected to the active Harhub workspace.",
    schema: z.object({}),
    annotations: readOnly,
    run: () => client.json("/github/installations")
  });

  register(server, {
    name: "harhub_github_repositories_list",
    title: "List GitHub repositories",
    description: "List repositories accessible through one connected GitHub App installation.",
    schema: z.object({ installationId: idSchema }),
    annotations: readOnly,
    run: ({ installationId }) => client.json(
      `/github/installations/${encodeURIComponent(installationId)}/repositories`
    )
  });

  register(server, {
    name: "harhub_github_repository_import",
    title: "Import GitHub repository",
    description: "Import an accessible GitHub repository into Harhub as a new Project.",
    schema: z.object({
      installationId: idSchema,
      repositoryId: idSchema
    }),
    annotations: mutation,
    run: (body) => client.json("/github/repositories/import", { method: "POST", body })
  });

  register(server, {
    name: "harhub_github_repository_connect",
    title: "Connect GitHub repository",
    description: "Connect a GitHub App repository to an existing Harhub Project.",
    schema: z.object({
      projectId: idSchema,
      installationId: idSchema,
      repositoryId: idSchema
    }),
    annotations: mutation,
    run: ({ projectId, installationId, repositoryId }) => client.json(
      `${projectPath(projectId)}/github/connect`,
      { method: "POST", body: { installationId, repositoryId } }
    )
  });

  register(server, {
    name: "harhub_repository_policy_set",
    title: "Set artifact ownership policy",
    description: "Set whether one repository artifact is Library-managed, repository-managed, or ignored.",
    schema: z.object({
      projectId: idSchema,
      artifactPath: z.string().min(1),
      ownership: z.enum(["library", "repository", "ignored"]),
      libraryAssetId: idSchema.optional(),
      pinnedVersion: positiveInteger.optional()
    }).superRefine((input, context) => {
      if (input.ownership === "library" && !input.libraryAssetId) {
        context.addIssue({
          code: "custom",
          path: ["libraryAssetId"],
          message: "Library ownership requires libraryAssetId."
        });
      }
    }),
    annotations: mutation,
    run: ({ projectId, ...body }) => client.json(
      `${projectPath(projectId)}/inventory/policies`,
      { method: "PUT", body: compact(body) }
    )
  });
}

function registerForgeTools(server: McpServer, client: HarhubMcpClient): void {
  register(server, {
    name: "harhub_forge_sessions_list",
    title: "List Forge sessions",
    description: "List persisted Forge discovery and framework-generation sessions.",
    schema: z.object({}),
    annotations: readOnly,
    run: () => client.json("/forge/sessions")
  });

  register(server, {
    name: "harhub_forge_session_get",
    title: "Get Forge session",
    description: "Get the complete persisted state of one Forge session.",
    schema: sessionIdSchema,
    annotations: readOnly,
    run: ({ sessionId }) => client.json(forgeSessionPath(sessionId))
  });

  register(server, {
    name: "harhub_forge_session_create",
    title: "Create Forge session",
    description: "Start a Forge discovery session from a project requirement.",
    schema: z.object({ requirement: z.string().min(1) }),
    annotations: mutation,
    run: ({ requirement }) => client.json(
      "/forge/sessions",
      { method: "POST", body: { requirement } }
    )
  });

  const operationSchema = sessionIdSchema.extend({
    answers: z.array(forgeAnswerSchema).default([])
  });

  register(server, {
    name: "harhub_forge_follow_up",
    title: "Continue Forge discovery",
    description: "Submit optional answers and stream the next adaptive Forge discovery step to completion.",
    schema: operationSchema,
    annotations: mutation,
    run: ({ sessionId, answers }) => client.streamForgeOperation(
      sessionId,
      "follow-up",
      answers as ForgeAnswer[]
    )
  });

  register(server, {
    name: "harhub_forge_generate",
    title: "Generate Forge framework",
    description: "Submit optional final answers and stream multi-step harness framework generation to completion.",
    schema: operationSchema,
    annotations: mutation,
    run: ({ sessionId, answers }) => client.streamForgeOperation(
      sessionId,
      "generate",
      answers as ForgeAnswer[]
    )
  });

  register(server, {
    name: "harhub_forge_archive_download",
    title: "Download Forge framework",
    description: "Download a completed Forge session as a zip archive to an allowed local path.",
    schema: sessionIdSchema.extend({
      output: z.string().min(1).optional(),
      overwrite: z.boolean().default(false)
    }),
    annotations: { ...readOnly, readOnlyHint: false },
    run: (input) => client.downloadForgeArchive(input)
  });

  register(server, {
    name: "harhub_forge_session_freeze",
    title: "Freeze Forge session as Project",
    description: "Freeze a generated Forge framework into a persistent Harhub Project.",
    schema: sessionIdSchema.extend({
      name: z.string().min(1),
      description: z.string().optional()
    }),
    annotations: mutation,
    run: ({ sessionId, name, description }) => client.json(
      `${forgeSessionPath(sessionId)}/freeze`,
      { method: "POST", body: compact({ name, description }) }
    )
  });

  register(server, {
    name: "harhub_forge_session_delete",
    title: "Delete Forge session",
    description: "Stop all work and delete a Forge session without deleting its frozen Project. Requires explicit confirmation.",
    schema: sessionIdSchema.extend({ confirm: confirmSchema }),
    annotations: destructive,
    run: async ({ sessionId }) => {
      await client.json(forgeSessionPath(sessionId), { method: "DELETE" });
      return { deleted: sessionId };
    }
  });
}

interface ToolSpec<T> {
  name: string;
  title: string;
  description: string;
  schema: z.ZodType<T>;
  annotations: ToolAnnotations;
  run: (input: T) => unknown | Promise<unknown>;
}

function register<T>(
  server: McpServer,
  spec: ToolSpec<T>
): void {
  server.registerTool(
    spec.name,
    {
      title: spec.title,
      description: spec.description,
      inputSchema: spec.schema,
      annotations: spec.annotations
    },
    async (input) => {
      try {
        return toolResult(await spec.run(input as T));
      } catch (error) {
        return toolError(error);
      }
    }
  );
}

const idSchema = z.string().min(1);
const querySchema = z.string().min(1).describe("Asset ID, name, or slug.");
const positiveInteger = z.number().int().positive();
const confirmSchema = z.literal(true).describe("Explicit confirmation for this high-impact action.");
const projectIdSchema = z.object({ projectId: idSchema });
const sessionIdSchema = z.object({ sessionId: idSchema });
const forgeAnswerSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
  lens: z.string().optional(),
  gap: z.string().optional(),
  intent: z.string().optional()
});
const proposalSchema = z.discriminatedUnion("kind", [
  z.object({
    projectId: idSchema,
    kind: z.literal("bootstrap")
  }),
  z.object({
    projectId: idSchema,
    kind: z.literal("add-library-skills"),
    assetIds: z.array(idSchema).min(1)
  }),
  z.object({
    projectId: idSchema,
    kind: z.literal("remove-skill"),
    bindingId: idSchema
  })
]);

type ProposalBodyInput =
  | { kind: "bootstrap" }
  | { kind: "add-library-skills"; assetIds: string[] }
  | { kind: "remove-skill"; bindingId: string };

function proposalBody(input: ProposalBodyInput): Record<string, unknown> {
  if (input.kind === "bootstrap") return { kind: input.kind };
  if (input.kind === "add-library-skills") {
    return { kind: input.kind, assetIds: input.assetIds };
  }
  return { kind: input.kind, bindingId: input.bindingId };
}

function projectPath(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}`;
}

function forgeSessionPath(sessionId: string): string {
  return `/forge/sessions/${encodeURIComponent(sessionId)}`;
}

function compact(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  );
}
