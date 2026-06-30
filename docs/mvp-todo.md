# MVP Metrics And TODO

Harhub's MVP strategy is **open-source distribution plus a hosted SaaS operation**. The product should stay narrowly focused on Agent Skills for now: make skills trustworthy, searchable, previewable, and reusable before expanding into rules, MCP governance, bundle composition, or PR automation.

## Target Shape

Harhub should launch as two connected surfaces:

- **Open-source project**: a self-hostable TypeScript app and CLI that validates, catalogs, and manages Agent Skills without inventing a custom skill standard.
- **Hosted SaaS**: a free cloud workspace for teams that do not want to run storage, auth, and catalog infrastructure themselves.

The hosted MVP is free-only at launch. Instead of charging immediately, it should protect operating cost with clear usage limits and use over-limit states as demand signals for a future paid plan.

## Current Product Read

What exists in the code today:

- **Fullstack app**: Express API, Vite/React frontend, shared TypeScript types, and a CLI entry point.
- **Authentication**: local email/password accounts, bearer-token sessions, profile updates, password changes, and logout.
- **Tenant model**: workspaces, memberships, workspace roles, default scan paths, and workspace-scoped catalogs.
- **Skill asset flow**: S3-compatible zip upload, `SKILL.md` extraction, metadata indexing, search/filter, table view, detail view, file tree preview, metadata editing, and deletion.
- **Validation foundation**: recursive `SKILL.md` scanning, official frontmatter checks, slug validation, description checks, local-link validation, duplicate checks, and obvious secret pattern detection.
- **CLI foundation**: local scan, validate, list, show, create, asset scan, asset validate, asset create, and API-backed zip upload.

Important gaps for the target MVP:

- **Quota is not modeled**: upload size has a process-level cap, but there is no per-user, per-workspace, per-asset, daily upload, or total storage quota.
- **Uploaded zips need stronger validation**: upload parsing verifies that a zip contains `SKILL.md`, but it should run the same structural/security checks as local scans and persist validation issues.
- **No activation/distribution event**: the product has preview, but no first-class "download", "copy install command", "copy Codex install path", or usage event to prove reuse.
- **No SaaS-grade persistence**: accounts, sessions, workspace metadata, and asset indexes are local JSON files, which is good for self-hosting/demo but not enough for hosted operation.
- **No operations dashboard**: there is no admin view for signups, activated workspaces, asset counts, storage usage, failed uploads, quota hits, or over-limit users.
- **Role enforcement is incomplete**: many asset actions only require workspace access; hosted SaaS should explicitly gate mutation by role.
- **No hosted onboarding funnel**: signup does not yet drive users through the exact activation path of uploading/importing three valid skills and installing one.
- **Open-source launch surface is thin**: the README is usable, but launch still needs deployment docs, environment templates, contributor docs, license clarity, and a SaaS CTA.

## North Star Metric

**Activated Workspace**

A workspace is activated when, within 7 days of creation, it has:

1. At least **3 valid Skill assets**.
2. At least **1 distribution action** on any Skill.

A distribution action can be one of:

- Download skill zip.
- Copy install command.
- Copy target install path.
- Copy hosted asset URL, if public sharing is later enabled.

This metric is sharper than signup count because it proves the core loop: skill supply, validation trust, catalog discovery, and practical reuse.

## Supporting Metrics

### Activation Funnel

Track conversion through:

1. Visit SaaS landing page.
2. Sign up.
3. Create or enter workspace.
4. Upload or import first Skill.
5. Pass validation.
6. Reach 3 valid Skills.
7. Preview a Skill.
8. Perform first distribution action.

### Supply And Quality

- Valid Skill assets per activated workspace.
- Upload/import success rate.
- Validation pass rate.
- Top validation error codes.
- Secret-risk detection count.
- Duplicate content hash count.
- Assets with owner, tags, and lifecycle state filled in.

### Usage And Retention

- Weekly active workspaces.
- Week-2 activated workspace retention.
- Skill preview count.
- Distribution action count.
- Repeat upload/import count.
- Workspaces that update or delete assets after first activation.

### OSS Funnel

- GitHub visitors, stars, forks, and issues.
- Docs quickstart completions.
- CLI install/download attempts.
- Self-host deployment attempts.
- SaaS signup clicks from README/docs.

### Cost Guardrails

