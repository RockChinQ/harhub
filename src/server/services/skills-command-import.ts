import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import https from "node:https";
import { BlockList, isIP } from "node:net";
import JSZip from "jszip";

import {
  discoverSkillsInArchive,
  type DiscoveredSkill
} from "../../features/skills/index.js";
import type { AssetProvenanceSkill } from "../../shared/types.js";

const IMPORT_TIMEOUT_MS = 120_000;
const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const MAX_COMMAND_CHARS = 8_192;
const MAX_SOURCE_CHARS = 2_048;
const MAX_SKILL_SELECTIONS = 100;
const LOCAL_SOURCE_PATTERN = /^(?:\.{0,2}(?:\/|$)|~(?:\/|$)|\/|[A-Za-z]:[\\/]|file:)/;
const DISCOVERY_SCHEMA_V2 = "https://schemas.agentskills.io/discovery/0.2.0/schema.json";
const IPV4_NON_PUBLIC = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.88.99.0", 24], ["192.168.0.0", 16], ["192.31.196.0", 24], ["192.52.193.0", 24],
  ["192.175.48.0", 24], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4]
] as const) IPV4_NON_PUBLIC.addSubnet(network, prefix, "ipv4");

const IPV6_GLOBAL = new BlockList();
IPV6_GLOBAL.addSubnet("2000::", 3, "ipv6");
const IPV6_NON_PUBLIC = new BlockList();
for (const [network, prefix] of [
  ["2001::", 23], ["2001:db8::", 32], ["2001:10::", 28], ["2001:20::", 28],
  ["2001:2::", 48], ["2001:3::", 32], ["2001:4:112::", 48], ["2001:5::", 32],
  ["2620:4f:8000::", 48], ["3fff::", 20]
] as const) IPV6_NON_PUBLIC.addSubnet(network, prefix, "ipv6");


const PINNED_SKILLS_PACKAGE = /^(?:skills|skills@1\.5\.21)$/;

export interface ParsedSkillsAddCommand {
  source: string;
  skills: string[];
  fullDepth: boolean;
}

export interface ResolvedSkillsSource {
  type: "github" | "gitlab" | "well-known" | "url";
  canonicalSource: string;
  resolvedContentDigest?: string;
}

export interface SkillsCommandImportResult {
  command: ParsedSkillsAddCommand;
  source: ResolvedSkillsSource;
  candidates: DiscoveredSkill[];
  resolvedSkills: AssetProvenanceSkill[];
  archive: Buffer;
}

interface FetchResult {
  body: Buffer;
  contentType: string;
  finalUrl: string;
}

interface MaterializedSource {
  archive: Buffer;
  source: Omit<ResolvedSkillsSource, "resolvedContentDigest">;
  ref?: string;
  skillPaths?: Map<string, string>;
}

interface SkillsCommandImportDependencies {
  fetchRemote?: (url: string, maxBytes?: number) => Promise<FetchResult>;
}

interface WellKnownEntry {
  name: string;
  type: "skill-md" | "archive";
  description: string;
  url: string;
  digest: string;
}

