import { randomUUID } from "node:crypto";

import type {
  AssetRecord,
  GitHubInstallation,
  HarhubProject,
  ProjectBinding,
  ProjectBindingPolicy,
  ProjectChangeProposal,
  ProjectInventorySnapshot
} from "../../shared/types.js";
import type { SkillPackageFile } from "../../features/skills/index.js";
import type { ProjectRepositoryConnectionRecord } from "../../state/types.js";
import { createRepositoryPullRequest } from "./github-app.js";

export function createBootstrapProposal(input: {
  project: HarhubProject;
  connection: ProjectRepositoryConnectionRecord;
  installation: GitHubInstallation;
  snapshot: ProjectInventorySnapshot;
  policies: ProjectBindingPolicy[];
  accountId: string;
}): ProjectChangeProposal {
  assertManagedChangesAvailable(input.connection, input.installation);
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    workspaceId: input.project.workspaceId,
    projectId: input.project.id,
    kind: "bootstrap",
    status: "preview",
    baseSha: input.snapshot.commitSha,
    branch: `harhub/bootstrap-${input.project.id.slice(0, 8)}-${Date.now().toString(36)}`,
    files: [{
      path: ".harhub/project.json",
      status: "added",
      content: `${JSON.stringify({
        schemaVersion: 1,
        projectId: input.project.id,
        integration: { mode: "github-app" },
        repository: {
          id: input.connection.repositoryId,
          fullName: `${input.connection.owner}/${input.connection.name}`,
          defaultBranch: input.connection.defaultBranch
        },
        inventory: {
          detectorVersion: input.snapshot.detectorVersion,
          roots: inventoryRoots(input.snapshot),
          ignores: input.policies
            .filter((policy) => policy.ownership === "ignored")
            .map((policy) => policy.artifactPath)
            .sort()
        },
        bindings: input.snapshot.artifacts
          .filter((artifact) => artifact.relationship !== "ignored")
          .map((artifact) => ({
            kind: artifact.kind,
            path: artifact.path,
            ownership: artifact.relationship.startsWith("library-") ? "library" : "repository",
            ...(artifact.libraryAssetId ? { libraryAssetId: artifact.libraryAssetId } : {}),
            ...(artifact.libraryVersion ? { libraryVersion: artifact.libraryVersion } : {})
          }))
      }, null, 2)}\n`
    }],
    createdByAccountId: input.accountId,
    createdAt: now,
    updatedAt: now
  };
}

export function createAddLibrarySkillsProposal(input: {
  project: HarhubProject;
  connection: ProjectRepositoryConnectionRecord;
  installation: GitHubInstallation;
  snapshot: ProjectInventorySnapshot;
  skills: Array<{ asset: AssetRecord; files: SkillPackageFile[] }>;
  accountId: string;
}): ProjectChangeProposal {
  assertManagedChangesAvailable(input.connection, input.installation);
  if (input.skills.length === 0 || input.skills.length > 20) {
    throw new Error("Select between 1 and 20 Library Skills per pull request.");
  }
  const targetRoot = preferredSkillRoot(input.snapshot);
  const occupiedPaths = new Set([
    ...input.snapshot.artifacts.map((artifact) => artifact.path.toLowerCase()),
    ...input.project.bindings.map((binding) => binding.path.toLowerCase())
  ]);
  const selectedSlugs = new Set<string>();
  const files = input.skills.flatMap(({ asset, files: skillFiles }) => {
    if (asset.kind !== "skill" || asset.health === "error" || !asset.storage) {
      throw new Error(`Library Skill ${asset.displayName} is not available for Project adoption.`);
    }
    const slug = safePathSegment(asset.slug);
    if (selectedSlugs.has(slug.toLowerCase())) {
      throw new Error(`Library Skill path ${slug} is selected more than once.`);
    }
    selectedSlugs.add(slug.toLowerCase());
    const skillRoot = `${targetRoot}/${slug}`;
    if (occupiedPaths.has(skillRoot.toLowerCase())) {
      throw new Error(`Project already contains a Skill at ${skillRoot}.`);
    }
    return skillFiles.map((file) => proposalFile(`${skillRoot}/${safeRelativePath(file.path)}`, file.content));
  }).sort((left, right) => left.path.localeCompare(right.path));
  const packageBytes = input.skills.reduce(
    (total, skill) => total + skill.files.reduce((skillTotal, file) => skillTotal + file.content.byteLength, 0),
    0
  );
  if (files.length > 100 || packageBytes > 5 * 1024 * 1024 ||
      input.skills.some((skill) => skill.files.some((file) => file.content.byteLength > 1024 * 1024))) {
    throw new Error("Selected Library Skills exceed the 100 file or 5 MB pull request limit.");
  }
  if (new Set(files.map((file) => file.path.toLowerCase())).size !== files.length) {
    throw new Error("Selected Library Skills contain colliding repository file paths.");
  }
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    workspaceId: input.project.workspaceId,
    projectId: input.project.id,
    kind: "add-library-skills",
    status: "preview",
    baseSha: input.snapshot.commitSha,
    branch: proposalBranch("skills-add", input.project.id),
    files,
    createdByAccountId: input.accountId,
    createdAt: now,
    updatedAt: now
  };
}

