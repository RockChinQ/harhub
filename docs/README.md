# Harhub Design Docs

Harhub is a team control plane for agent harnesses: the skills, MCP servers, rules, project instructions, design guidance, architecture guidance, validation checks, and policy metadata that make agents useful and safe inside a real engineering organization.

Most teams already have this harness material, but it is spread across repositories and maintained by different people with different conventions. Harhub's purpose is to make that harness layer discoverable, reusable, versioned, validated, and governable without forcing every team to abandon the repositories where their knowledge already lives.

## Document Map

- [Problem and Gap Analysis](./problem-and-gap-analysis.md): why this category is needed and what pain it addresses.
- [Requirements](./requirements.md): product requirements, users, use cases, and non-functional needs.
- [Product Design](./product-design.md): main workflows, information architecture, and operating model.
- [Architecture](./architecture.md): system design, core services, data model, composition model, and integration strategy.
- [Roadmap](./roadmap.md): phased delivery plan, MVP boundary, and open questions.
- [Agent Skills Standard](./skill-standard.md): the external Skill format Harhub supports in the MVP.
- [SaaS MVP](./saas-mvp.md): account, session, and workspace tenant model for the local-first app.

## Working Definition

An **agent harness** is the full set of instructions, capabilities, tools, and constraints that surround an AI agent for a team, project, or workflow.

It can include:

- Agent skills and reusable task procedures.
- MCP servers, connectors, tool permissions, and runtime configuration.
- Rules and instruction documents such as `AGENTS.md`, `DESIGN.md`, `ARCHITECTURE.md`, review guides, runbooks, and coding standards.
- Prompt fragments, role definitions, templates, and workflow playbooks.
- Validation checks, examples, evaluations, and smoke tests.
- Ownership, provenance, compatibility, security, and rollout metadata.

Harhub treats these as first-class managed assets rather than scattered repository files.
