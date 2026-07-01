# Problem and Gap Analysis

## Summary

Teams are rapidly creating agent harness material across many repositories: `AGENTS.md` files, local coding rules, MCP setup notes, prompt snippets, skills, design docs, architecture guides, review rubrics, and workflow-specific instructions. These assets are often valuable, but they are usually maintained as local repo knowledge instead of shared organizational infrastructure.

The result is fragmentation. Two repositories may solve the same harness problem differently. A high-quality skill may exist but remain invisible. An unsafe MCP permission pattern may be copied between projects. A team may improve its agent rules, but other teams do not know, cannot compare, and cannot upgrade safely.

Harhub fills this gap by becoming a registry, governance layer, validation layer, composition engine, and distribution system for agent harnesses.

The market should not be framed as "a place to upload Skills." That is too narrow and easy for individual agent vendors to subsume. The stronger category is **team AI harness management**: a cross-tool control plane for the context, tools, rules, and policies that engineering teams want agents to follow.

## Current Gap

Agent harnesses are currently managed as files, conventions, or tribal knowledge. That creates several problems:

- **No inventory**: teams do not know what skills, MCP tools, and rules already exist.
- **No quality signal**: it is hard to distinguish battle-tested harnesses from experiments.
- **No ownership model**: important instructions may have no clear maintainer, reviewer, or lifecycle.
- **No versioning contract**: harness changes can silently alter agent behavior across time.
- **No dependency graph**: teams cannot see which repos use which rules, skills, MCP servers, or prompt fragments.
- **No redundancy control**: similar rules are repeatedly written in slightly different forms.
- **No conflict detection**: one rule may say to prefer a framework or workflow while another forbids it.
- **No policy boundary**: MCP servers and agent capabilities may be enabled without consistent review.
- **No rollout mechanism**: there is no clean path to publish a recommended org baseline to many repositories.
- **No validation loop**: harness changes are rarely tested against real tasks before adoption.

## Why Existing Tools Are Not Enough

Git repositories are good sources of truth, but they are poor cross-repo discovery systems. Package registries are good at distributing code, but they usually do not understand rule precedence, prompt composition, MCP permissions, or agent behavior validation. Documentation portals are good at human reading, but they do not produce executable harness bundles.

Harhub should complement those systems:

- Keep source material in Git where teams already review and maintain it.
- Index, normalize, and understand harness artifacts across repositories.
- Provide a curated catalog and dependency graph.
- Compose harnesses into resolved bundles for specific teams, repos, and workflows.
- Validate harnesses with tests, policy checks, and agent behavior evaluations.
- Distribute bundles back into repos, CLIs, IDEs, CI systems, and agent runtimes.

It should also complement vendor-specific AI admin panels. Cursor, GitHub Copilot, Claude, Codex, and ChatGPT can each manage parts of their own ecosystem, but teams using multiple tools still need a neutral layer that can:

- Inventory harness assets across competing agent surfaces.
- Normalize ownership, lifecycle, risk, and approval metadata.
- Translate approved assets into target-specific formats.
- Keep source-of-truth files in Git while providing SaaS governance and auditability.
- Detect drift between approved harness packages and what repositories actually run.

## Core Opportunity

The opportunity is to create a shared harness layer between raw repository files and agent execution.

That layer should answer questions such as:

- What harnesses exist in our organization?
- Which harnesses are canonical for frontend, backend, infra, security, data, or design work?
- Which repos use this rule or MCP server?
- Which skills are redundant, stale, unsafe, or high quality?
- What changes when we upgrade from harness version `1.4.0` to `1.5.0`?
- Can this repo safely adopt the org baseline plus its domain-specific pack?
- Which instructions conflict, and which one wins?
- Did this harness update improve or degrade agent performance on representative tasks?

## Initial Wedge

The first implementation should stay Skills-first because Skills have a clearer package boundary than generic rules:

- A Skill can be uploaded as a directory or zip.
- A Skill has standard metadata in `SKILL.md`.
- A Skill can be validated for structure, links, naming, duplicate content, and secret-like patterns.
- A Skill can be previewed, installed, downloaded, and reused.

This wedge is useful only if it proves the broader control-plane loop:

1. Teams bring harness assets into Harhub.
2. Harhub validates and classifies them.
3. Owners improve metadata and trust signals.
4. Other users discover and reuse them.
5. Admins gain enough visibility to justify governance and distribution workflows.

If users mostly ask for Cursor rules, MCP registry, Copilot instructions, or `AGENTS.md` synchronization instead of Skill storage, that is not a failure. It is a signal to widen the managed asset types while keeping the same control-plane thesis.

## Product Thesis

Agent harnesses will become shared organizational infrastructure. The winning system will manage them like a mix of package registry, policy engine, docs catalog, configuration compiler, and evaluation platform.

Harhub should be that system.
