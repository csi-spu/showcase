import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createE2ESourceAddress } from './source-address.ts';

test('creates stable documentation-only IPv6 addresses per scenario and actor', () => {
  assert.equal(createE2ESourceAddress('0123456789ab', 1), '2001:db8:0123:4567:89ab::1');
  assert.equal(createE2ESourceAddress('0123456789ab', 2), '2001:db8:0123:4567:89ab::2');
});

test('rejects values outside the fixture-owned format', () => {
  assert.throws(() => createE2ESourceAddress('not-hex', 1), /E2E_SOURCE_ADDRESS_INPUT_INVALID/u);
  assert.throws(
    () => createE2ESourceAddress('0123456789ab', 0),
    /E2E_SOURCE_ADDRESS_INPUT_INVALID/u,
  );
});