export function parseSkillsAddCommand(input: string): ParsedSkillsAddCommand {
  if (input.length > MAX_COMMAND_CHARS) throw new Error("The skills add command is too long.");
  const tokens = tokenizeCommand(input.trim());
  if (tokens.length === 0) throw new Error("Enter an npx skills add command or a supported Skill source.");
  rejectShellSyntax(tokens);

  let index = commandPrefixLength(tokens);
  if (index === 0) {
    if (tokens.length !== 1) throw new Error("Use a complete npx skills add command when providing options.");
    validateRemoteSource(tokens[0]!);
    return { source: tokens[0]!, skills: [], fullDepth: false };
  }

  const action = tokens[index];
  if (action !== "add" && action !== "a") throw new Error("Only the skills add command is supported.");
  const source = tokens[++index];
  if (!source || source.startsWith("-")) throw new Error("skills add requires a source.");
  validateRemoteSource(source);
  index += 1;

  const skills: string[] = [];
  let fullDepth = false;
  let listOnly = false;
  while (index < tokens.length) {
    const option = tokens[index++]!;
    if (option === "--skill" || option === "-s") {
      const values = readOptionValues(tokens, index);
      if (values.length === 0) throw new Error(`${option} requires at least one Skill name.`);
      skills.push(...values);
      index += values.length;
      continue;
    }
    if (option === "--full-depth") { fullDepth = true; continue; }
    if (option === "--all") { skills.push("*"); continue; }
    if (option === "--list" || option === "-l") { listOnly = true; continue; }
    if (["--global", "-g", "--copy", "--yes", "-y"].includes(option)) continue;
    if (["--agent", "-a", "--subagent"].includes(option)) {
      const values = readOptionValues(tokens, index);
      if (values.length === 0) throw new Error(`${option} requires at least one value.`);
      index += values.length;
      continue;
    }
    if (option === "--metadata") {
      const value = tokens[index];
      if (!value || value.startsWith("-")) throw new Error("--metadata requires a JSON value.");
      try { JSON.parse(value); } catch { throw new Error("--metadata must contain valid JSON."); }
      index += 1;
      continue;
    }
    throw new Error(`Unsupported skills add option: ${option}`);
  }
  if (listOnly) throw new Error("--list only displays available Skills; remove it to import into Harhub.");
  if (skills.length > MAX_SKILL_SELECTIONS) throw new Error(`Select at most ${MAX_SKILL_SELECTIONS} Skills in one import.`);
  return { source, skills: Array.from(new Set(skills)), fullDepth };
}

export async function importSkillsCommand(
  input: string,
  dependencies: SkillsCommandImportDependencies = {}
): Promise<SkillsCommandImportResult> {
  const command = parseSkillsAddCommand(input);
  const fetchRemote = dependencies.fetchRemote ?? fetchPublicHttps;
  const materialized = await materializeSource(command, fetchRemote);
  const discovered = await discoverSkillsInArchive(materialized.archive);
  const candidates = selectCandidates(discovered, command);
  const archive = await packageCandidates(candidates);
  const resolvedContentDigest = digestCandidateSet(candidates);
  const source = { ...materialized.source, resolvedContentDigest };
  return {
    command,
    source,
    candidates,
    archive,
    resolvedSkills: candidates.map((candidate) => ({
      name: candidate.name,
      source: provenanceUrl(command.source.slice(0, MAX_SOURCE_CHARS)),
      sourceType: source.type,
      ...(materialized.ref ? { ref: materialized.ref } : {}),
      skillPath: materialized.skillPaths?.get(candidate.name) ?? candidate.skillPath,
      computedHash: candidate.checksum
    }))
  };
}

async function materializeSource(
  command: ParsedSkillsAddCommand,
  fetchRemote: (url: string, maxBytes?: number) => Promise<FetchResult>
): Promise<MaterializedSource> {
  const github = parseGitHubSource(command.source);
  if (github) return materializeGitHub(github, fetchRemote);
  const gitlab = parseGitLabSource(command.source);
  if (gitlab) return materializeGitLab(gitlab, fetchRemote);
  if (!/^https:\/\//i.test(command.source)) {
    throw new Error("Only public GitHub, GitLab, well-known, SKILL.md, and ZIP sources are supported.");
  }
  return materializeHttps(command, fetchRemote);
}

interface RepositorySource { namespace: string; repo: string; ref?: string; subpath?: string }

async function materializeGitHub(
  repository: RepositorySource,
  fetchRemote: (url: string, maxBytes?: number) => Promise<FetchResult>
): Promise<MaterializedSource> {
  const id = `${repository.namespace}/${repository.repo}`;
  const revision = await fetchJson<{ sha?: unknown }>(
    `https://api.github.com/repos/${encodeURIComponent(repository.namespace)}/${encodeURIComponent(repository.repo)}/commits/${encodeURIComponent(repository.ref ?? "HEAD")}`,
    fetchRemote
  );
  if (typeof revision.sha !== "string" || !/^[a-f0-9]{40}$/i.test(revision.sha)) {
    throw new Error("GitHub did not return an immutable commit SHA.");
  }
  const ref = revision.sha.toLowerCase();
  const downloaded = await fetchRemote(`https://github.com/${id}/archive/${ref}.zip`);
  const archive = await sanitizeRepositoryZip(downloaded.body, repository.subpath);
  const canonicalSource = `https://github.com/${id}/tree/${ref}${repository.subpath ? `/${repository.subpath}` : ""}`;
  return { archive, source: { type: "github", canonicalSource }, ref };
}