- Storage bytes per workspace.
- Asset count per workspace.
- Average uploaded zip size.
- Upload attempts per user per day.
- Failed uploads by reason.
- Quota hit count.
- Object storage cost estimate.

## Free Plan Limits

Initial hosted-free limits:

- **Users**: 1 account can create up to 3 workspaces.
- **Workspaces**: 1 workspace can store up to 50 assets.
- **Storage**: 1 workspace can store up to 500 MB total.
- **Asset size**: 1 uploaded zip can be up to 10 MB.
- **Upload rate**: 1 account can upload up to 100 files per day.
- **Members**: 1 workspace can have up to 5 members.

Over-limit behavior:

- Block the write action before uploading to object storage when possible.
- Show the exact limit, current usage, and remediation.
- Offer "join waitlist" or "contact us" instead of a paid checkout in MVP.
- Keep reads, preview, download, and delete available while over limit.

## P0 Launch TODO

### 1. Product Activation Loop

- [ ] Add an onboarding checklist to the Skills page: upload/import 3 Skills, fix validation, preview one, copy install/download once.
- [ ] Add clear empty states with a sample Skill zip and copyable CLI upload example.
- [ ] Add a first-class distribution action on Skill detail: download zip and copy install instructions.
- [ ] Track distribution events so activation can be measured.
- [ ] Show activation progress at workspace level.

### 2. Quota And Usage Enforcement

- [ ] Add usage fields for workspace storage bytes, asset count, member count, and daily upload count.
- [ ] Enforce the free limits before creating workspaces, adding members, or accepting uploads.
- [ ] Lower hosted upload cap to 10 MB while keeping self-host override via environment variable.
- [ ] Recalculate usage after upload and delete.
- [ ] Add visible quota meters to workspace settings and upload UI.
- [ ] Add quota-specific API errors with machine-readable codes.

### 3. Hosted SaaS Persistence

- [ ] Replace local JSON state with a hosted database for SaaS deployments.
- [ ] Keep local JSON as a self-host/dev adapter.
- [ ] Store accounts, sessions, workspaces, memberships, asset metadata, validation issues, usage counters, and events in the database.
- [ ] Add migrations and seed data.
- [ ] Add backups or export path for workspace metadata.

### 4. Upload Validation And Storage Safety

- [ ] Run uploaded zips through the same skill validation rules as local scanned skills.
- [ ] Persist validation issues on uploaded assets.
- [ ] Mark uploaded assets as `error`, `warning`, or `valid` from real validation results.
- [ ] Reject zips with path traversal entries or suspicious absolute paths.
- [ ] Add zip-entry count and uncompressed-size limits to reduce zip-bomb risk.
- [ ] Keep stored objects private by default and serve downloads through authorized API routes.
- [ ] Make delete idempotent when the S3 object is already missing.

### 5. Authorization And SaaS Safety

- [ ] Require owner/admin for workspace settings, member changes, asset metadata edits, uploads, and deletes.
- [ ] Allow member/viewer read-only access according to role.
- [ ] Add rate limiting for auth and upload endpoints.
- [ ] Add email verification or an explicit MVP invite-code gate before broad public signup.
- [ ] Add password reset or document that auth is temporary if using an external auth provider soon.
- [ ] Add request logging with workspace/account IDs and no secrets.

### 6. Metrics And Operations

- [ ] Define an event schema for signup, workspace created, upload started, upload failed, upload succeeded, validation failed, preview opened, install copied, zip downloaded, quota hit, and delete.
- [ ] Add an internal admin page or script for activation, storage, quota, and failed-upload reports.
- [ ] Add weekly metric export for activated workspaces, valid assets, distribution actions, and W2 retention.
- [ ] Alert on upload failure spikes and storage growth.
- [ ] Track GitHub-to-SaaS funnel links with UTM parameters.

### 7. Open-Source Launch Readiness

- [ ] Add license file and confirm intended OSS license.
- [ ] Add `.env.example` for local API, S3/R2/MinIO, max upload bytes, and state adapter.
- [ ] Add Docker or Docker Compose path for self-hosting.
- [ ] Split README into quickstart, self-hosting, hosted SaaS, CLI, and development sections.
- [ ] Add `CONTRIBUTING.md` with local setup, checks, and skill-standard expectations.
- [ ] Add `SECURITY.md` for vulnerability reports and secret-handling expectations.
- [ ] Add example Skill zip fixtures for demos and tests.

## P1 TODO

### 1. Import Sources

