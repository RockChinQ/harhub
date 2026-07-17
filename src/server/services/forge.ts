import JSZip from "jszip";

import type {
  AssetCatalog,
  AssetRecord,
  HarnessFollowUpComponent,
  HarnessFollowUpRequest,
  HarnessFollowUpResponse,
  HarnessTemplateFile,
  HarnessTemplateAssetSelection,
  HarnessTemplateProfile,
  HarnessTemplateResponse,
  HarnessWorkspaceAssetSummary,
  WorkspaceAiConnectionTestResult
} from "../../shared/types.js";
import { loadStoredSkill } from "./skill-packages.js";

const MAX_FOLLOW_UPS = 3;
const MAX_LIST_ITEMS = 6;
const MAX_SELECTED_ASSETS = 4;
const MAX_ARCHIVE_SKILL_BYTES = 25 * 1024 * 1024;
const AI_REQUEST_ATTEMPTS = 3;
const AI_RETRY_DELAYS_MS = [250, 750];

interface ForgeTemplateSpec {
  name: string;
  summary: string;
  targetUsers: string[];
  goals: string[];
  constraints: string[];
  successCriteria: string[];
  stackNotes: string[];
  agentRules: string[];
  selectedAssets: Array<{ assetId: string; reason: string }>;
  workflow: {
    name: string;
    objective: string;
    steps: string[];
    verification: string[];
  };
}

export interface ForgeAiConfiguration {
  baseUrl: string;
  model: string;
  apiKey: string;
}

export async function testForgeAiConnection(
  configuration: ForgeAiConfiguration
): Promise<WorkspaceAiConnectionTestResult> {
  const startedAt = Date.now();
  try {
    const payload = await requestJson({
      ...configuration,
      maxTokens: 700,
      system: "This is a connection test. Return only the JSON object {\"ok\":true}.",
      user: "Confirm that this model can complete an OpenAI-compatible JSON chat request."
    });
    if (payload.ok !== true) {
      throw new Error("AI provider responded, but did not follow the required JSON response format.");
    }
    return {
      ok: true,
      model: configuration.model,
      latencyMs: Math.max(0, Date.now() - startedAt)
    };
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error("AI provider did not respond within 30 seconds.");
    }
    if (error instanceof TypeError && error.message === "fetch failed") {
      throw new Error("Could not connect to the AI provider. Check the Base URL and server network access.");
    }
    throw error;
  }
}

export async function createHarnessFollowUp(
  input: HarnessFollowUpRequest,
  workspaceAssets: HarnessWorkspaceAssetSummary[],
  aiConfiguration?: ForgeAiConfiguration
): Promise<HarnessFollowUpResponse> {
  if (input.answers.length >= MAX_FOLLOW_UPS) return { mode: "llm", ready: true };
  const configuration = requireForgeAiConfiguration(aiConfiguration);

  return withAiRetries(async () => {
    const payload = await requestJson({
      ...configuration,
      maxTokens: 700,
      system: [
        "You run a concise project discovery interview for an agent harness template.",
        "Ask exactly one useful follow-up in the same language as the user's requirement.",
        "Clarify target users, must-work workflow, constraints, success criteria, or technical context.",
        "Do not repeat answered questions. Do not ask for information that is already explicit.",
        `There can be at most ${MAX_FOLLOW_UPS} answered follow-ups.`,
        "Return only JSON with keys ready, question, and component.",
        "When ready is false, component.type is single-select, multi-select, or text.",
        "Use single-select for one mutually exclusive answer, multi-select when several choices may apply, and text when presets would hide important nuance.",
        "Choice components contain 3 to 6 options with short label and optional description, plus allowCustom and optional maxSelections.",
        "Text components contain a useful placeholder and an empty options array.",
        "On the first round ready must be false."
      ].join(" "),
      user: JSON.stringify({
        ...input,
        workspaceSkills: workspaceAssets.map(assetPromptSummary)
      }, null, 2)
    });
    const question = readString(payload.question);
    const component = readFollowUpComponent(payload.component);
    const ready = input.answers.length > 0 && payload.ready === true;

    if (!ready && (!question || !component)) {
      throw new Error("AI follow-up did not match the expected shape");
    }

    return {
      mode: "llm",
      ready,
      question: ready ? undefined : question,
      component: ready ? undefined : component
    };
  });
}