async function materializeGitLab(
  repository: RepositorySource,
  fetchRemote: (url: string, maxBytes?: number) => Promise<FetchResult>
): Promise<MaterializedSource> {
  const projectId = `${repository.namespace}/${repository.repo}`;
  const project = encodeURIComponent(projectId);
  const revision = await fetchJson<{ id?: unknown }>(
    `https://gitlab.com/api/v4/projects/${project}/repository/commits/${encodeURIComponent(repository.ref ?? "HEAD")}`,
    fetchRemote
  );
  if (typeof revision.id !== "string" || !/^[a-f0-9]{40}$/i.test(revision.id)) {
    throw new Error("GitLab did not return an immutable commit SHA.");
  }
  const ref = revision.id.toLowerCase();
  const downloaded = await fetchRemote(`https://gitlab.com/api/v4/projects/${project}/repository/archive.zip?sha=${ref}`);
  const archive = await sanitizeRepositoryZip(downloaded.body, repository.subpath);
  const canonicalSource = `https://gitlab.com/${projectId}/-/tree/${ref}${repository.subpath ? `/${repository.subpath}` : ""}`;
  return { archive, source: { type: "gitlab", canonicalSource }, ref };
}

async function materializeHttps(
  command: ParsedSkillsAddCommand,
  fetchRemote: (url: string, maxBytes?: number) => Promise<FetchResult>
): Promise<MaterializedSource> {
  const sourceUrl = new URL(command.source);
  const indexCandidates = wellKnownIndexUrls(sourceUrl);
  for (const indexUrl of indexCandidates) {
    try {
      const index = await fetchJson<unknown>(indexUrl, fetchRemote);
      const entries = parseWellKnownV2(index, indexUrl);
      if (entries.length === 0) continue;
      const sourceSlug = wellKnownSourceSlug(sourceUrl);
      const selected = selectWellKnownEntries(entries, command.skills, sourceSlug);
      const candidates: DiscoveredSkill[] = [];
      const skillPaths = new Map<string, string>();
      for (const entry of selected) {
        const downloaded = await fetchRemote(entry.url);
        const actualDigest = `sha256:${createHash("sha256").update(downloaded.body).digest("hex")}`;
        if (actualDigest !== entry.digest) throw new Error(`Digest mismatch for ${entry.name}.`);
        const archive = entry.type === "skill-md" ? await markdownArchive(downloaded.body) : downloaded.body;
        const found = await discoverSkillsInArchive(archive);
        if (found.length !== 1) throw new Error(`Well-known entry ${entry.name} must contain exactly one Skill.`);
        candidates.push(found[0]!);
        skillPaths.set(found[0]!.name, `${indexUrl}#${entry.name}`);
      }
      return {
        archive: await packageCandidates(candidates),
        source: { type: "well-known", canonicalSource: indexUrl },
        skillPaths
      };
    } catch (error) {
      if (error instanceof Error && /Digest mismatch|must contain exactly one Skill|Requested Skill/.test(error.message)) throw error;
    }
  }

  const downloaded = await fetchRemote(command.source);
  const archive = looksLikeMarkdown(downloaded) ? await markdownArchive(downloaded.body) : downloaded.body;
  return { archive, source: { type: "url", canonicalSource: provenanceUrl(downloaded.finalUrl) } };
}