- [ ] Import a Skill from a GitHub repository path.
- [ ] Import from a zip URL with server-side fetch and validation.
- [ ] Scan a connected repository for candidate `SKILL.md` files.
- [ ] Preserve source repo, branch, commit, and path on imported assets.

### 2. Versioning And Releases

- [ ] Add asset version records instead of overwriting the same logical asset.
- [ ] Add release notes and changelog fields.
- [ ] Show diff between versions.
- [ ] Track consumers pinned to a version after distribution actions exist.

### 3. Review Workflow

- [ ] Add draft/reviewed/approved lifecycle for uploaded Skills.
- [ ] Require owner/admin approval before a Skill becomes stable.
- [ ] Add validation report history.
- [ ] Add comments or review notes only after the core activation loop works.

### 4. Better Distribution

- [ ] Add a CLI command to install a hosted Skill into a local Codex skills directory.
- [ ] Add signed short-lived download URLs or API-token based download.
- [ ] Add copy snippets for Codex and Claude-compatible installation paths.
- [ ] Add workspace API tokens for CI or automation.

## Launch Checklist

### Product

- [ ] New user can sign up without help.
- [ ] New user can create a workspace.
- [ ] New user can upload 3 valid Skills in under 10 minutes.
- [ ] User can see validation status and fix obvious issues.
- [ ] User can preview `SKILL.md` and bundled files.
- [ ] User can download or copy install instructions for a Skill.
- [ ] User can understand quota usage before hitting a hard block.

### Engineering

- [ ] `npm run check` passes.
- [ ] `npm run build` passes.
- [ ] Upload tests cover missing `SKILL.md`, invalid frontmatter, secret-like content, too-large zip, path traversal, duplicate hash, quota exceeded, and S3 failure rollback.
- [ ] Auth tests cover login, signup, logout, role-gated reads, role-gated writes, and session invalidation after password change.
- [ ] Delete tests cover metadata removal, S3 deletion, and missing-object recovery.
- [ ] SaaS database migrations are repeatable from an empty database.

### Operations

- [ ] Hosted object storage bucket is private.
- [ ] Production environment variables are documented and checked at boot.
- [ ] Admin can see workspaces, users, asset count, storage bytes, quota hits, and upload failures.
- [ ] Error logs include enough context to debug without exposing zip contents or secrets.
- [ ] Backups or exports exist for metadata.
- [ ] Terms/privacy pages or temporary MVP equivalents exist before public signup.

### Open Source

- [ ] Repository has license, contribution guide, security policy, and clear roadmap.
- [ ] README explains the difference between self-hosted OSS and hosted SaaS.
- [ ] Local self-host quickstart works from a clean checkout.
- [ ] Example Skills demonstrate the official `SKILL.md` standard plus `harhub.yaml` registry metadata.
- [ ] GitHub issue templates collect bug reports and feature requests.

## MVP Acceptance Criteria

The MVP is ready for a public free launch when:

1. A new external user can create a hosted account, create a workspace, upload 3 valid Skills, preview one, and perform a distribution action in under 10 minutes.
2. Quotas are enforced for workspace count, asset count, asset size, total storage, members, and daily uploads.
3. The team can see activated workspaces, storage usage, quota hits, upload failures, and distribution actions.
4. The open-source repo can be self-hosted from documented steps without private infrastructure.
5. Uploaded Skill zips are private by default and are only downloaded through authorized routes.
6. The product stays Skills-only; no rules, MCP governance, bundle composition, or PR automation are required for MVP launch.

## First Four-Week Milestone

Target:

- 10 activated hosted workspaces.
- At least 3 activated workspaces from non-friend external users.
- 30+ valid Skill assets.
- 10+ distribution actions.
- Less than 10% upload failure rate after excluding intentional invalid-file tests.

If this milestone is missed, inspect the funnel in this order:

1. Do users understand what a Skill is?
2. Can they find or create 3 Skills worth uploading?
3. Are validation errors blocking or teaching?
4. Is installation/download useful enough to count as reuse?
5. Are quota limits too tight or merely unclear?

## Decisions Needed

- [ ] Final free-plan limits.
- [ ] Hosted database choice.
- [ ] Hosted object storage provider.
- [ ] Auth provider versus built-in auth for MVP.
- [ ] OSS license.
- [ ] Public signup timing: open signup, invite code, or waitlist.
- [ ] First distribution target: Codex local skills path, Claude-compatible path, or generic zip download.
