import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveStoreOrigin } from '../src/stichos/hosting.ts';

test('Pages has a deliberate disabled store without probing nonexistent API paths', () => {
  const pages = { protocol: 'https:', origin: 'https://sabino.pro', hostname: 'sabino.pro' };
  assert.equal(resolveStoreOrigin(pages), null);
  assert.equal(resolveStoreOrigin(pages, '.'), pages.origin);
  assert.equal(resolveStoreOrigin(pages, 'https://api.sabino.pro'), 'https://api.sabino.pro');
  for (const endpoint of [
    'http://api.sabino.pro',
    'https://u:p@api.sabino.pro',
    'https://api.sabino.pro/private',
    'https://api.sabino.pro?key=secret',
    'not an origin',
  ])
    assert.equal(resolveStoreOrigin(pages, endpoint), null);
});

test('the local game still reaches its prepared local payment server', () => {
  const local = { protocol: 'http:', origin: 'http://localhost:4174', hostname: 'localhost' };
  assert.equal(resolveStoreOrigin(local), 'http://localhost:4175');
  assert.equal(resolveStoreOrigin(local, 'http://localhost:4188'), 'http://localhost:4188');
});
