# Market Positioning

## Category

Harhub should be positioned as **team AI harness management**.

An AI harness is the operational layer around coding agents: Skills, MCP servers, tool permissions, Cursor rules, Codex `AGENTS.md`, GitHub Copilot instructions, prompt files, review rubrics, workflow playbooks, validation checks, and policy metadata.

The product should not be positioned as only a Skill marketplace or asset library. That category is too small and too likely to be absorbed by individual agent vendors.

## Market Thesis

Engineering teams are adopting multiple agent surfaces at once: Cursor, Claude Code, Codex, GitHub Copilot, ChatGPT, CI agents, internal CLIs, and MCP-backed workflows. Each surface has its own configuration model, but the underlying organizational problem is shared:

- What instructions and tools should agents use?
- Who owns them?
- Which versions are approved?
- Which repositories consume them?
- Which MCP tools are risky?
- What changed between versions?
- Can a team roll out, audit, and roll back a harness update?

Harhub should own the cross-tool management layer rather than competing with any single agent runtime.

## Buyer Pain

The strongest pain is not storage. It is operational control:

- Platform teams need consistent agent behavior across repositories.
- Security teams need visibility into MCP access, tool scopes, secrets, and risky automation.
- Engineering managers need ownership, lifecycle state, and adoption signals.
- Developers need a trusted catalog instead of copying stale rules from random repos.
- AI champions need a way to distribute good harness patterns without manually opening dozens of pull requests.

## Product Boundary

Harhub should manage harness assets that other tools consume. It should not become a general-purpose agent runtime.

In scope:

- Registry and catalog.
- Validation and policy checks.
- Ownership, lifecycle, and review state.
- Versioning, releases, and rollback.
- Target-specific distribution.
- Usage and adoption analytics.

Out of scope for the near term:

- Running arbitrary long-lived MCP servers.
- Replacing IDE agent products.
- Replacing Git as the source of truth.
- Automatically rewriting every repository without review.

## MVP Wedge

The current MVP should remain Skills-first:

- Skills have a concrete package shape.
- Skills can be uploaded, parsed, validated, previewed, and installed.
- Skills create a measurable activation loop.
- Skills are easier to explain than full harness composition.

The product copy should still make clear that Skills are the first asset type, not the final product category.

## Expansion Path

After the Skills loop is proven, expand in this order:

1. **Read-only harness inventory**: discover `.cursor/rules`, `AGENTS.md`, Copilot instructions, prompt files, and MCP config files across repos.
2. **Governance metadata**: owner, lifecycle, compatibility, risk, review status, and approval history for all asset types.
3. **MCP governance**: server registry, tool scopes, required env vars, risk labels, and policy checks.
4. **Cross-tool distribution**: render approved harness packages into Codex, Claude Code, Cursor, Copilot, CI, and repository targets.
5. **Composition and lockfiles**: resolve org baseline, team pack, repo pack, and workflow-specific pack with explicit precedence.
6. **Evaluation loop**: validate harness changes against representative tasks before broad rollout.

## Positioning Statement

Harhub is a control plane for team-managed AI harnesses. It helps engineering organizations discover, validate, govern, version, and distribute the Skills, MCP servers, rules, and instructions that make agents reliable across tools and repositories.