export function createRemoveSkillProposal(input: {
  project: HarhubProject;
  connection: ProjectRepositoryConnectionRecord;
  installation: GitHubInstallation;
  snapshot: ProjectInventorySnapshot;
  binding: ProjectBinding;
  filePaths: string[];
  accountId: string;
}): ProjectChangeProposal {
  assertManagedChangesAvailable(input.connection, input.installation);
  if (input.binding.kind !== "skill" || input.binding.status === "missing") {
    throw new Error("Only an observed Project Skill can be removed.");
  }
  if (input.binding.path === ".") {
    throw new Error("A repository-root Skill cannot be removed through Harhub.");
  }
  const root = safeRelativePath(input.binding.path);
  const filePaths = Array.from(new Set(input.filePaths.map(safeRelativePath))).sort();
  if (filePaths.length === 0) throw new Error("Project Skill files are unavailable in the latest inventory.");
  if (filePaths.length > 100) throw new Error("Project Skill exceeds the 100 file pull request limit.");
  if (filePaths.some((path) => !path.startsWith(`${root}/`))) {
    throw new Error("Project Skill inventory contains a file outside its Skill root.");
  }
  const artifact = input.snapshot.artifacts.find((candidate) =>
    candidate.kind === "skill" &&
    (candidate.bindingId === input.binding.id || candidate.path === input.binding.path)
  );
  if (!artifact) throw new Error("Project Skill is not present in the latest repository inventory.");
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    workspaceId: input.project.workspaceId,
    projectId: input.project.id,
    kind: "remove-skill",
    status: "preview",
    baseSha: input.snapshot.commitSha,
    branch: proposalBranch("skill-remove", input.project.id),
    files: filePaths.map((path) => ({ path, status: "deleted" as const })),
    createdByAccountId: input.accountId,
    createdAt: now,
    updatedAt: now
  };
}

export async function openProjectChangeProposal(input: {
  proposal: ProjectChangeProposal;
  connection: ProjectRepositoryConnectionRecord;
  installation: GitHubInstallation;
}): Promise<ProjectChangeProposal> {
  assertManagedChangesAvailable(input.connection, input.installation);
  if (input.proposal.status !== "preview" && input.proposal.status !== "failed") {
    throw new Error("Only a preview or failed proposal can be opened.");
  }
  const branch = input.proposal.status === "failed"
    ? `${input.proposal.branch.replace(/-retry-[a-z0-9]+$/, "")}-retry-${Date.now().toString(36)}`
    : input.proposal.branch;
  const pull = await createRepositoryPullRequest({
    installationId: input.connection.installationId!,
    owner: input.connection.owner,
    name: input.connection.name,
    defaultBranch: input.connection.defaultBranch,
    baseSha: input.proposal.baseSha,
    branch,
    ...proposalPullRequestCopy(input.proposal),
    files: input.proposal.files
  });
  return {
    ...input.proposal,
    branch,
    status: "open",
    pullNumber: pull.number,
    pullUrl: pull.url,
    updatedAt: new Date().toISOString()
  };
}