function selectCandidates(candidates: DiscoveredSkill[], command: ParsedSkillsAddCommand): DiscoveredSkill[] {
  const visible = command.fullDepth ? candidates : candidates.filter((candidate) => pathDepth(candidate.skillPath) <= 6);
  if (command.skills.includes("*")) return visible;
  if (command.skills.length === 0) {
    if (visible.length !== 1) throw new Error(`Source contains ${visible.length} Skills; use --skill <name> or --all.`);
    return visible;
  }
  const selected = command.skills.map((requested) => {
    const slug = skillSlug(requested);
    const matches = visible.filter((candidate) =>
      skillSlug(candidate.name) === slug || skillSlug(candidate.rootPath.split("/").pop() ?? "") === slug
    );
    if (matches.length !== 1) throw new Error(`Requested Skill was not found uniquely: ${requested}`);
    return matches[0]!;
  });
  return Array.from(new Map(selected.map((candidate) => [candidate.skillPath, candidate])).values());
}

async function sanitizeRepositoryZip(buffer: Buffer, subpath?: string): Promise<Buffer> {
  const source = await JSZip.loadAsync(buffer, { checkCRC32: false });
  const target = new JSZip();
  const normalizedSubpath = subpath?.replace(/^\/+|\/+$/g, "");
  let files = 0;
  let bytes = 0;
  for (const entry of Object.values(source.files)) {
    if (entry.dir) continue;
    const originalName = entry.unsafeOriginalName ?? entry.name;
    if (isUnsafeArchivePath(originalName)) throw new Error(`Repository archive contains an unsafe path: ${originalName}`);
    const parts = entry.name.split("/");
    const repositoryPath = parts.slice(1).join("/");
    if (normalizedSubpath && repositoryPath !== normalizedSubpath && !repositoryPath.startsWith(`${normalizedSubpath}/`)) continue;
    const outputPath = normalizedSubpath
      ? repositoryPath.slice(normalizedSubpath.length).replace(/^\//, "")
      : entry.name;
    if (!outputPath) continue;
    const mode = entry.unixPermissions;
    if (typeof mode === "number" && (mode & 0o170000) === 0o120000) continue;
    const declaredSize = (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize;
    if (!Number.isSafeInteger(declaredSize) || declaredSize! < 0) throw new Error("Repository archive has an invalid declared file size.");
    files += 1;
    bytes += declaredSize!;
    if (files > 1000 || bytes > 50 * 1024 * 1024) throw new Error("Repository archive exceeds Harhub's file or extracted-size limit.");
    const content = await entry.async("nodebuffer");
    if (content.byteLength !== declaredSize) throw new Error("Repository archive file size does not match its declaration.");
    target.file(outputPath, content, { createFolders: false });
  }
  const archive = await target.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  if (archive.byteLength > MAX_DOWNLOAD_BYTES) throw new Error("Repository archive exceeds Harhub's compressed-size limit.");
  return archive;
}

function isUnsafeArchivePath(value: string): boolean {
  const normalized = value.replace(/\\/g, "/");
  return normalized.includes("\0") || normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized) ||
    normalized.split("/").some((part) => part === "." || part === "..");
}

async function packageCandidates(candidates: DiscoveredSkill[]): Promise<Buffer> {
  const zip = new JSZip();
  for (const candidate of candidates) {
    for (const file of candidate.files) zip.file(`${candidate.name}/${file.path}`, file.content);
  }
  const archive = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  if (archive.byteLength > MAX_DOWNLOAD_BYTES) throw new Error("Imported Skills exceed Harhub's compressed archive size limit.");
  return archive;
}

async function markdownArchive(content: Buffer): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("SKILL.md", content);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

function parseWellKnownV2(value: unknown, indexUrl: string): WellKnownEntry[] {
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  if (record.$schema !== DISCOVERY_SCHEMA_V2 || !Array.isArray(record.skills)) return [];
  const entries: WellKnownEntry[] = [];
  for (const item of record.skills) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    if (typeof entry.name !== "string" || !/^[a-z0-9-]{1,64}$/.test(entry.name)) continue;
    if (entry.type !== "skill-md" && entry.type !== "archive") continue;
    if (typeof entry.description !== "string" || typeof entry.url !== "string") continue;
    if (typeof entry.digest !== "string" || !/^sha256:[a-f0-9]{64}$/.test(entry.digest)) continue;
    const url = new URL(entry.url, indexUrl);
    validateRemoteSource(url.toString());
    entries.push({ name: entry.name, type: entry.type, description: entry.description, url: url.toString(), digest: entry.digest });
  }
  return entries;
}

