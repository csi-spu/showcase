import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createLocalMediaProviderServer } from './local-media-provider.ts';

test('local media provider persists, reads, and idempotently deletes only safe object keys', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'showcase-local-media-'));
  const server = createLocalMediaProviderServer({ root });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address !== null && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const key = 'work-media/fixture/master.webp';
  const objectUrl = `${baseUrl}/objects/${Buffer.from(key).toString('base64url')}`;

  try {
    assert.equal((await fetch(`${baseUrl}/health`)).status, 200);
    assert.equal(
      (
        await fetch(objectUrl, {
          body: Buffer.from('deterministic-media'),
          method: 'PUT',
        })
      ).status,
      200,
    );
    const storedResponse = await fetch(objectUrl);
    assert.equal(storedResponse.status, 200);
    assert.equal(storedResponse.headers.get('content-type'), 'image/webp');
    assert.equal(await storedResponse.text(), 'deterministic-media');
    assert.equal(await readFile(path.join(root, key), 'utf8'), 'deterministic-media');

    assert.equal((await fetch(objectUrl, { method: 'DELETE' })).status, 204);
    assert.equal((await fetch(objectUrl, { method: 'DELETE' })).status, 204);
    assert.equal((await fetch(objectUrl)).status, 404);

    const traversal = Buffer.from('../outside').toString('base64url');
    assert.equal((await fetch(`${baseUrl}/objects/${traversal}`)).status, 404);
    assert.equal(
      (
        await fetch(objectUrl, {
          body: Buffer.alloc(5 * 1_024 * 1_024 + 1),
          method: 'PUT',
        })
      ).status,
      413,
    );
    assert.equal((await fetch(objectUrl)).status, 404);
  } finally {
    server.close();
    await once(server, 'close');
    await rm(root, { force: true, recursive: true });
  }
});