function proposalPullRequestCopy(proposal: ProjectChangeProposal): { title: string; body: string } {
  if (proposal.kind === "add-library-skills") {
    return {
      title: "Add Library Skills to this Harhub Project",
      body: [
        "This PR copies the selected workspace Library Skill packages into the repository.",
        "",
        "The Skill contents are pinned to the Library versions reviewed when this proposal was created. Harhub will rescan the default branch after merge."
      ].join("\n")
    };
  }
  if (proposal.kind === "remove-skill") {
    return {
      title: "Remove a Skill from this Harhub Project",
      body: [
        "This PR removes the selected Project Skill package from the repository.",
        "",
        "The workspace Library asset is not deleted. Harhub will rescan the default branch after merge."
      ].join("\n")
    };
  }
  return {
    title: "Configure Harhub repository tracking",
    body: [
      "This PR adds the explicit Harhub Project manifest for this repository.",
      "",
      "Harhub already observes the repository through the installed GitHub App; no repository secret or workflow is required."
    ].join("\n")
  };
}

function assertManagedChangesAvailable(
  connection: ProjectRepositoryConnectionRecord,
  installation: GitHubInstallation
): void {
  if (
    connection.mode !== "github-app" || !connection.installationId ||
    connection.permissionMode !== "write" ||
    installation.permissions.contents !== "write" ||
    installation.permissions.pull_requests !== "write"
  ) {
    throw new Error(
      "Managed changes require GitHub App Contents: write and Pull requests: write permissions."
    );
  }
}

function inventoryRoots(snapshot: ProjectInventorySnapshot): string[] {
  return Array.from(new Set(snapshot.artifacts.map((artifact) => {
    const segments = artifact.path.split("/");
    return segments.length > 1 ? segments.slice(0, artifact.kind === "skill" ? -1 : 1).join("/") : artifact.path;
  }))).sort();
}

function preferredSkillRoot(snapshot: ProjectInventorySnapshot): string {
  const counts = new Map<string, number>();
  for (const artifact of snapshot.artifacts.filter((candidate) => candidate.kind === "skill")) {
    const segments = artifact.path.split("/");
    if (segments.length < 2) continue;
    const root = segments.slice(0, -1).join("/");
    if (!root.endsWith("/skills") && root !== "skills") continue;
    counts.set(root, (counts.get(root) ?? 0) + 1);
  }
  return Array.from(counts.entries()).sort((left, right) =>
    right[1] - left[1] || left[0].localeCompare(right[0])
  )[0]?.[0] ?? ".harness/skills";
}

function proposalFile(path: string, content: Buffer): ProjectChangeProposal["files"][number] {
  const text = content.toString("utf8");
  const isText = !text.includes("\u0000") && Buffer.from(text, "utf8").equals(content);
  return {
    path: safeRelativePath(path),
    status: "added",
    content: isText ? text : content.toString("base64"),
    encoding: isText ? "utf-8" : "base64"
  };
}

function safePathSegment(value: string): string {
  const segment = value.trim();
  if (!segment || segment === "." || segment === ".." || segment.includes("/") || segment.includes("\\")) {
    throw new Error("Library Skill has an unsafe repository path.");
  }
  return segment;
}

function safeRelativePath(value: string): string {
  const path = value.replace(/\\/g, "/").replace(/^\.\//, "");
  if (!path || path.startsWith("/") || path.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`Unsafe repository path: ${value}`);
  }
  return path;
}

function proposalBranch(operation: string, projectId: string): string {
  return `harhub/${operation}-${projectId.slice(0, 8)}-${randomUUID().slice(0, 8)}`;
}
