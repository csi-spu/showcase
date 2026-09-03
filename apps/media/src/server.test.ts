import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createHmac } from 'node:crypto';
import { createMediaServer } from './server.js';

const SECRET = 'test-signing-secret-that-is-at-least-32-bytes';
const STUDENT_ORIGIN = 'https://student.example.test';

test('rejects expired and tampered URLs and caches public media for five minutes', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'showcase-media-'));
  const server = createMediaServer({
    allowedUploadOrigin: STUDENT_ORIGIN,
    root,
    signingSecret: SECRET,
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string')
    throw new Error('MEDIA_TEST_ADDRESS_MISSING');
  const origin = `http://127.0.0.1:${address.port}`;
  const key = 'work-media/asset/master.webp';
  try {
    const put = signedUrl(origin, 'PUT', key, Math.floor(Date.now() / 1_000) + 60);
    assert.equal(
      (await fetch(put, { body: new Uint8Array([1, 2, 3]), method: 'PUT' })).status,
      200,
    );
    const get = signedUrl(origin, 'GET', key, Math.floor(Date.now() / 1_000) + 60);
    const response = await fetch(get);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'public, max-age=300');
    assert.equal((await fetch(`${get}tampered`)).status, 403);
    assert.equal(
      (await fetch(signedUrl(origin, 'GET', key, Math.floor(Date.now() / 1_000) - 1))).status,
      403,
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error === undefined ? resolve() : reject(error))),
    );
    await rm(root, { force: true, recursive: true });
  }
});

test('allows a valid signed browser upload from the configured Student origin', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'showcase-media-'));
  const server = createMediaServer({
    allowedUploadOrigin: STUDENT_ORIGIN,
    root,
    signingSecret: SECRET,
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string')
    throw new Error('MEDIA_TEST_ADDRESS_MISSING');
  const origin = `http://127.0.0.1:${address.port}`;
  const key = 'profile-quarantine/photo-id';
  const put = signedUrl(origin, 'PUT', key, Math.floor(Date.now() / 1_000) + 60);
  try {
    const preflight = await fetch(put, {
      headers: {
        'access-control-request-headers': 'content-type',
        'access-control-request-method': 'PUT',
        origin: STUDENT_ORIGIN,
      },
      method: 'OPTIONS',
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), STUDENT_ORIGIN);
    assert.equal(preflight.headers.get('access-control-allow-methods'), 'PUT');
    assert.equal(preflight.headers.get('access-control-allow-headers'), 'Content-Type');
    assert.equal(preflight.headers.get('vary'), 'Origin');

    const tamperedPreflight = await fetch(`${put}tampered`, {
      headers: {
        'access-control-request-headers': 'content-type',
        'access-control-request-method': 'PUT',
        origin: STUDENT_ORIGIN,
      },
      method: 'OPTIONS',
    });
    assert.equal(tamperedPreflight.status, 403);

    const upload = await fetch(put, {
      body: new Uint8Array([1, 2, 3]),
      headers: { 'content-type': 'image/jpeg', origin: STUDENT_ORIGIN },
      method: 'PUT',
    });
    assert.equal(upload.status, 200);
    assert.equal(upload.headers.get('access-control-allow-origin'), STUDENT_ORIGIN);
    assert.equal(upload.headers.get('vary'), 'Origin');
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error === undefined ? resolve() : reject(error))),
    );
    await rm(root, { force: true, recursive: true });
  }
});

test('rejects browser upload preflight from an unconfigured origin', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'showcase-media-'));
  const server = createMediaServer({
    allowedUploadOrigin: STUDENT_ORIGIN,
    root,
    signingSecret: SECRET,
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string')
    throw new Error('MEDIA_TEST_ADDRESS_MISSING');
  const origin = `http://127.0.0.1:${address.port}`;
  const put = signedUrl(
    origin,
    'PUT',
    'profile-quarantine/photo-id',
    Math.floor(Date.now() / 1_000) + 60,
  );
  try {
    const response = await fetch(put, {
      headers: {
        'access-control-request-headers': 'content-type',
        'access-control-request-method': 'PUT',
        origin: 'https://attacker.example.test',
      },
      method: 'OPTIONS',
    });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('access-control-allow-origin'), null);

    const upload = await fetch(put, {
      body: new Uint8Array([1, 2, 3]),
      headers: { 'content-type': 'image/jpeg', origin: 'https://attacker.example.test' },
      method: 'PUT',
    });
    assert.equal(upload.status, 403);
    assert.equal(upload.headers.get('access-control-allow-origin'), null);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error === undefined ? resolve() : reject(error))),
    );
    await rm(root, { force: true, recursive: true });
  }
});

test('reports unexpected storage failures but not expected authorization responses', async () => {
  const reportedErrors: unknown[] = [];
  const server = createMediaServer({
    allowedUploadOrigin: STUDENT_ORIGIN,
    reportError: (error) => reportedErrors.push(error),
    root: '/dev/null',
    signingSecret: SECRET,
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string')
    throw new Error('MEDIA_TEST_ADDRESS_MISSING');
  const origin = `http://127.0.0.1:${address.port}`;
  const key = 'work-media/asset/master.webp';
  try {
    const failedUpload = await fetch(
      signedUrl(origin, 'PUT', key, Math.floor(Date.now() / 1_000) + 60),
      { body: new Uint8Array([1]), method: 'PUT' },
    );
    assert.equal(failedUpload.status, 500);
    assert.equal(reportedErrors.length, 1);

    const forbidden = await fetch(`${origin}/objects/${Buffer.from(key).toString('base64url')}`, {
      method: 'GET',
    });
    assert.equal(forbidden.status, 403);
    assert.equal(reportedErrors.length, 1);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error === undefined ? resolve() : reject(error))),
    );
  }
});

function signedUrl(origin: string, method: string, key: string, expires: number): string {
  const signature = createHmac('sha256', SECRET)
    .update(`${method}\n${key}\n${expires}`)
    .digest('base64url');
  return `${origin}/objects/${Buffer.from(key).toString('base64url')}?expires=${expires}&signature=${signature}`;
}
