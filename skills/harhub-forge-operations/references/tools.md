# Forge Tool Map

| Goal | Tool | Important input |
| --- | --- | --- |
| List sessions | `harhub_forge_sessions_list` | none |
| Read durable state | `harhub_forge_session_get` | `sessionId` |
| Start discovery | `harhub_forge_session_create` | `requirement` |
| Answer and continue | `harhub_forge_follow_up` | `sessionId`, `answers[]` |
| Generate framework | `harhub_forge_generate` | `sessionId`, optional final `answers[]` |
| Download zip | `harhub_forge_archive_download` | `sessionId`, optional `output` |
| Freeze as Project | `harhub_forge_session_freeze` | `sessionId`, `name`, optional `description` |
| Delete session | `harhub_forge_session_delete` | `sessionId`, `confirm: true` |

An answer contains `question` and `answer`, plus optional `lens`, `gap`, and `intent` when those fields were returned by Forge.

## Recovery

- On a failed or interrupted operation, read the session again before retrying.
- Treat persisted session state as authoritative; do not replay already committed answers.
- If generation is not yet allowed, continue discovery rather than inventing missing requirements.
- If an output path is rejected, use a location under `HARHUB_MCP_ALLOWED_ROOTS`.
