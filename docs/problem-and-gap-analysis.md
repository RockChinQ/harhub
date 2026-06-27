# Problem and Gap Analysis

## Summary

Teams are rapidly creating agent harness material across many repositories: `AGENTS.md` files, local coding rules, MCP setup notes, prompt snippets, skills, design docs, architecture guides, review rubrics, and workflow-specific instructions. These assets are often valuable, but they are usually maintained as local repo knowledge instead of shared organizational infrastructure.

The result is fragmentation. Two repositories may solve the same harness problem differently. A high-quality skill may exist but remain invisible. An unsafe MCP permission pattern may be copied between projects. A team may improve its agent rules, but other teams do not know, cannot compare, and cannot upgrade safely.

Harhub fills this gap by becoming a registry, composition engine, validation layer, and distribution system for agent harnesses.

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

## Product Thesis

Agent harnesses will become shared organizational infrastructure. The winning system will manage them like a mix of package registry, policy engine, docs catalog, configuration compiler, and evaluation platform.

Harhub should be that system.

