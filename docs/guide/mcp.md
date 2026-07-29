# Agent Operations MCP

Harhub includes a local stdio MCP server that exposes the authenticated workspace operations available in the CLI. It covers Library Skills and MCP configurations, Projects, GitHub repository integration, and Forge sessions.

## Install And Authenticate

Install the beta package and authenticate once:

```bash
npm install --global harhub@beta
harhub login
```

The MCP server reuses the server, access token, and workspace saved by `harhub login`. Add it to an MCP host:

```json
{
  "mcpServers": {
    "harhub": {
      "command": "harhub-mcp"
    }
  }
}
```

For a non-interactive or self-hosted environment, configure the MCP process:

```json
{
  "mcpServers": {
    "harhub": {
      "command": "harhub-mcp",
      "env": {
        "HARHUB_API_URL": "https://harhub.example.com",
        "HARHUB_WORKSPACE_ID": "workspace-id",
        "HARHUB_TOKEN": "access-token",
        "HARHUB_MCP_ALLOWED_ROOTS": "/workspace"
      }
    }
  }
}
```

`HARHUB_MCP_ALLOWED_ROOTS` is a platform path-delimited list. Local uploads and downloads cannot escape those roots. When omitted, the server only allows its current working directory.

## Safety Model

- Read tools are annotated as read-only.
- Uploads, edits, scans, generation, and proposal creation are mutations.
- Delete, archive, unshare, sync-token rotation, Library publication, pull-request opening, and local Skill installation require `confirm: true`.
- Downloads never replace an existing file unless `overwrite: true` is supplied.
- Credentials are resolved by the server and are never accepted as tool arguments.

## Tool Groups

### Library

Use `harhub_assets_list` and `harhub_asset_get` to inspect state. Upload local
Skills with `harhub_skills_upload_paths`, upload a JSON MCP configuration with
`harhub_mcp_upload`, edit an immutable Skill through `harhub_skill_edit_file`,
or download retained versions with `harhub_asset_download`. Validation and
deletion apply to both managed asset kinds; public sharing and installation are
Skill-only.

### Projects And GitHub

Project tools cover creation, repository connection, inventory scans, ownership
policies, fork diffs, Library publication, staged Skill/MCP proposals, and
pull-request opening. Use `add-library-mcps` or `remove-mcp` with
`harhub_project_create_proposal` to deliver MCP binding changes through GitHub.
GitHub tools cover authorization, installations, accessible repositories,
import, and connection.

### Forge

Forge tools create and resume persistent sessions, submit adaptive follow-up answers, consume the full NDJSON generation stream, download the framework archive, freeze a session as a Project, and delete a session.

## Agent Skills

This repository includes three installable Skills under `skills/`:

- `harhub-library-operations`
- `harhub-project-operations`
- `harhub-forge-operations`

They teach an agent how to sequence the MCP tools, confirm high-impact actions, and recover from interrupted Forge operations.

Install all three from the repository:

```bash
npx skills add RockChinQ/harhub --skill harhub-library-operations harhub-project-operations harhub-forge-operations
```
