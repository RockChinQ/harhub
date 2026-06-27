# Roadmap

## MVP Principle

The MVP should prove that Harhub can turn scattered harness files into managed, reusable, validated bundles without requiring a full organizational migration.

The first release should prioritize:

- Discovery.
- Cataloging.
- Basic package manifests.
- Versioned releases.
- Simple composition.
- Local CLI validation.
- Git-friendly distribution.

## Phase 0: Foundation

Purpose: establish the product model and repository foundation.

Deliverables:

- Design docs.
- Initial manifest schema.
- Example harness package.
- CLI command skeleton.
- Test fixtures for common harness files.

Exit criteria:

- A contributor can understand what Harhub is and what the first implementation should build.

## Phase 1: Inventory And Catalog

Purpose: make existing harness material visible.

Deliverables:

- Repository scanner for local paths and one Git provider.
- Discovery patterns for common harness files.
- Normalized artifact model.
- Package registration flow.
- Searchable catalog API.
- Basic web or CLI catalog view.

Exit criteria:

- Harhub can scan a group of repositories and answer "what harness assets do we have?"

## Phase 2: Package Versioning And Validation

Purpose: make harnesses publishable and trustworthy.

Deliverables:

- `harhub.yaml` manifest support.
- Package validation.
- Immutable package versions.
- Ownership and lifecycle metadata.
- Changelog and diff support.
- Initial policy checks for MCP definitions and forbidden secrets.

Exit criteria:

- A team can publish a stable harness package with a validation report.

## Phase 3: Composition And Lockfiles

Purpose: make harnesses reusable across repositories.

Deliverables:

- Bundle definitions.
- Layered package resolution.
- Basic merge strategies for rules, skills, and MCP definitions.
- Conflict and duplicate findings.
- `harhub.lock` generation.
- Bundle diff command.

Exit criteria:

- A repository can resolve org, team, and repo packages into a reproducible bundle.

## Phase 4: Distribution And Repo Adoption

Purpose: move from management to practical usage.

Deliverables:

- Materialized file generation.
- Pull request generation for harness adoption and upgrades.
- Drift detection.
- CI check integration.
- Adoption dashboard.

Exit criteria:

- Teams can adopt a bundle through a pull request and keep it current.

## Phase 5: Governance And Evaluations

Purpose: make harness changes safer at scale.

Deliverables:

- Review workflows.
- Risk classification for MCP and skills.
- Policy exceptions with expiry.
- Agent behavior evaluation runner.
- Impact analysis before package rollout.

Exit criteria:

- Risky harness changes are reviewed, tested, and auditable before broad rollout.

## MVP Boundary

Recommended first implementation:

- Local CLI.
- File-based or lightweight database catalog.
- Git repository scanner.
- Manifest validation.
- Package diffing.
- Bundle resolution for Markdown rules and simple MCP definitions.
- Lockfile output.

Defer until after the MVP:

- Full web UI.
- Advanced semantic deduplication.
- Multi-tenant enterprise RBAC.
- Hosted runtime API.
- Automated org-wide rollout.
- Large-scale evaluation infrastructure.

## Open Questions

- Should Harhub own package releases directly, or should releases always map to Git tags?
- Which agent runtimes should be supported first?
- Should generated `AGENTS.md` files be fully materialized, or should they include references to Harhub-managed sections?
- How strict should org baseline enforcement be during early adoption?
- What is the minimum useful evaluation format for harness quality?
- Which MCP risk taxonomy should be used initially?
- Should package dependencies allow version ranges, or should organizations require exact pins?
- How should Harhub represent instructions that are intentionally different across teams?

## Suggested Next Decisions

1. Pick the first consumer path: CLI-only, GitHub PR workflow, or runtime API.
2. Define the first `harhub.yaml` schema.
3. Create two example packages: an org baseline and a repo-specific pack.
4. Implement local scan and validate commands.
5. Use real team repositories as fixtures to refine the model.