export async function createHarnessTemplate(
  input: HarnessFollowUpRequest,
  workspaceAssets: HarnessWorkspaceAssetSummary[],
  aiConfiguration?: ForgeAiConfiguration
): Promise<HarnessTemplateResponse> {
  const configuration = requireForgeAiConfiguration(aiConfiguration);
  return withAiRetries(async () => {
    const payload = await requestJson({
      ...configuration,
      maxTokens: 2400,
      system: [
        "You turn a project discovery interview into a structured project harness brief.",
        "Stay faithful to the user. Put unknown details in constraints or stackNotes instead of inventing facts.",
        "Return only one JSON object with this shape:",
        JSON.stringify({
          name: "Short project name",
          summary: "One paragraph",
          targetUsers: ["user group"],
          goals: ["goal"],
          constraints: ["constraint or open question"],
          successCriteria: ["measurable or observable outcome"],
          stackNotes: ["known technical context or decision still needed"],
          agentRules: ["specific instruction for coding agents"],
          selectedAssets: [{ assetId: "exact workspace asset id", reason: "why it fits" }],
          workflow: {
            name: "Core delivery workflow",
            objective: "workflow objective",
            steps: ["ordered step"],
            verification: ["verification evidence"]
          }
        }),
        "Select at most 4 Skills. Use only exact assetId values from workspaceSkills.",
        "Select a Skill only when its description materially supports the requirement or delivery workflow.",
        "Use the same language as the user's requirement."
      ].join("\n"),
      user: JSON.stringify({
        ...input,
        workspaceSkills: workspaceAssets.map(assetPromptSummary)
      }, null, 2)
    });
    return buildHarnessTemplate(readTemplateSpec(payload, workspaceAssets), workspaceAssets);
  });
}

export function buildHarnessTemplate(
  spec: ForgeTemplateSpec,
  workspaceAssets: HarnessWorkspaceAssetSummary[] = []
): HarnessTemplateResponse {
  const slug = slugify(spec.name) || "project-harness";
  const profile: HarnessTemplateProfile = {
    name: spec.name,
    slug,
    summary: spec.summary,
    targetUsers: spec.targetUsers,
    goals: spec.goals,
    constraints: spec.constraints,
    successCriteria: spec.successCriteria,
    stackNotes: spec.stackNotes
  };
  const selectedAssets = resolveSelectedAssets(spec.selectedAssets, workspaceAssets);
  const files: HarnessTemplateFile[] = [
    file("AGENTS.md", agentGuide(spec, selectedAssets)),
    file(".harness/README.md", harnessReadme(spec, selectedAssets)),
    file(".harness/project-brief.md", projectBrief(spec)),
    file(".harness/context/stack.md", stackContext(spec)),
    file(".harness/rules/engineering.md", engineeringRules(spec)),
    file(".harness/workflows/delivery.md", deliveryWorkflow(spec)),
    file(".harness/skills/README.md", selectedSkillsReadme(selectedAssets)),
    file(".harness/catalog/skills.json", `${JSON.stringify({ skills: selectedAssets }, null, 2)}\n`),
    file(
      ".harness/changes/CHANGELOG.md",
      "# Harness Changelog\n\nRecord changes to project instructions, rules, workflows, and reusable assets here.\n"
    )
  ];

  return {
    mode: "llm",
    generatedAt: new Date().toISOString(),
    profile,
    selectedAssets,
    files
  };
}

