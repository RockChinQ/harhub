# Product Design

## Product Shape

Harhub should feel like a harness registry and control plane, not a generic document manager.

The central objects are:

- **Packages**: versioned units of reusable harness content.
- **Artifacts**: files or structured definitions inside packages.
- **Profiles**: target contexts such as frontend repo, backend service, infra repo, security review, design implementation, or incident response.
- **Bundles**: resolved compositions of packages for a target profile.
- **Assignments**: links between bundles and repos, teams, agents, or workflows.
- **Findings**: duplication, conflicts, policy violations, validation failures, and drift.

## Information Architecture

### Catalog

The catalog lists harness packages with:

- Name and description.
- Owner and maintainer team.
- Type: rules, skill pack, MCP pack, workflow pack, baseline, composite.
- Tags: language, framework, domain, runtime, agent, risk.
- Version and lifecycle state.
- Validation status.
- Adoption count.

### Package Detail

Each package page should show:

- Overview and intended use.
- Included artifacts.
- Compatibility metadata.
- Dependencies.
- Version history.
- Validation reports.
- Consumers.
- Open findings.
- Ownership and review policy.

### Bundle Detail

Each bundle page should show:

- Target team, repo, profile, or workflow.
- Selected packages and pinned versions.
- Effective artifact list.
- Conflict decisions and overrides.
- Generated files.
- Lockfile.
- Validation status.
- Upgrade recommendations.

### Repository View

Each repository view should show:

- Current harness source files found in the repo.
- Assigned bundle, if any.
- Drift from the resolved bundle.
- Local overrides.
- MCP permissions required by the repo harness.
- Recommended upgrades or deduplication actions.

## Core Workflows

### 1. Discover Existing Harnesses

1. A platform owner connects Git repositories or points Harhub at a repository group.
2. Harhub scans for known harness files and manifests.
3. Harhub groups discovered artifacts into candidate packages.
4. Owners review the candidates, add metadata, and publish them to the catalog.

Outcome: the organization gets an inventory without demanding immediate migration.

### 2. Publish A Harness Package

1. An author creates or updates a harness package in Git.
2. The package includes a manifest, docs, artifacts, and optional validation fixtures.
3. CI runs Harhub validation.
4. Reviewers approve the package release.
5. Harhub indexes the immutable version and makes it available for composition.

Outcome: reusable harnesses have owners, versions, and validation status.

### 3. Compose A Repo Harness

1. A maintainer selects a target repo and profile.
2. Harhub recommends packages based on language, framework, team, existing files, and org policy.
3. The maintainer chooses packages and versions.
4. Harhub resolves dependencies, applies precedence, and detects conflicts.
5. Harhub emits a bundle lockfile and generated files or runtime references.

Outcome: the repo gets a coherent harness without manual copy-paste.

### 4. Detect And Remove Redundancy

1. Harhub compares rule text, skill purposes, MCP definitions, and metadata.
2. Similar artifacts are grouped as potential duplicates.
3. Maintainers choose a canonical artifact or keep variants with documented reasons.
4. Harhub suggests package consolidation and migration pull requests.

Outcome: teams converge on shared harnesses where it makes sense while preserving justified local differences.

### 5. Roll Out An Org Baseline

1. A platform owner publishes a baseline package.
2. Harhub shows affected repos and incompatible packages.
3. Teams test the baseline against their repo profiles.
4. Harhub opens upgrade pull requests or updates bundle assignments.
5. Dashboards track adoption and exceptions.

Outcome: org-level agent standards can be rolled out safely and visibly.

### 6. Review A Risky Harness Change

1. A package update adds a new MCP server or expands tool permissions.
2. Harhub classifies the change as risky.
3. Security reviewers see a permission diff, affected consumers, and validation results.
4. The change is approved, rejected, or allowed behind a scoped exception.

Outcome: harness capabilities are governed before they reach agents.

## Harness Package Structure

Harhub should support plain files, but a structured package should look like this:

```text
harness/
  harhub.yaml
  README.md
  rules/
    AGENTS.md
    DESIGN.md
    ARCHITECTURE.md
  skills/
    code-review/
      SKILL.md
      references/
  mcp/
    github.yaml
  evals/
    fixtures/
    tasks.yaml
```

Example manifest:

```yaml
apiVersion: harhub.io/v1
kind: HarnessPackage
metadata:
  name: frontend-react-standard
  owner: web-platform
  description: Standard harness for React frontend repositories.
  tags: [frontend, react, typescript]
spec:
  version: 1.0.0
  maturity: stable
  compatibility:
    agents: [codex, claude-code]
    languages: [typescript]
    frameworks: [react, nextjs]
  artifacts:
    - type: rule
      path: rules/AGENTS.md
      mergeStrategy: append-section
    - type: rule
      path: rules/DESIGN.md
      mergeStrategy: append-section
    - type: skill
      path: skills/code-review/SKILL.md
    - type: mcp
      path: mcp/github.yaml
  dependencies:
    - name: org-security-baseline
      version: ^1.2.0
  policy:
    reviewers: [web-platform, security]
    risk: medium
```

## Composition Model

Harness composition should be explicit and explainable.

Recommended default layers:

1. Organization baseline.
2. Domain or function pack.
3. Team pack.
4. Repository pack.
5. Workflow pack.
6. Local override, if policy allows it.

Every resolved bundle should include:

- Input packages and versions.
- Effective artifact order.
- Applied merge strategies.
- Conflict decisions.
- Policy exceptions.
- Output files or runtime references.
- Validation result.

## Distribution Modes

### Reference Mode

The repository stores a small `harhub.lock` or `harhub.yaml` that points to a resolved bundle in Harhub.

Best for:

- Agent runtimes that can fetch harnesses at startup.
- Teams that want minimal generated files.
- Centralized policy enforcement.

### Materialized Mode

Harhub writes generated files such as `AGENTS.md`, `DESIGN.md`, `ARCHITECTURE.md`, and MCP config into the repository.

Best for:

- Tools that only read local files.
- Teams that want all agent instructions visible in Git.
- Offline or restricted environments.

### Hybrid Mode

The repository keeps critical generated files plus a lockfile that records Harhub provenance.

Best for:

- Gradual adoption.
- Mixed agent tooling.
- Teams that want local transparency with central management.

## UX Principles

- Show provenance everywhere.
- Make the effective harness easy to inspect.
- Prefer recommendations over forced migration in early adoption.
- Treat conflicts as reviewable decisions, not hidden implementation details.
- Make risky capability changes visually obvious.
- Keep package authoring friendly to Markdown and Git.

