# Library Tool Map

| Goal | Tool | Important input |
| --- | --- | --- |
| Identify account/workspace | `harhub_whoami` | none |
| List assets | `harhub_assets_list` | optional `kind` |
| Inspect one asset | `harhub_asset_get` | `asset` ID, name, or slug |
| Upload discovered Skills | `harhub_skills_upload_paths` | `paths[]`, optional `share` |
| Upload archive | `harhub_asset_upload_archive` | `archive`, optional `share` |
| Upload MCP configuration | `harhub_mcp_upload` | `file`, `name`, `description` |
| Edit package file | `harhub_skill_edit_file` | `asset`, `file`, complete `content` |
| Revalidate | `harhub_asset_revalidate` | optional `asset` |
| Download | `harhub_asset_download` | `asset`, optional `version`, `output` |
| Share | `harhub_asset_share` | `asset` |
| Unshare | `harhub_asset_unshare` | `asset`, `confirm: true` |
| Install share | `harhub_public_skill_install` | `reference`, `confirm: true` |
| Delete | `harhub_asset_delete` | `asset`, `confirm: true` |

## Recovery

- If authentication or workspace resolution fails, ask the user to run `harhub login`, or configure `HARHUB_TOKEN`, `HARHUB_WORKSPACE_ID`, and optional `HARHUB_API_URL` for the MCP process.
- If a local path is rejected, keep it inside the server's `HARHUB_MCP_ALLOWED_ROOTS`.
- If an upload is invalid, fix the reported validation errors locally and upload again.
- For MCP JSON, use an `mcpServers` or `servers` map and replace literal
  secret-like environment values with runtime placeholders.
- If a download already exists, choose a new output path unless the user explicitly wants replacement.