function readTemplateSpec(
  payload: Record<string, unknown>,
  workspaceAssets: HarnessWorkspaceAssetSummary[]
): ForgeTemplateSpec {
  if (!isRecord(payload.workflow)) throw new Error("AI template workflow is required");
  const workflow = payload.workflow;
  return {
    name: readRequiredAiString(payload.name, "name"),
    summary: readRequiredAiString(payload.summary, "summary"),
    targetUsers: readRequiredAiStringList(payload.targetUsers, "targetUsers"),
    goals: readRequiredAiStringList(payload.goals, "goals"),
    constraints: readAiStringList(payload.constraints, "constraints"),
    successCriteria: readRequiredAiStringList(payload.successCriteria, "successCriteria"),
    stackNotes: readAiStringList(payload.stackNotes, "stackNotes"),
    agentRules: readRequiredAiStringList(payload.agentRules, "agentRules"),
    selectedAssets: readAssetSelections(payload.selectedAssets, workspaceAssets),
    workflow: {
      name: readRequiredAiString(workflow.name, "workflow.name"),
      objective: readRequiredAiString(workflow.objective, "workflow.objective"),
      steps: readRequiredAiStringList(workflow.steps, "workflow.steps"),
      verification: readRequiredAiStringList(workflow.verification, "workflow.verification")
    }
  };
}

function assetPromptSummary(asset: HarnessWorkspaceAssetSummary) {
  return {
    id: asset.id,
    name: asset.name,
    displayName: asset.displayName,
    description: asset.description,
    health: asset.health
  };
}

export function workspaceAssetSummaries(assets: AssetRecord[]): HarnessWorkspaceAssetSummary[] {
  return assets
    .filter((asset) => asset.kind === "skill" && asset.health !== "error" && Boolean(asset.storage))
    .map((asset) => ({
      id: asset.id,
      kind: asset.kind,
      name: asset.name,
      displayName: asset.displayName,
      slug: asset.slug,
      description: asset.description,
      health: asset.health,
      fileCount: asset.storage?.fileCount ?? 0,
      size: asset.storage?.size ?? 0
    }));
}

export async function createHarnessTemplateArchive(
  catalog: AssetCatalog,
  input: {
    slug: string;
    files: HarnessTemplateFile[];
    selectedAssetIds: string[];
  }
): Promise<{ buffer: Buffer; fileName: string }> {
  validateFrameworkFiles(input.files);
  const selectedIds = new Set(input.selectedAssetIds.slice(0, MAX_LIST_ITEMS));
  const assets = catalog.assets.filter(
    (asset) => selectedIds.has(asset.id) && asset.kind === "skill" && asset.health !== "error"
  );
  const totalSkillBytes = assets.reduce((total, asset) => total + (asset.storage?.size ?? 0), 0);
  if (totalSkillBytes > MAX_ARCHIVE_SKILL_BYTES) {
    throw new Error("Selected Skills are too large for one generated template");
  }

  const zip = new JSZip();
  input.files.forEach((item) => zip.file(item.path, item.content));
  const skillPackages = await Promise.all(assets.map(async (asset) => {
    if (!asset.storage) throw new Error(`Selected asset ${asset.id} has no stored package`);
    return { asset, files: (await loadStoredSkill(asset.storage)).files };
  }));

  for (const skillPackage of skillPackages) {
    const basePath = `.harness/skills/${skillPackage.asset.slug || slugify(skillPackage.asset.name) || "skill"}`;
    for (const skillFile of skillPackage.files) {
      zip.file(`${basePath}/${safeRelativePath(skillFile.path)}`, skillFile.content);
    }
  }

  return {
    buffer: await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }),
    fileName: `${slugify(input.slug) || "project-harness"}-harness.zip`
  };
}

