# Project And Repository Tool Map

## Project

- `harhub_projects_list`
- `harhub_project_get`
- `harhub_project_create`
- `harhub_project_connect_repository`
- `harhub_project_archive`
- `harhub_project_delete`
- `harhub_project_rotate_sync_token`
- `harhub_project_inventory`
- `harhub_project_scan`
- `harhub_project_binding_diff`
- `harhub_project_publish_binding`
- `harhub_project_create_proposal`
- `harhub_project_open_proposal`

## GitHub

- `harhub_github_status`
- `harhub_github_authorization_url`
- `harhub_github_installations_list`
- `harhub_github_repositories_list`
- `harhub_github_repository_import`
- `harhub_github_repository_connect`
- `harhub_repository_policy_set`

## Ownership Meanings

- `library`: the workspace Library asset is authoritative. Include `libraryAssetId`; optionally pin `pinnedVersion`.
- `repository`: the repository copy is an independent fork. Review its diff before publishing to the Library.
- `ignored`: retain detection but exclude the artifact from managed synchronization.

Repository mutations should go through proposals and pull requests. A Project archive does not delete its GitHub repository.
A Project deletion removes only Harhub's Project index and tracking history; it does not delete the GitHub repository or workspace Library assets.
