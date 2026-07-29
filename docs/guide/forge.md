# Forge

Forge turns a project requirement into a repository-ready agent harness built
from the current workspace Library.

## Configure Workspace AI

Workspace owners and admins configure the OpenAI-compatible provider under
**Workspace Settings → Forge AI**:

- Base URL
- Model
- API key

Use **Test connection** to call the provider with the values currently in the
form. Testing does not save the form. If an encrypted key is already stored,
leaving the key field blank tests with that stored key.

When the workspace has no usable AI configuration, `/forge` shows only a setup
notice and a link to Workspace Settings.

## Adaptive Discovery

Start a session with a short project brief. Forge records the session in the
server and gives it a semantic title and URL:

```text
/forge/:sessionId
```

The discovery agent decides which essential gaps remain, how many questions are
useful, and whether independent questions should be shown together. A sparse
brief should produce more discovery than a detailed brief. Questions prefer
component-style choices and optional short context instead of requiring a long
essay.

There is no fixed interview length. At least two essential questions must be
answered before generation can start:

- **Save answer and continue** submits the current batch and lets the agent
  decide whether another batch is necessary.
- **Answer and generate** submits the current answers, then starts generation.
- **Generate framework now** appears only after the minimum is satisfied and
  ignores the unanswered current batch.

## Resumable Operations

Follow-up and generation operations stream NDJSON progress while the canonical
session remains on the server. Refreshing the page, navigating away, or
restarting the app does not make the browser the source of truth. Persisted
operation checkpoints and generation steps allow the session to be re-entered.

Retryable provider failures and timeouts are retried automatically up to three
attempts. The first attempt is not called out in the UI; later attempts and the
last structured failure are visible for diagnosis. If automatic retries are
exhausted, the session remains resumable and exposes a manual retry.

The workspace keeps at most 12 sessions per account. Inactive sessions expire
after 30 days, list responses contain summaries, and oversized session previews
are rejected. Forge responses use private `no-store` cache headers.

Deleting a session cancels its active streams and removes the session. A Project
that was previously frozen from that session is not deleted.

## Framework Generation

Generation is shown as persisted multi-step progress:

1. Prepare project context.
2. Select relevant workspace Skills and MCP configurations.
3. Compose the harness blueprint.
4. Save the framework.

Asset selection follows the project concept rather than a fixed count. Forge
copies complete selected Skill packages and MCP configurations from object
storage into the framework; it does not regenerate their contents. The combined
selected packages are limited to 25 MB.

Only safe MCP metadata enters the AI request: the asset name and description,
server names/count, and transport. Configuration values stay in object storage
until the selected file is copied to `.harness/mcp/<slug>.json`.

The generated tree includes project context, engineering rules, workflows,
change records, copied Skills and MCP configurations, `AGENTS.md`, and `.github`
CI/sync files. Markdown files support Preview and Code modes. Skill directories
start collapsed in the tree so a large selection does not hide the rest of the
framework.

The download uses the session's semantic name. A completed session can also be
frozen as a Project without choosing a GitHub repository; connect a repository
later from the Project page.

## CLI And MCP

The CLI supports create, list, show, follow-up, generate, download, freeze, and
delete:

```bash
harhub forge create "Build an incident-response workflow"
harhub forge follow-up <session-id> --answer "Runtime=Kubernetes"
harhub forge generate <session-id>
harhub forge download <session-id>
harhub forge freeze <session-id> "Incident response"
```

The Agent Operations MCP exposes the same persistent workflow. See
[CLI](./cli) and [Agent Operations MCP](./mcp).
