import { createHash } from "node:crypto";

import { REPOSITORY_SKILL_EXCLUDED_DIRECTORIES } from "../repository-inventory/index.js";
import type {
  HarnessTemplateAssetSelection,
  HarnessTemplateFile,
  ProjectBinding,
  ProjectRepository
} from "../../shared/types.js";

export const HARHUB_PROJECT_CONFIG_PATH = ".harhub/project.json";
export const HARHUB_PROJECT_COLLECTOR_PATH = ".harhub/scripts/collect-bindings.mjs";
export const HARHUB_PROJECT_WORKFLOW_PATH = ".github/workflows/harhub-sync.yml";

interface ProjectFrameworkConnection {
  projectId: string;
  syncUrl: string;
  repository?: ProjectRepository;
  bindings: ProjectBinding[];
}

export function addProjectIntegrationFiles(
  files: HarnessTemplateFile[],
  selectedAssets: HarnessTemplateAssetSelection[],
  connection?: ProjectFrameworkConnection
): HarnessTemplateFile[] {
  const retained = files.filter((item) => ![
    HARHUB_PROJECT_CONFIG_PATH,
    HARHUB_PROJECT_COLLECTOR_PATH,
    HARHUB_PROJECT_WORKFLOW_PATH
  ].includes(item.path));
  const bindings = connection
    ? connection.bindings.map((binding) => ({
        kind: binding.kind,
        name: binding.name,
        path: binding.path,
        source: binding.source,
        ...(binding.assetId ? { assetId: binding.assetId } : {}),
        ...(binding.sourceDigest ? { sourceDigest: binding.sourceDigest } : {})
      }))
    : initialFrameworkBindings(retained, selectedAssets);

  return [
    ...retained,
    generatedFile(HARHUB_PROJECT_CONFIG_PATH, JSON.stringify({
      schemaVersion: 1,
      projectId: connection?.projectId ?? null,
      syncUrl: connection?.syncUrl ?? null,
      repository: connection?.repository
        ? `${connection.repository.owner}/${connection.repository.name}`
        : null,
      bindings
    }, null, 2)),
    generatedFile(HARHUB_PROJECT_COLLECTOR_PATH, projectBindingCollector()),
    generatedFile(HARHUB_PROJECT_WORKFLOW_PATH, projectSyncWorkflow())
  ];
}