function readAssetSelections(
  value: unknown,
  workspaceAssets: HarnessWorkspaceAssetSummary[]
): Array<{ assetId: string; reason: string }> {
  if (!Array.isArray(value)) throw new Error("AI template selectedAssets must be an array");
  const availableIds = new Set(workspaceAssets.map((item) => item.id));
  const seen = new Set<string>();
  return value.slice(0, MAX_SELECTED_ASSETS).map((item, index) => {
    if (!isRecord(item)) throw new Error(`AI template selectedAssets[${index}] is invalid`);
    const assetId = readRequiredAiString(item.assetId, `selectedAssets[${index}].assetId`);
    const reason = readRequiredAiString(item.reason, `selectedAssets[${index}].reason`);
    if (!availableIds.has(assetId)) {
      throw new Error(`AI template selected unknown workspace asset ${assetId}`);
    }
    if (seen.has(assetId)) throw new Error(`AI template selected asset ${assetId} more than once`);
    seen.add(assetId);
    return { assetId, reason };
  });
}

function resolveSelectedAssets(
  selections: Array<{ assetId: string; reason: string }>,
  availableAssets: HarnessWorkspaceAssetSummary[]
): HarnessTemplateAssetSelection[] {
  const available = new Map(availableAssets.map((asset) => [asset.id, asset]));
  const seen = new Set<string>();
  return selections.flatMap((selection) => {
    const asset = available.get(selection.assetId);
    if (!asset || seen.has(asset.id)) return [];
    seen.add(asset.id);
    return [{
      ...asset,
      reason: selection.reason,
      installPath: `.harness/skills/${asset.slug || slugify(asset.name) || "skill"}`
    }];
  });
}

async function requestJson({
  apiKey,
  baseUrl,
  model,
  maxTokens,
  system,
  user
}: {
  apiKey: string;
  baseUrl: string;
  model: string;
  maxTokens: number;
  system: string;
  user: string;
}): Promise<Record<string, unknown>> {
  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      max_completion_tokens: maxTokens,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    }),
    signal: AbortSignal.timeout(30_000)
  });

  if (!response.ok) {
    const detail = await readProviderError(response);
    throw new Error(
      `AI provider returned HTTP ${response.status}${detail ? `: ${detail}` : ""}`
    );
  }
  const body = await response.json() as unknown;
  const content = extractMessageContent(body);
  if (!content) throw new Error("AI response did not contain JSON text");
  const parsed = JSON.parse(stripCodeFence(content)) as unknown;
  if (!isRecord(parsed)) throw new Error("AI response was not a JSON object");
  return parsed;
}

function requireForgeAiConfiguration(
  configuration: ForgeAiConfiguration | undefined
): ForgeAiConfiguration {
  if (!configuration) {
    throw new Error(
      "Forge AI is not configured for this workspace. Configure and test it in Workspace Settings, then retry."
    );
  }
  return configuration;
}

async function withAiRetries<T>(request: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= AI_REQUEST_ATTEMPTS; attempt += 1) {
    try {
      return await request();
    } catch (error) {
      lastError = error;
      if (attempt < AI_REQUEST_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, AI_RETRY_DELAYS_MS[attempt - 1]));
      }
    }
  }
  throw new Error(
    `AI request failed after ${AI_REQUEST_ATTEMPTS} attempts: ${aiErrorMessage(lastError)}`
  );
}

function aiErrorMessage(error: unknown): string {
  if (error instanceof Error && error.name === "TimeoutError") {
    return "The AI provider did not respond before the request timed out.";
  }
  if (error instanceof TypeError && error.message === "fetch failed") {
    return "Could not connect to the AI provider. Check the Base URL and server network access.";
  }
  return error instanceof Error ? error.message : String(error);
}

async function readProviderError(response: Response): Promise<string | undefined> {
  const text = await response.text().catch(() => "");
  if (!text) return undefined;
  try {
    const payload = JSON.parse(text) as unknown;
    if (isRecord(payload)) {
      const error = isRecord(payload.error) ? payload.error : payload;
      const message = readString(error.message);
      if (message) return message.replace(/\s+/g, " ").slice(0, 300);
    }
  } catch {
    // Fall through to a bounded plain-text provider error.
  }
  return text.replace(/\s+/g, " ").trim().slice(0, 300) || undefined;
}