function selectWellKnownEntries(entries: WellKnownEntry[], skills: string[], sourceSlug?: string): WellKnownEntry[] {
  if (skills.includes("*")) return entries;
  const requested = skills.length > 0 ? skills : sourceSlug ? [sourceSlug] : [];
  if (requested.length === 0) {
    if (entries.length !== 1) throw new Error(`Source contains ${entries.length} Skills; use --skill <name> or --all.`);
    return entries;
  }
  return requested.map((name) => {
    const entry = entries.find((candidate) => skillSlug(candidate.name) === skillSlug(name));
    if (!entry) throw new Error(`Requested Skill was not found: ${name}`);
    return entry;
  });
}

function wellKnownIndexUrls(source: URL): string[] {
  if (/\/\.well-known\/(?:agent-skills|skills)\/index\.json$/.test(source.pathname)) return [source.toString()];
  const base = source.pathname.replace(/\/$/, "");
  return ["agent-skills", "skills"].flatMap((kind) => [
    `${source.origin}${base}/.well-known/${kind}/index.json`,
    ...(base ? [`${source.origin}/.well-known/${kind}/index.json`] : [])
  ]);
}

function wellKnownSourceSlug(source: URL): string | undefined {
  const parts = source.pathname.split("/").filter(Boolean);
  if (parts.at(-2) === "skills") return parts.at(-1);
  const match = source.pathname.match(/\/\.well-known\/(?:agent-skills|skills)\/([^/]+)\/?$/);
  return match?.[1];
}

async function fetchJson<T>(url: string, fetchRemote: (url: string, maxBytes?: number) => Promise<FetchResult>): Promise<T> {
  const result = await fetchRemote(url, 2 * 1024 * 1024);
  try { return JSON.parse(result.body.toString("utf8")) as T; }
  catch { throw new Error(`Remote source returned invalid JSON: ${url}`); }
}

export async function fetchPublicHttps(urlText: string, maxBytes = MAX_DOWNLOAD_BYTES): Promise<FetchResult> {
  let current = new URL(urlText);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    validateRemoteSource(current.toString());
    const addresses = await resolvePublicAddresses(current.hostname);
    const result = await requestPinnedHttps(current, addresses, maxBytes);
    if (result.status >= 300 && result.status < 400 && result.location) {
      current = new URL(result.location, current);
      continue;
    }
    if (result.status < 200 || result.status >= 300) throw new Error(`Remote source returned HTTP ${result.status}.`);
    return { body: result.body, contentType: result.contentType, finalUrl: current.toString() };
  }
  throw new Error("Remote source redirected too many times.");
}

async function resolvePublicAddresses(hostname: string): Promise<Array<{ address: string; family: number }>> {
  const records = await lookup(hostname, { all: true, verbatim: true });
  if (records.length === 0 || records.some((record) => !isPublicNetworkAddress(record.address))) {
    throw new Error("Remote Skill URLs cannot resolve to local or private network addresses.");
  }
  return records;
}

