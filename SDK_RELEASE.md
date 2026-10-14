# SDK maintenance and release

The root remains private. Only `packages/once` and `packages/claim` are publishable. Both are Node.js 22+ ESM clients with TypeScript declarations, no runtime dependencies and no install scripts. The build copies public HTTP client code into each package; it does not access another repository.

```sh
npm ci --ignore-scripts
npm run build
npm test
npm run test:types
npm run verify:packages
```

`verify:packages` builds and scans the public checkout, creates **actual npm tarballs**, inspects every member against a seven-file allowlist, scans those bytes, verifies metadata, and imports each packed client with a synthetic HTTP error. The tarballs are in ignored `.local/packages`. The scan is a heuristic: independent security review of the public diff and packed contents is a release gate. Local mock checks do not certify hosted service behavior.

Runnable SDK examples after local installation and build:

```sh
node --env-file=.env sdk-examples/once.mjs
node --env-file=.env sdk-examples/claim.mjs
```

The original dependency-free examples still run without npm installation. SDK examples use workspace package links locally and work with installed npm packages after publication.

## One-time owner setup

1. Verify control of the npm `ai-agent-huddle` scope, enable account 2FA, and confirm neither package name is already occupied by someone else. This repository does not claim npm availability or ownership.
2. Review each tarball and bootstrap its first version interactively with an authorized npm owner account and 2FA. npm trusted-publisher configuration requires the package to exist; never store an npm publishing token in this repository or workflow. First publication is a separate owner action, not performed by these checks.
3. Create GitHub environment `npm-release` with required reviewers, no self-approval and deployment restrictions permitting only the intended product version tags. Restrict who can create or replace those tags and protect the default branch.
4. For each npm package, configure GitHub trusted publishing for owner `londoncoding`, repository `ai-agent-huddle-examples`, workflow filename `publish-sdk.yml` and environment `npm-release`. Explicitly allow direct `npm publish`. New trust configurations must complete a successful publish within 2 days; set this up when the next reviewed version is ready. After OIDC is proven, restrict traditional token publishing in npm settings.
5. Bump a package version in a reviewed commit, create its matching `once-vX.Y.Z` or `claim-vX.Y.Z` tag, and manually dispatch `publish-sdk.yml` **against that tag**. Dispatching a branch fails closed. Approve the protected environment after checking the verified revision. The publish job recreates and verifies tarballs, then publishes the selected exact archive. No release runs from pull requests or automatic tag pushes. Each product releases independently.

The publish job has `contents: read` and `id-token: write`; verification has no OIDC permission. Actions use verified full commit pins, checkout does not retain a repository credential, dependency install scripts and release caches are disabled, and no npm write token is used. The compiler and workspace development dependencies run only in verification; the publish job rebuilds and inspects packages using our dependency-free scripts. npm 11.15.0 is pinned for OIDC (npm requires at least 11.5.1, Node at least 22.14). npm automatically attaches provenance for trusted publishing from GitHub-hosted runners. npm account, scope availability, protected environment and publisher settings must be verified separately; the workflow alone cannot configure them.

Sources checked 2026-10-14: [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/), [npm trust prerequisites](https://docs.npmjs.com/cli/v11/commands/npm-trust/), [setup-node guidance](https://github.com/actions/setup-node/blob/main/docs/advanced-usage.md).
