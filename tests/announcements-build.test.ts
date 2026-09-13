import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
// @ts-ignore Node executes this build-only ESM helper directly.
import { readBuildMetadata } from '../scripts/build-metadata.mjs';

test('build identity comes from the actual repository revision and package version', () => {
  const value = readBuildMetadata();
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  assert.equal(value.revision, revision);
  assert.equal(value.version, '0.1.0');
  assert.match(value.sourceDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(typeof value.modified, 'boolean');
});

test('a source archive without git is honestly identified as unversioned', () => {
  const value = readBuildMetadata('/');
  assert.equal(value.revision, 'unversioned');
  assert.equal(value.modified, true);
  assert.equal(value.sourceDate, '');
});