function requestPinnedHttps(
  url: URL,
  addresses: Array<{ address: string; family: number }>,
  maxBytes: number
): Promise<{ status: number; location?: string; contentType: string; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const request = https.request(url, {
      method: "GET",
      headers: { "user-agent": "Harhub skills@1.5.21 importer", accept: "*/*" },
      lookup: (_hostname, options, callback) => {
        if (typeof options === "object" && options.all) {
          callback(null, addresses.map(({ address, family }) => ({ address, family })));
          return;
        }
        callback(null, addresses[0]!.address, addresses[0]!.family);
      },
      signal: AbortSignal.timeout(IMPORT_TIMEOUT_MS)
    }, (response) => {
      const declared = Number(response.headers["content-length"] ?? 0);
      if (declared > maxBytes) { response.destroy(); reject(new Error("Remote source exceeds the download size limit.")); return; }
      const chunks: Buffer[] = [];
      let bytes = 0;
      response.on("data", (chunk: Buffer) => {
        bytes += chunk.byteLength;
        if (bytes > maxBytes) response.destroy(new Error("Remote source exceeds the download size limit."));
        else chunks.push(chunk);
      });
      response.on("error", reject);
      response.on("end", () => resolve({
        status: response.statusCode ?? 0,
        ...(typeof response.headers.location === "string" ? { location: response.headers.location } : {}),
        contentType: String(response.headers["content-type"] ?? ""),
        body: Buffer.concat(chunks)
      }));
    });
    request.on("error", reject);
    request.end();
  });
}

