// Invoked only by the owner-approved GitHub release job, never by local checks.
import './check-release.mjs';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Use the protected GitHub release job.');
assert.equal(process.env.GITHUB_WORKFLOW, 'Publish reviewed SDK');
assert.ok(!process.env.NODE_AUTH_TOKEN, 'Release must use OIDC, not an npm token.');
assert.ok(!process.env.NPM_TOKEN, 'Release must use OIDC, not an npm token.');
const product = /^refs\/tags\/(once|claim)-v/.exec(process.env.GITHUB_REF)[1];
const root = fileURLToPath(new URL('../', import.meta.url));
const version = JSON.parse(readFileSync(join(root, 'packages', product, 'package.json'), 'utf8')).version;
const tarball = join(root, '.local', 'packages', `ai-agent-huddle-${product}-${version}.tgz`);
const npmCli = process.env.npm_execpath ?? join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
execFileSync(process.execPath, [npmCli, 'publish', tarball, '--access', 'public', '--ignore-scripts', '--registry=https://registry.npmjs.org/'], { cwd: root, stdio: 'inherit' });