function extractMessageContent(value: unknown): string | undefined {
  if (!isRecord(value) || !Array.isArray(value.choices)) return undefined;
  const choice = value.choices[0];
  if (!isRecord(choice) || !isRecord(choice.message)) return undefined;
  return readString(choice.message.content) ?? undefined;
}

function stripCodeFence(value: string): string {
  return value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, 4_000) : undefined;
}

function readFollowUpComponent(value: unknown): HarnessFollowUpComponent | undefined {
  if (!isRecord(value)) return undefined;
  const type = value.type;
  if (type !== "single-select" && type !== "multi-select" && type !== "text") {
    return undefined;
  }

  if (type === "text") {
    return {
      type,
      options: [],
      placeholder: readString(value.placeholder)?.slice(0, 240)
    };
  }

  const rawOptions = Array.isArray(value.options) ? value.options : [];
  const seen = new Set<string>();
  const options = rawOptions.flatMap((item) => {
    if (!isRecord(item)) return [];
    const label = readString(item.label)?.slice(0, 120);
    if (!label || seen.has(label)) return [];
    seen.add(label);
    const description = readString(item.description)?.slice(0, 240);
    return [{ label, ...(description ? { description } : {}) }];
  }).slice(0, MAX_LIST_ITEMS);
  if (options.length < 2) return undefined;

  const maxSelections = type === "multi-select" && typeof value.maxSelections === "number"
    ? Math.max(1, Math.min(options.length, Math.floor(value.maxSelections)))
    : undefined;
  return {
    type,
    options,
    allowCustom: value.allowCustom !== false,
    ...(maxSelections ? { maxSelections } : {})
  };
}

function readRequiredAiString(value: unknown, label: string): string {
  const result = readString(value);
  if (!result) throw new Error(`AI template ${label} is required`);
  return result;
}

function readAiStringList(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`AI template ${label} must be an array`);
  const items = value.slice(0, MAX_LIST_ITEMS).map((item, index) => {
    const result = readString(item);
    if (!result) throw new Error(`AI template ${label}[${index}] must be a non-empty string`);
    return result;
  });
  return Array.from(new Set(items));
}