function parseGitHubSource(source: string): RepositorySource | undefined {
  if (source.startsWith("gitlab:")) return undefined;
  if (source.startsWith("github:")) return parseRepositoryShorthand(source.slice(7));
  if (!/^https:\/\//i.test(source)) return parseRepositoryShorthand(source);
  const url = new URL(source);
  if (url.hostname.toLowerCase() !== "github.com") return undefined;
  const parts = url.pathname.replace(/\.git$/, "").split("/").filter(Boolean);
  if (parts.length < 2) return undefined;
  const tree = parts[2] === "tree";
  return { namespace: parts[0]!, repo: parts[1]!, ...(tree && parts[3] ? { ref: parts[3] } : {}), ...(tree && parts.length > 4 ? { subpath: parts.slice(4).join("/") } : {}) };
}

function parseGitLabSource(source: string): RepositorySource | undefined {
  if (source.startsWith("gitlab:")) return parseRepositoryShorthand(source.slice(7));
  if (!/^https:\/\//i.test(source)) return undefined;
  const url = new URL(source);
  if (url.hostname.toLowerCase() !== "gitlab.com") return undefined;
  const parts = url.pathname.replace(/\.git$/, "").split("/").filter(Boolean);
  if (parts.length < 2) return undefined;
  const marker = parts.findIndex((part, index) => part === "-" && parts[index + 1] === "tree");
  const projectParts = marker >= 0 ? parts.slice(0, marker) : parts;
  if (projectParts.length < 2) return undefined;
  return {
    namespace: projectParts.slice(0, -1).join("/"),
    repo: projectParts.at(-1)!,
    ...(marker >= 0 && parts[marker + 2] ? { ref: parts[marker + 2] } : {}),
    ...(marker >= 0 && parts.length > marker + 3 ? { subpath: parts.slice(marker + 3).join("/") } : {})
  };
}

function parseRepositoryShorthand(source: string): RepositorySource | undefined {
  const [withoutFragment, fragment] = source.split("#", 2);
  const parts = withoutFragment!.split("/");
  if (parts.length < 2) return undefined;
  const repoMatch = parts[1]!.match(/^(.+?)(?:@([^/]+))?$/);
  if (!repoMatch) return undefined;
  return { namespace: parts[0]!, repo: repoMatch[1]!, ...(repoMatch[2] ? { ref: repoMatch[2] } : {}), ...(parts.length > 2 ? { subpath: parts.slice(2).join("/") } : {}), ...(fragment && !repoMatch[2] ? { ref: fragment } : {}) };
}

function validateRemoteSource(source: string): void {
  if (source.length > MAX_SOURCE_CHARS) throw new Error("The Skill source is too long.");
  if (LOCAL_SOURCE_PATTERN.test(source) || source.startsWith("git@") || source.startsWith("ssh://")) throw new Error("Server imports require a public remote source; local paths and SSH sources are not available.");
  if (/^https?:\/\//i.test(source)) {
    const url = new URL(source);
    if (url.protocol !== "https:") throw new Error("Remote Skill URLs must use HTTPS.");
    if (url.username || url.password) throw new Error("Remote Skill URLs cannot contain embedded credentials.");
    for (const key of url.searchParams.keys()) {
      if (/(?:token|secret|password|passwd|credential|signature|api[-_]?key|access[-_]?key|auth)/i.test(key)) {
        throw new Error("Remote Skill URLs cannot contain credential query parameters.");
      }
    }
    if (isPrivateHostname(url.hostname)) throw new Error("Remote Skill URLs cannot target local or private network hosts.");
    return;
  }
  if (!/^(?:github:|gitlab:)?[A-Za-z0-9_.-]+\/[A-Za-z0-9_.@/# -]+$/.test(source)) throw new Error("Unsupported Skill source. Use a public GitHub/GitLab source or HTTPS URL.");
}

function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host === "0.0.0.0" || host === "::1" || host.endsWith(".local") || (isIP(host) !== 0 && !isPublicNetworkAddress(host));
}

export function isPublicNetworkAddress(address: string): boolean {
  const host = address.toLowerCase();
  if (host.startsWith("::ffff:")) return isPublicNetworkAddress(host.slice(7));
  const family = isIP(host);
  if (family === 4) return !IPV4_NON_PUBLIC.check(host, "ipv4");
  if (family === 6) {
    return IPV6_GLOBAL.check(host, "ipv6") && !IPV6_NON_PUBLIC.check(host, "ipv6");
  }
  return false;
}

export function provenanceUrl(value: string): string {
  if (!/^https:\/\//i.test(value)) return value;
  const url = new URL(value);
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function commandPrefixLength(tokens: string[]): number {
  if (tokens[0] === "npx") {
    let index = 1;
    while (tokens[index]?.startsWith("-")) index += 1;
    if (!PINNED_SKILLS_PACKAGE.test(tokens[index] ?? "")) throw new Error("Harhub supports skills@1.5.21 commands only.");
    return index + 1;
  }
  if ((tokens[0] === "pnpm" || tokens[0] === "yarn") && tokens[1] === "dlx") {
    if (!PINNED_SKILLS_PACKAGE.test(tokens[2] ?? "")) throw new Error("Harhub supports skills@1.5.21 commands only.");
    return 3;
  }
  if (tokens[0] === "bunx") {
    if (!PINNED_SKILLS_PACKAGE.test(tokens[1] ?? "")) throw new Error("Harhub supports skills@1.5.21 commands only.");
    return 2;
  }
  return 0;
}

function readOptionValues(tokens: string[], start: number): string[] {
  const values: string[] = [];
  for (let index = start; index < tokens.length && !tokens[index]!.startsWith("-"); index += 1) values.push(tokens[index]!);
  return values;
}

function rejectShellSyntax(tokens: string[]): void {
  const forbidden = /(?:&&|\|\||[|;<>`]|\$\(|\r|\n)/;
  if (tokens.some((token) => forbidden.test(token))) throw new Error("Shell operators and substitutions are not supported.");
}

function tokenizeCommand(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | undefined;
  let escaped = false;
  for (const character of input) {
    if (escaped) { current += character; escaped = false; continue; }
    if (character === "\\" && quote !== "'") { escaped = true; continue; }
    if (quote) { if (character === quote) quote = undefined; else current += character; continue; }
    if (character === "'" || character === '"') { quote = character; continue; }
    if (/\s/.test(character)) { if (current) tokens.push(current); current = ""; continue; }
    current += character;
  }
  if (escaped || quote) throw new Error("The command contains an unfinished quote or escape.");
  if (current) tokens.push(current);
  return tokens;
}

function digestCandidateSet(candidates: DiscoveredSkill[]): string {
  return `sha256:${createHash("sha256").update(candidates.map((candidate) => `${candidate.name}:${candidate.checksum}`).sort().join("\n")).digest("hex")}`;
}

function skillSlug(value: string): string {
  return value.toLowerCase().replace(/[\s_]+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function pathDepth(value: string): number { return value.split("/").filter(Boolean).length - 1; }
function looksLikeMarkdown(result: FetchResult): boolean { return /(?:markdown|text\/plain)/i.test(result.contentType) || result.finalUrl.toLowerCase().endsWith("/skill.md") || result.finalUrl.toLowerCase().endsWith(".md"); }
