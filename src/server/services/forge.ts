import JSZip from "jszip";

import type {
  AssetCatalog,
  AssetRecord,
  HarnessBuilderMode,
  HarnessFollowUpComponent,
  HarnessFollowUpRequest,
  HarnessFollowUpResponse,
  HarnessTemplateFile,
  HarnessTemplateAssetSelection,
  HarnessTemplateProfile,
  HarnessTemplateResponse,
  HarnessWorkspaceAssetSummary
} from "../../shared/types.js";
import { loadStoredSkill } from "./skill-packages.js";

const MAX_FOLLOW_UPS = 3;
const MAX_LIST_ITEMS = 6;
const MAX_ARCHIVE_SKILL_BYTES = 25 * 1024 * 1024;

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

export async function createHarnessFollowUp(
  input: HarnessFollowUpRequest,
  workspaceAssets: HarnessWorkspaceAssetSummary[],
  aiConfiguration?: ForgeAiConfiguration
): Promise<HarnessFollowUpResponse> {
  const fallback = createLocalHarnessFollowUp(input);
  if (!aiConfiguration || fallback.ready) return fallback;

  try {
    const payload = await requestJson({
      ...aiConfiguration,
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
  } catch {
    return {
      ...fallback,
      warning: "AI is temporarily unavailable, so Harhub used the guided fallback."
    };
  }
}

export function createLocalHarnessFollowUp(
  input: HarnessFollowUpRequest
): HarnessFollowUpResponse {
  const questions = [
    {
      question: "Who will use this project most often, and in what setting?",
      component: {
        type: "single-select",
        allowCustom: true,
        options: [
          {
            label: "Internal engineering team",
            description: "Developers collaborating in a shared repository and delivery process."
          },
          {
            label: "Operations specialists",
            description: "Operators running repeatable internal workflows and incident tasks."
          },
          {
            label: "Customer-facing teams",
            description: "Support, success, or sales teams serving external users."
          },
          {
            label: "Individual developers",
            description: "A personal workflow optimized for one primary maintainer."
          }
        ]
      } satisfies HarnessFollowUpComponent
    },
    {
      question: "Which first-version workflows must be especially clear and reliable?",
      component: {
        type: "multi-select",
        allowCustom: true,
        maxSelections: 2,
        options: [
          {
            label: "Create and review work",
            description: "Move from a request through implementation and approval."
          },
          {
            label: "Search and reuse knowledge",
            description: "Find the right context or reusable asset quickly."
          },
          {
            label: "Automate a repeated task",
            description: "Turn a manual routine into a consistent agent workflow."
          },
          {
            label: "Publish and share results",
            description: "Package outputs for reliable use by another person or system."
          }
        ]
      } satisfies HarnessFollowUpComponent
    },
    {
      question: "What outcome would prove this project is successful?",
      component: {
        type: "text",
        placeholder: "Example: A release manager can prepare a reviewed release in under 15 minutes…",
        options: []
      } satisfies HarnessFollowUpComponent
    }
  ];
  const next = questions[input.answers.length];

  if (!next || input.answers.length >= MAX_FOLLOW_UPS) {
    return { mode: "local-fallback", ready: true };
  }

  return {
    mode: "local-fallback",
    ready: false,
    question: next.question,
    component: next.component
  };
}

export async function createHarnessTemplate(
  input: HarnessFollowUpRequest,
  workspaceAssets: HarnessWorkspaceAssetSummary[],
  aiConfiguration?: ForgeAiConfiguration
): Promise<HarnessTemplateResponse> {
  const fallbackSpec = createLocalTemplateSpec(input, workspaceAssets);
  if (!aiConfiguration) return buildHarnessTemplate(fallbackSpec, "local-fallback", workspaceAssets);

  try {
    const payload = await requestJson({
      ...aiConfiguration,
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
    const spec = sanitizeTemplateSpec(payload, fallbackSpec);
    if (!spec.selectedAssets.some((selection) =>
      workspaceAssets.some((asset) => asset.id === selection.assetId)
    )) {
      spec.selectedAssets = fallbackSpec.selectedAssets;
    }
    return buildHarnessTemplate(spec, "llm", workspaceAssets);
  } catch {
    return {
      ...buildHarnessTemplate(fallbackSpec, "local-fallback", workspaceAssets),
      warning: "AI is temporarily unavailable, so Harhub generated a reviewable fallback template."
    };
  }
}

export function buildHarnessTemplate(
  spec: ForgeTemplateSpec,
  mode: HarnessBuilderMode,
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
    mode,
    generatedAt: new Date().toISOString(),
    profile,
    selectedAssets,
    files
  };
}

function createLocalTemplateSpec(
  input: HarnessFollowUpRequest,
  workspaceAssets: HarnessWorkspaceAssetSummary[]
): ForgeTemplateSpec {
  const firstLine = input.requirement.split(/\r?\n/).find((line) => line.trim())?.trim() ?? "Project";
  const name = projectNameFromRequirement(firstLine);
  const answers = input.answers.map((item) => item.answer);

  return {
    name,
    summary: input.requirement.trim(),
    targetUsers: answers[0] ? [answers[0]] : ["Define the primary users"],
    goals: [input.requirement.trim()],
    constraints: input.answers.length
      ? input.answers.map((item) => `${item.question} ${item.answer}`)
      : ["Confirm scope, ownership, and delivery constraints before implementation"],
    successCriteria: answers[2] ? [answers[2]] : ["Agree on an observable success signal"],
    stackNotes: ["Confirm the technical stack and supported agent tools during planning"],
    agentRules: [
      "Read the project brief and delivery workflow before changing code",
      "Keep implementation aligned with the stated first-version goal",
      "Turn missing product details into explicit open questions",
      "Run relevant checks and record evidence before claiming completion"
    ],
    selectedAssets: selectLocalAssets(input, workspaceAssets),
    workflow: {
      name: "Plan, implement, and verify",
      objective: answers[1] ?? "Deliver the smallest reliable version of the requested project",
      steps: [
        "Confirm the current goal and unresolved questions",
        "Inspect the repository and identify the smallest coherent change",
        "Implement the change with focused tests",
        "Run verification and update the harness changelog"
      ],
      verification: [
        "Relevant automated checks pass",
        "The primary user workflow is exercised end to end",
        "Known risks and skipped checks are recorded"
      ]
    }
  };
}

function sanitizeTemplateSpec(
  payload: Record<string, unknown>,
  fallback: ForgeTemplateSpec
): ForgeTemplateSpec {
  const workflow = isRecord(payload.workflow) ? payload.workflow : {};
  return {
    name: readString(payload.name) ?? fallback.name,
    summary: readString(payload.summary) ?? fallback.summary,
    targetUsers: listOrFallback(payload.targetUsers, fallback.targetUsers),
    goals: listOrFallback(payload.goals, fallback.goals),
    constraints: listOrFallback(payload.constraints, fallback.constraints),
    successCriteria: listOrFallback(payload.successCriteria, fallback.successCriteria),
    stackNotes: listOrFallback(payload.stackNotes, fallback.stackNotes),
    agentRules: listOrFallback(payload.agentRules, fallback.agentRules),
    selectedAssets: readAssetSelections(payload.selectedAssets, fallback.selectedAssets),
    workflow: {
      name: readString(workflow.name) ?? fallback.workflow.name,
      objective: readString(workflow.objective) ?? fallback.workflow.objective,
      steps: listOrFallback(workflow.steps, fallback.workflow.steps),
      verification: listOrFallback(workflow.verification, fallback.workflow.verification)
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

function selectLocalAssets(
  input: HarnessFollowUpRequest,
  assets: HarnessWorkspaceAssetSummary[]
): Array<{ assetId: string; reason: string }> {
  const requestText = [
    input.requirement,
    ...input.answers.flatMap((item) => [item.question, item.answer])
  ].join(" ").toLowerCase();
  const tokens = new Set(requestText.match(/[a-z0-9][a-z0-9-]{2,}/g) ?? []);
  const ranked = assets.map((asset, index) => {
    const searchable = `${asset.name} ${asset.displayName} ${asset.description}`.toLowerCase();
    const score = Array.from(tokens).reduce(
      (total, token) => total + (searchable.includes(token) ? 1 : 0),
      0
    );
    return { asset, index, score };
  }).sort((left, right) => right.score - left.score || left.index - right.index);
  const matched = ranked.filter((item) => item.score > 0);
  const selected = (matched.length ? matched : ranked).slice(0, 3);

  return selected.map(({ asset, score }) => ({
    assetId: asset.id,
    reason: score > 0
      ? "Matches terms in the project requirement and should be reviewed for this baseline."
      : "Available in this workspace; review its fit before adopting the generated baseline."
  }));
}

function readAssetSelections(
  value: unknown,
  fallback: Array<{ assetId: string; reason: string }>
): Array<{ assetId: string; reason: string }> {
  if (!Array.isArray(value)) return fallback;
  const selections = value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const assetId = readString(item.assetId);
    const reason = readString(item.reason);
    return assetId && reason ? [{ assetId, reason }] : [];
  }).slice(0, MAX_LIST_ITEMS);
  return selections.length ? selections : fallback;
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

  if (!response.ok) throw new Error(`AI request failed with HTTP ${response.status}`);
  const body = await response.json() as unknown;
  const content = extractMessageContent(body);
  if (!content) throw new Error("AI response did not contain JSON text");
  const parsed = JSON.parse(stripCodeFence(content)) as unknown;
  if (!isRecord(parsed)) throw new Error("AI response was not a JSON object");
  return parsed;
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

function readStringList(value: unknown, limit = MAX_LIST_ITEMS): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(readString).filter((item): item is string => Boolean(item))))
    .slice(0, limit);
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

function listOrFallback(value: unknown, fallback: string[]): string[] {
  const items = readStringList(value);
  return items.length ? items : fallback;
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

function projectNameFromRequirement(value: string): string {
  const withoutLead = value
    .replace(/^(build|create|develop|make|implement)\s+(?:an?\s+)?/i, "")
    .replace(/[。.!?？].*$/, "")
    .trim();
  const englishName = withoutLead.split(/\b(?:that|which|who|where|for)\b/i)[0]?.trim();
  const words = englishName?.split(/\s+/).filter(Boolean) ?? [];
  if (words.length > 0 && words.every((word) => /^[\w'-]+$/.test(word))) {
    return words.slice(0, 6).join(" ").slice(0, 48);
  }
  return withoutLead.slice(0, 32).trim() || "Project Harness";
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
