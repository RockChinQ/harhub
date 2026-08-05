# Security Policy

## Supported versions

Harhub is currently in beta. Security fixes are applied to the latest commit on `main` and the latest published beta release; older beta builds are not supported.

## Reporting a vulnerability

Do not open a public GitHub issue for a suspected vulnerability. Report it privately through GitHub Security Advisories:

1. Open the Harhub repository's **Security** tab.
2. Select **Report a vulnerability**.
3. Include the affected version or commit, reproduction steps, impact, and any suggested mitigation.

Maintainers will acknowledge a complete report within 3 business days and provide a remediation status within 7 business days. Please allow a reasonable remediation window before public disclosure.

## Beta security boundary

The hosted beta is intended for design-partner evaluation, not regulated or highly sensitive workloads. Harhub:

- reads supported AI-harness files from repositories authorized through the GitHub App;
- stores workspace/account metadata in PostgreSQL and uploaded versioned asset files in S3-compatible object storage;
- does not intentionally clone or retain unrelated repository source files during GitHub inventory;
- can open pull requests only after an explicit user action;
- records workspace audit events for important asset and repository operations.

Do not upload credentials, production secrets, customer data, or proprietary source code inside Skill archives or MCP configuration files. Use environment-variable placeholders for MCP secrets.

## Operational limitations

The hosted beta does not currently promise a contractual SLA, a fixed retention period, point-in-time restore, or customer-initiated workspace export. Infrastructure backups may exist for service recovery, but they are not a substitute for keeping authoritative assets in Git. Repository contents and Harhub-generated pull requests remain the durable source of truth.