function readRequiredAiStringList(value: unknown, label: string): string[] {
  const items = readAiStringList(value, label);
  if (items.length === 0) throw new Error(`AI template ${label} cannot be empty`);
  return items;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function validateFrameworkFiles(files: HarnessTemplateFile[]): void {
  if (files.length === 0 || files.length > 20) throw new Error("Invalid generated file set");
  const allowedPaths = new Set([
    "AGENTS.md",
    ".harness/README.md",
    ".harness/project-brief.md",
    ".harness/context/stack.md",
    ".harness/rules/engineering.md",
    ".harness/workflows/delivery.md",
    ".harness/skills/README.md",
    ".harness/catalog/skills.json",
    ".harness/changes/CHANGELOG.md"
  ]);
  let totalChars = 0;
  for (const item of files) {
    const filePath = safeRelativePath(item.path);
    if (!allowedPaths.has(filePath)) {
      throw new Error("Generated file path is not part of the harness template");
    }
    if (typeof item.content !== "string" || item.content.length > 200_000) {
      throw new Error("Generated file is too large");
    }
    totalChars += item.content.length;
  }
  if (totalChars > 800_000) throw new Error("Generated template is too large");
}

function safeRelativePath(value: string): string {
  const normalized = value.replace(/\\/g, "/").replace(/^\.\//, "");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").includes("..")) {
    throw new Error("Invalid generated file path");
  }
  return normalized;
}

function file(path: string, content: string): HarnessTemplateFile {
  return { path, content: content.trimEnd() + "\n" };
}

function bullets(items: string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}

function numbered(items: string[]): string {
  return items.map((item, index) => `${index + 1}. ${item}`).join("\n");
}

function agentGuide(
  spec: ForgeTemplateSpec,
  selectedAssets: HarnessTemplateAssetSelection[]
): string {
  return `# ${spec.name} Agent Guide

## Read First

Before changing the project, read:

1. \`.harness/README.md\`
2. \`.harness/project-brief.md\`
3. \`.harness/context/stack.md\`
4. \`.harness/rules/engineering.md\`
5. \`.harness/workflows/delivery.md\`
6. \`.harness/skills/README.md\`

## Working Contract

${bullets(spec.agentRules)}

## Workspace Skills

${selectedAssets.length
    ? "Use the selected workspace Skills when their descriptions match the current task. Each complete Skill package is included under `.harness/skills/` in the downloaded template."
    : "No workspace Skill was selected. Revisit the Harhub workspace catalog before adopting this baseline."}

## Change Record

Summarize material harness changes in \`.harness/changes/CHANGELOG.md\`, including what changed, why, verification evidence, and remaining risk.`;
}

function harnessReadme(
  spec: ForgeTemplateSpec,
  selectedAssets: HarnessTemplateAssetSelection[]
): string {
  return `# ${spec.name} Harness

${spec.summary}

This directory is a reviewable project harness template. It contains project context, standing rules, a delivery workflow, and a durable change record. Adapt it with the team before treating assumptions as policy.

## Contents

- \`project-brief.md\`: users, goals, constraints, and success criteria.
- \`context/stack.md\`: known technical context and decisions still needed.
- \`rules/engineering.md\`: standing instructions for agents.
- \`workflows/delivery.md\`: the first delivery workflow and verification gates.
- \`skills/\`: ${selectedAssets.length} selected Skill package${selectedAssets.length === 1 ? "" : "s"} from the current Harhub workspace.
- \`changes/CHANGELOG.md\`: the history of harness changes.`;
}

function selectedSkillsReadme(selectedAssets: HarnessTemplateAssetSelection[]): string {
  if (selectedAssets.length === 0) {
    return `# Selected Workspace Skills

No Skill matched this generated baseline. Add or refine Skills in the Harhub workspace, then regenerate the template.`;
  }

  return `# Selected Workspace Skills

These standard Agent Skill packages were selected from the current Harhub workspace and are copied into this directory when the template ZIP is downloaded.

${selectedAssets.map((asset) => [
    `## ${asset.displayName}`,
    "",
    asset.description,
    "",
    `- Source asset: \`${asset.id}\``,
    `- Install path: \`${asset.installPath}\``,
    `- Selection reason: ${asset.reason}`
  ].join("\n")).join("\n\n")}`;
}

function projectBrief(spec: ForgeTemplateSpec): string {
  return `# Project Brief

## Summary

${spec.summary}

## Target Users

${bullets(spec.targetUsers)}

## Goals

${bullets(spec.goals)}

## Constraints and Open Questions

${bullets(spec.constraints)}

## Success Criteria

${bullets(spec.successCriteria)}`;
}

function stackContext(spec: ForgeTemplateSpec): string {
  return `# Technical Context

Capture confirmed stack decisions and authoritative documentation here. Do not guess library versions or deployment constraints.

## Current Notes

${bullets(spec.stackNotes)}

## Before Implementation

- Confirm runtime, framework, persistence, deployment, and supported agent tools.
- Link primary documentation for each selected dependency.
- Record security, data, and environment boundaries.`;
}

function engineeringRules(spec: ForgeTemplateSpec): string {
  return `# Engineering Rules

These are standing project instructions. Review them with the team before adoption.

${bullets(spec.agentRules)}

## Default Quality Bar

- Keep changes scoped to the current goal.
- Preserve repository conventions and tenant or security boundaries.
- Add focused tests for behavioral changes.
- Verify the user-visible path, not only isolated implementation details.
- Report skipped checks and unresolved risks explicitly.`;
}

function deliveryWorkflow(spec: ForgeTemplateSpec): string {
  return `# ${spec.workflow.name}

## Objective

${spec.workflow.objective}

## Steps

${numbered(spec.workflow.steps)}

## Completion Evidence

${bullets(spec.workflow.verification)}`;
}
