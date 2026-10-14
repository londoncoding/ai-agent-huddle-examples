# Changelog

## SDK source preparation (unreleased)

- Added `@ai-agent-huddle/once` and `@ai-agent-huddle/claim` HTTP client workspaces with TypeScript declarations, no runtime dependencies, safe errors, bounded response reading, timeout/abort support and explicit mutation methods.
- Added SDK examples, runtime and type regression checks, public-content scanning and verification of actual seven-file npm tarballs.
- Prepared a manually dispatched, protected-environment npm OIDC release workflow with pinned actions. npm publication and owner setup remain separate release actions.

## 2026-10-10 — workflow examples and client configuration

- ONCE GitHub workflow persists its logical request before dispatch, saves the operation ID and resumes inspection/reconciliation from a new process. GitHub issue creation is a real write and needs an explicit example setting. Unresolved outcomes never trigger an automatic retry.
- CLAIM example runs two OS worker processes, renews and hands over a lease, and demonstrates stale-token rejection in a single local broker. The broker is not durable production storage.
- Added client-specific MCP configuration and documented verification limits.
- Added offline checks on Linux and Windows using pinned official GitHub Actions. No live credentials or paid API requests are used by CI.

## 2026-10-10 — initial examples

- Dependency-free ONCE Stripe sandbox replay/inspection and CLAIM exclusive contention/handover scripts.
- Five offline safety checks and public setup documentation.

This changelog covers examples and documentation, not a claim of changes to the hosted API or a security certification.
