import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const ref = process.env.GITHUB_REF ?? '';
const match = /^refs\/tags\/(once|claim)-v(\d+\.\d+\.\d+)$/.exec(ref);
assert.ok(match, 'Release must run against an explicit product version tag.');
assert.equal(process.env.GITHUB_REPOSITORY, 'londoncoding/ai-agent-huddle-examples', 'Release repository does not match npm provenance metadata.');
const [, product, version] = match;
const metadata = JSON.parse(readFileSync(new URL(`../packages/${product}/package.json`, import.meta.url), 'utf8'));
assert.equal(metadata.version, version, 'Tag must match package version.');
assert.equal(metadata.name, `@ai-agent-huddle/${product}`);
// Fixed validated strings only. The workflow never interpolates raw tag input into a shell.
console.log(`product=${product}`);
