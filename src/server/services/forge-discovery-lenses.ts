export const FORGE_DISCOVERY_LENS_IDS = [
  "core",
  "job-to-be-done",
  "behavioral-evidence",
  "opportunity-solution-tree",
  "riskiest-assumption",
  "service-blueprint",
  "working-backwards",
  "prioritization",
  "system-boundary",
  "platform-ecosystem",
  "adoption-measurement",
  "delivery-reality",
  "decision-governance"
] as const;

export type ForgeDiscoveryLensId = typeof FORGE_DISCOVERY_LENS_IDS[number];

export const FORGE_DISCOVERY_AREA_IDS = [
  "audience-context",
  "outcome-evidence",
  "primary-workflow",
  "scope-priorities",
  "constraints-boundaries",
  "delivery-risks"
] as const;

export type ForgeDiscoveryAreaId = typeof FORGE_DISCOVERY_AREA_IDS[number];

interface ForgeDiscoveryLens {
  id: Exclude<ForgeDiscoveryLensId, "core">;
  useWhen: string;
  inspect: string[];
  avoid: string;
}

/*
 * These compact lenses are an original synthesis of common product discovery
 * practices. They intentionally contain routing guidance rather than complete
 * framework instructions so Forge can ask better questions without turning
 * discovery into a large questionnaire or copying external framework content.
 * The initial method survey included https://pmframe.works/ and the standard
 * frameworks named by the lens ids below.
 */
const FORGE_DISCOVERY_LENSES: ForgeDiscoveryLens[] = [
  {
    id: "job-to-be-done",
    useWhen: "The idea names a product or feature but the user's real task and desired outcome are unclear.",
    inspect: [
      "the situation that triggers the need",
      "the functional, emotional, or social outcome that matters",
      "the current workaround or alternative",
      "how the user recognizes success"
    ],
    avoid: "Do not ask for a feature wish list or require a complete job map."
  },
  {
    id: "behavioral-evidence",
    useWhen: "The requirement relies on broad claims about users, pain, demand, or frequency without concrete evidence.",
    inspect: [
      "the most recent real example",
      "current behavior rather than stated intention",
      "frequency, cost, delay, or consequence",
      "what is known, inferred, or still assumed"
    ],
    avoid: "Do not ask whether someone would hypothetically use or buy the proposed feature."
  },
  {
    id: "opportunity-solution-tree",
    useWhen: "The requirement jumps from a business goal directly to a favored solution or feature.",
    inspect: [
      "the desired measurable or observable outcome",
      "the user opportunity or unmet need behind the solution",
      "credible alternative solutions",
      "the smallest experiment that could reduce uncertainty"
    ],
    avoid: "Do not make the user build a full tree or brainstorm alternatives when the direction is already constrained."
  },
  {
    id: "riskiest-assumption",
    useWhen: "A new initiative depends on important unknowns or could waste substantial effort if one belief is false.",
    inspect: [
      "the desirability, feasibility, or viability belief whose failure would invalidate the project",
      "existing evidence and confidence",
      "a precommitted success signal",
      "the cheapest useful validation"
    ],
    avoid: "Do not enumerate every possible assumption or confuse building the product with validating it."
  },
  {
    id: "service-blueprint",
    useWhen: "The experience spans several roles, channels, handoffs, or visible and backstage processes.",
    inspect: [
      "the user's primary journey",
      "frontstage touchpoints and backstage work",
      "supporting systems or external providers",
      "handoff, waiting, failure, and recovery points"
    ],
    avoid: "Do not ask for every edge case before the primary service path is understood."
  },
  {
    id: "working-backwards",
    useWhen: "The product value is vague, stakeholders disagree on the outcome, or a major new direction needs alignment.",
    inspect: [
      "the specific customer",
      "the concrete before-and-after benefit",
      "the promise the first release must credibly make",
      "the hardest customer or delivery question behind that promise"
    ],
    avoid: "Do not ask the user to write a full press release or FAQ during Forge discovery."
  },
  {
    id: "prioritization",
    useWhen: "A backlog or broad scope already exists and the main uncertainty is what belongs in the first release.",
    inspect: [
      "the must-work workflow",
      "relative reach and impact",
      "confidence in the estimates",
      "effort, dependency, or opportunity-cost differences"
    ],
    avoid: "Do not demand invented metrics or score a single idea with no alternatives."
  },
  {
    id: "system-boundary",
    useWhen: "The project crosses systems, integrations, data domains, permissions, or operational boundaries.",
    inspect: [
      "actors and systems inside and outside the boundary",
      "the source of truth and data ownership",
      "integration and permission constraints",
      "failure isolation, recovery, and observability"
    ],
    avoid: "Do not ask for low-level architecture before the important boundaries and responsibilities are known."
  },
  {
    id: "platform-ecosystem",
    useWhen: "The product is a marketplace, platform, community, or multi-sided system.",
    inspect: [
      "the participant groups",
      "the value unit exchanged between them",
      "matching, filtering, trust, and governance",
      "cold-start and participation incentives"
    ],
    avoid: "Do not model a single-user utility as a platform merely because it has integrations."
  },
  {
    id: "adoption-measurement",
    useWhen: "Adoption, engagement, retention, or growth is central but the delivered value is not yet measurable.",
    inspect: [
      "the first behavior that demonstrates received value",
      "the recurring behavior that indicates retention",
      "the user and business outcome",
      "leading evidence rather than vanity metrics"
    ],
    avoid: "Do not force growth metrics onto internal tools or one-off workflows."
  },
  {
    id: "delivery-reality",
    useWhen: "The request concerns an existing codebase, migration, internal tool, reliability change, or constrained implementation.",
    inspect: [
      "the current system and desired change",
      "compatibility and migration constraints",
      "deployment and operating environment",
      "acceptance, rollback, and verification evidence"
    ],
    avoid: "Do not repeat greenfield product-discovery questions when the implementation target is already explicit."
  },
  {
    id: "decision-governance",
    useWhen: "The workflow is regulated, approval-heavy, high-risk, or shared by stakeholders with different authority.",
    inspect: [
      "who decides, approves, contributes, and must be informed",
      "required evidence and audit history",
      "exceptions and escalation",
      "irreversible or safety-critical actions"
    ],
    avoid: "Do not add enterprise governance to a low-risk personal workflow."
  }
];

