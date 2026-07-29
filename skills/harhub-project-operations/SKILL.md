---
name: harhub-project-operations
description: Operate Harhub Projects, GitHub repository integrations, tracked asset bindings, repository scans, ownership policies, diffs, and pull-request proposals. Use when onboarding an existing repository or changing the Skills tracked by a Harhub Project.
---

# Harhub Project Operations

Treat a Project as the durable relationship between a repository and its Harhub assets. Inspect Project and repository state before proposing changes.

## Inspect First

1. Use `harhub_projects_list` and `harhub_project_get` to select the Project.
2. Use `harhub_project_inventory` to inspect detected Skills, MCP configuration, Rules, and agent instructions.
3. For a modified Library-linked Skill, use `harhub_project_binding_diff` before deciding whether to publish it.

## Onboard An Existing GitHub Repository

1. Call `harhub_github_status`.
2. If the GitHub App is not connected, call `harhub_github_authorization_url` and give the URL to the user.
3. List installations and repositories.
4. Use `harhub_github_repository_import` to create a Project, or `harhub_github_repository_connect` for an existing Project.
5. Run `harhub_project_scan`, then read `harhub_project_inventory`.
6. Apply ownership with `harhub_repository_policy_set` only when the intended source of truth is clear.

## Change Repository Skills

Repository changes are staged as proposals:

- Initialize the Harhub structure: `kind: "bootstrap"`.
- Add Library Skills: `kind: "add-library-skills"` with every selected asset ID.
- Remove a tracked Skill: `kind: "remove-skill"` with its binding ID.

Call `harhub_project_create_proposal`, inspect the response, then call `harhub_project_open_proposal` only when the user has approved opening the pull request. Do not describe implementation details such as branch plumbing unless asked.

Publishing a repository fork to the global Library, opening a pull request,
archiving or deleting a Project, and rotating a sync token require
`confirm: true`. Project deletion removes only the Harhub index and tracking
history; it does not delete the GitHub repository or Library assets.

Read [references/tools.md](references/tools.md) for the complete operation map.
