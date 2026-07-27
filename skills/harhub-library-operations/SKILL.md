---
name: harhub-library-operations
description: Inspect and manage Harhub workspace Library assets and Skills through the Harhub MCP server. Use when an agent needs to list, inspect, validate, upload, edit, version, download, share, unshare, delete, or install Harhub Skills.
---

# Harhub Library Operations

Use Harhub as the source of truth for shared Agent Skills. Read the current asset before changing it, and report asset IDs and versions after mutations.

## Workflow

1. Call `harhub_whoami` when the active workspace is not already established.
2. Discover candidates with `harhub_assets_list`; pass `kind: "skill"` for Skills.
3. Inspect the selected record with `harhub_asset_get`.
4. Perform the requested operation.
5. Re-read or revalidate the asset and report the resulting version, health, and share state.

Do not pass access tokens in tool arguments. The MCP server obtains credentials from its environment or the saved Harhub CLI login.

## Choose An Operation

- Upload local Skill directories: `harhub_skills_upload_paths`.
- Upload a prepared zip: `harhub_asset_upload_archive`.
- Replace one file and create a new immutable version: `harhub_skill_edit_file`.
- Validate one asset or the workspace: `harhub_asset_revalidate`.
- Download a version: `harhub_asset_download`. Do not set `overwrite: true` unless replacement is intended.
- Create a public link: `harhub_asset_share`.
- Revoke a public link: `harhub_asset_unshare`.
- Install a shared Skill locally: `harhub_public_skill_install`.
- Delete an asset: `harhub_asset_delete`.

Unsharing, installing, and deleting require `confirm: true`. Ask for confirmation if the user has not explicitly requested the action.

Read [references/tools.md](references/tools.md) for the exact tool map and common recovery paths.
