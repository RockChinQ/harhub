# Requirements

## Goals

Harhub should help teams manage agent harnesses across repositories and workflows.

Primary goals:

- Discover existing harness artifacts across repositories.
- Normalize inconsistent files into a common model.
- Catalog harnesses by purpose, owner, maturity, compatibility, and adoption.
- Compose multiple harness packages into a resolved bundle.
- Detect duplication, drift, policy violations, and instruction conflicts.
- Version harness packages and support safe upgrades.
- Distribute harness bundles to repositories, agents, CLIs, IDEs, and CI systems.
- Validate harness changes before they affect teams.

## Non-Goals For The First Version

The first version should not try to be a full agent runtime. It should manage harnesses that other agents and tools consume.

Initial non-goals:

- Replacing Git as the source of truth for every artifact.
- Hosting arbitrary long-running MCP servers.
- Building a general prompt IDE.
- Running production agents on behalf of all teams.
- Automatically rewriting every repository's rules without review.
- Solving all organization knowledge management problems.

## Users

### Platform Owner

Owns the organization-wide agent platform and wants consistent defaults, visibility, governance, and adoption tracking.

Needs:

- Org baseline harnesses.
- Policy and permission management.
- Impact analysis before changes.
- Adoption and drift dashboards.

### Team Lead

Owns a group of repositories and wants reusable team standards without manually copying files.

Needs:

- Team-level harness packages.
- Repo assignment and override controls.
- Upgrade recommendations.
- Conflict reports.

### Agent Harness Author

Creates skills, MCP integration guides, rules, and workflow playbooks.

Needs:

- Clear package structure.
- Preview and validation.
- Versioning and publishing.
- Usage metrics and feedback.

### Repository Maintainer

Wants agents to behave correctly inside a specific repository.

Needs:

- Repo-specific composition.
- Generated or linked harness files.
- Local override support.
- CI checks that catch drift or broken harness updates.

### Reviewer, Security, Or Compliance Owner

Reviews risky harness changes, especially MCP access, secrets handling, and agent autonomy.

Needs:

- Review workflows.
- Permission diffs.
- Audit logs.
- Policy rules and exceptions.

## Harness Artifact Types

Harhub should support these artifact types:

- **Rules**: natural language instructions, coding standards, design guidelines, architecture guidance, review practices, and operational constraints.
- **Skills**: reusable task procedures with instructions, references, scripts, examples, and allowed tools.
- **MCP definitions**: server metadata, installation instructions, tool descriptions, scopes, environment requirements, and risk classification.
- **Templates**: prompt fragments, PR descriptions, review rubrics, changelog formats, issue triage flows, and generated doc structures.
- **Validation assets**: examples, task fixtures, tests, golden outputs, lint rules, and evaluation scenarios.
- **Metadata**: owner, team, maturity, tags, compatibility, dependencies, provenance, and lifecycle state.

## Functional Requirements

### Discovery And Ingestion

- Scan configured repositories for harness files and manifests.
- Detect common filenames such as `AGENTS.md`, `DESIGN.md`, `ARCHITECTURE.md`, `ARCHITECHTURE.md`, `.cursor/rules`, `.codex/skills`, `.mcp.json`, and project-specific harness directories.
- Allow manual registration of a harness package.
- Preserve source provenance: repository, branch, commit, path, author, and review status.
- Normalize discovered artifacts into a common internal model.

### Catalog And Search

- Provide a searchable catalog of harness packages and artifacts.
- Filter by team, domain, language, framework, MCP server, maturity, owner, compatibility, and adoption.
- Show package README, changelog, dependency graph, validation status, and usage.
- Surface duplicate or similar rules and skills.

### Versioning And Releases

- Support semantic versions for harness packages.
- Store immutable released package versions.
- Support prerelease, deprecated, archived, and experimental states.
- Generate diffs between versions.
- Track consumers pinned to each version.
- Support lockfiles for reproducible harness resolution.

### Composition

- Compose multiple packages into a resolved harness bundle for a repo, team, workflow, or agent profile.
- Support layering, for example org baseline plus domain pack plus repo pack.
- Detect duplicate, conflicting, stale, or missing artifacts.
- Apply explicit precedence rules.
- Emit a resolved manifest and materialized files when needed.

### Distribution And Sync

- Provide a CLI for pulling, validating, and materializing harness bundles.
- Support CI checks for drift, policy violations, and invalid lockfiles.
- Support pull request generation for harness upgrades.
- Support runtime retrieval through an API.
- Allow repos to choose reference mode, materialized mode, or hybrid mode.

### Governance And Policy

- Support ownership and review requirements per package and artifact type.
- Classify MCP tools and skills by risk.
- Require approvals for risky permissions or organization-wide rollout.
- Prevent secrets from being stored in harness packages.
- Log changes, approvals, policy exceptions, and distribution events.

### Validation

- Run structural validation on manifests and package files.
- Run policy validation on MCP permissions, tool access, and rule requirements.
- Run composition validation to catch conflicts and unresolved dependencies.
- Run optional agent behavior evaluations against representative tasks.
- Publish validation reports as release gates and CI feedback.

### Observability

- Track package adoption, version drift, validation failures, and policy exceptions.
- Show which repos would be affected by a package update.
- Expose audit trails for compliance and incident review.

## Non-Functional Requirements

- **Incremental adoption**: teams can start by indexing existing files before changing workflows.
- **Git-friendly**: source content remains reviewable in Git.
- **Reproducible**: resolved bundles are pinned by version and commit.
- **Secure by default**: no secrets in packages, explicit MCP permissions, audit logs.
- **Low-friction authoring**: plain Markdown and simple manifests should be enough for most use cases.
- **Extensible**: support new agent runtimes, IDEs, and artifact types over time.
- **Enterprise-ready**: RBAC, SSO-ready identity model, audit logs, retention controls, and policy hooks.
- **Fast feedback**: common validation should complete quickly enough for normal pull request workflows.

## Success Metrics

- Percent of repositories indexed by Harhub.
- Percent of repositories using a resolved harness bundle.
- Duplicate rule and skill reduction over time.
- Number of policy violations prevented before merge.
- Mean time to roll out an org baseline update.
- Number of harness upgrades completed through generated pull requests.
- Validation pass rate for released harness packages.
- User-reported agent task success before and after harness adoption.