const FORGE_DISCOVERY_LENS_ID_SET = new Set<string>(FORGE_DISCOVERY_LENS_IDS);
const FORGE_DISCOVERY_AREA_ID_SET = new Set<string>(FORGE_DISCOVERY_AREA_IDS);

export function isForgeDiscoveryLensId(value: string): value is ForgeDiscoveryLensId {
  return FORGE_DISCOVERY_LENS_ID_SET.has(value);
}

export function isForgeDiscoveryAreaId(value: string): value is ForgeDiscoveryAreaId {
  return FORGE_DISCOVERY_AREA_ID_SET.has(value);
}

export function forgeDiscoveryLensPrompt(): string {
  return JSON.stringify(FORGE_DISCOVERY_LENSES);
}

export function forgeDiscoveryAreaPrompt(): string {
  return JSON.stringify([
    {
      id: "audience-context",
      inspect: "Who has the problem, in which situation, and what they do today."
    },
    {
      id: "outcome-evidence",
      inspect: "The user or business outcome and the evidence that would demonstrate useful success."
    },
    {
      id: "primary-workflow",
      inspect: "The must-work path, important actors, inputs, outputs, and handoffs."
    },
    {
      id: "scope-priorities",
      inspect: "The first-release boundary, must-haves, exclusions, and priority tradeoffs."
    },
    {
      id: "constraints-boundaries",
      inspect: "Technical, data, integration, permission, policy, budget, or time constraints."
    },
    {
      id: "delivery-risks",
      inspect: "The assumptions, failure modes, rollout, verification, and operating realities that could change the framework."
    }
  ]);
}