export function frameworkContentDigest(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function initialFrameworkBindings(
  files: HarnessTemplateFile[],
  selectedAssets: HarnessTemplateAssetSelection[]
) {
  const rule = files.find((item) => item.path === ".harness/rules/engineering.md");
  return [
    ...selectedAssets.map((asset) => ({
      kind: "skill" as const,
      name: asset.displayName,
      path: asset.installPath,
      source: "harhub" as const,
      assetId: asset.id
    })),
    ...(rule
      ? [{
          kind: "rule" as const,
          name: "Engineering rules",
          path: rule.path,
          source: "framework" as const,
          sourceDigest: frameworkContentDigest(rule.content)
        }]
      : [])
  ];
}

function projectSyncWorkflow(): string {
  return `name: Harhub project sync

on:
  push:
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: harhub-sync-\${{ github.repository }}
  cancel-in-progress: true

jobs:
  sync:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Check out repository
        uses: actions/checkout@v6
        with:
          persist-credentials: false

      - name: Collect harness bindings
        env:
          HARHUB_REPOSITORY: \${{ github.repository }}
          HARHUB_COMMIT_SHA: \${{ github.sha }}
          HARHUB_REF: \${{ github.ref_name }}
          HARHUB_RUN_ID: \${{ github.run_id }}
          HARHUB_SKILL_FILES: \${{ runner.temp }}/harhub-skill-files.txt
        run: node .harhub/scripts/collect-bindings.mjs > "\$RUNNER_TEMP/harhub-sync.json"

      - name: Sync Project with Harhub
        env:
          HARHUB_PROJECT_TOKEN: \${{ secrets.HARHUB_PROJECT_TOKEN }}
        shell: bash
        run: |
          if [ -z "\$HARHUB_PROJECT_TOKEN" ]; then
            echo "::error::Configure the HARHUB_PROJECT_TOKEN repository secret."
            exit 1
          fi
          HARHUB_SYNC_URL="\$(node -p 'JSON.parse(require("fs").readFileSync(".harhub/project.json", "utf8")).syncUrl || ""')"
          if [ -z "\$HARHUB_SYNC_URL" ]; then
            echo "::error::Freeze this Forge session as a Harhub Project before syncing."
            exit 1
          fi
          SKILL_ARCHIVE_ARGS=()
          if [ -s "\$RUNNER_TEMP/harhub-skill-files.txt" ]; then
            zip -q "\$RUNNER_TEMP/harhub-skills.zip" -@ < "\$RUNNER_TEMP/harhub-skill-files.txt"
            SKILL_ARCHIVE_ARGS=(-F "skills=@\$RUNNER_TEMP/harhub-skills.zip;type=application/zip")
          fi
          curl --fail-with-body --silent --show-error \\
            --retry 3 --retry-delay 2 --retry-all-errors --connect-timeout 10 --max-time 120 \\
            -H "Authorization: Bearer \$HARHUB_PROJECT_TOKEN" \\
            -F "manifest=<\$RUNNER_TEMP/harhub-sync.json;type=application/json" \\
            "\${SKILL_ARCHIVE_ARGS[@]}" \\
            "\$HARHUB_SYNC_URL"
`;
}

function projectBindingCollector(): string {
  return `import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const configPath = path.join(root, '.harhub/project.json');
const excludedDirectories = new Set(${JSON.stringify(REPOSITORY_SKILL_EXCLUDED_DIRECTORIES)});
const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
if (!config.projectId || !config.syncUrl) {
  throw new Error('Freeze this Forge session as a Harhub Project before syncing.');
}

const configured = new Map(
  (config.bindings ?? []).map((binding) => [binding.kind + '\\0' + binding.path, binding])
);
const files = await walk(root);
const bindings = [];
const skillArchiveFiles = new Set();
const skillFilesFound = files.filter((file) => path.posix.basename(file) === 'SKILL.md');
const skillRoots = skillFilesFound.map((file) => path.posix.dirname(file));

for (const skillFile of skillFilesFound) {
  const skillRoot = path.posix.dirname(skillFile);
  const skillFiles = files.filter((file) =>
    isPathWithinRoot(file, skillRoot) &&
    !skillRoots.some((otherRoot) =>
      otherRoot !== skillRoot &&
      isPathWithinRoot(otherRoot, skillRoot) &&
      isPathWithinRoot(file, otherRoot)
    )
  );
  for (const file of skillFiles) skillArchiveFiles.add(file);
  const known = configured.get('skill\\0' + skillRoot);
  bindings.push({
    kind: 'skill',
    name: await skillName(skillFile, known?.name ?? path.posix.basename(skillRoot)),
    path: skillRoot,
    digest: await directoryDigest(skillRoot, skillFiles),
    digestAlgorithm: 'skill-files-v2'
  });
}

for (const file of files.filter((item) =>
  item.startsWith('.harness/mcp/') &&
  !skillRoots.some((skillRoot) => isPathWithinRoot(item, skillRoot))
)) {
  bindings.push(await fileBinding('mcp', file));
}
for (const file of files.filter((item) =>
  item.startsWith('.harness/rules/') &&
  !skillRoots.some((skillRoot) => isPathWithinRoot(item, skillRoot))
)) {
  bindings.push(await fileBinding('rule', file));
}

bindings.sort((left, right) => (left.kind + left.path).localeCompare(right.kind + right.path));
if (process.env.HARHUB_SKILL_FILES) {
  const skillFileList = Array.from(skillArchiveFiles).sort(comparePaths);
  await fs.writeFile(
    process.env.HARHUB_SKILL_FILES,
    skillFileList.length > 0 ? skillFileList.join('\\n') + '\\n' : ''
  );
}
process.stdout.write(JSON.stringify({
  schemaVersion: 1,
  repository: process.env.HARHUB_REPOSITORY ?? '',
  commitSha: process.env.HARHUB_COMMIT_SHA ?? '',
  ref: process.env.HARHUB_REF ?? '',
  ...(process.env.HARHUB_RUN_ID ? { runId: process.env.HARHUB_RUN_ID } : {}),
  bindings
}));

async function fileBinding(kind, file) {
  const known = configured.get(kind + '\\0' + file);
  const content = await fs.readFile(path.join(root, file));
  return {
    kind,
    name: known?.name ?? path.posix.basename(file),
    path: file,
    digest: sha256(content)
  };
}

function isPathWithinRoot(filePath, rootPath) {
  return rootPath === '.' || filePath.startsWith(rootPath + '/');
}

async function directoryDigest(skillRoot, skillFiles) {
  const manifest = [];
  for (const file of skillFiles.sort((left, right) => comparePaths(
    path.posix.relative(skillRoot, left),
    path.posix.relative(skillRoot, right)
  ))) {
    const relative = path.posix.relative(skillRoot, file);
    const content = await fs.readFile(path.join(root, file));
    manifest.push(Buffer.byteLength(relative) + ':' + relative + ':' + content.byteLength + ':' + sha256(content));
  }
  return sha256(manifest.join('\\n'));
}

function comparePaths(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

async function skillName(skillFile, fallback) {
  const content = await fs.readFile(path.join(root, skillFile), 'utf8');
  const frontmatter = content.match(/^---\\s*\\n([\\s\\S]*?)\\n---/);
  const name = frontmatter?.[1].match(/^name:\\s*["']?([^"'\\n]+)["']?\\s*$/m)?.[1]?.trim();
  return name || fallback;
}

async function walk(directory) {
  const result = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) result.push(...await walk(absolute));
    else if (entry.isFile()) result.push(path.relative(root, absolute).split(path.sep).join('/'));
  }
  return result;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
`;
}

function generatedFile(path: string, content: string): HarnessTemplateFile {
  return { path, content: content.trimEnd() + "\n" };
}
