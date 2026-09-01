import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  containsSensitiveValue,
  containsSensitiveZipEntry,
  registerSensitiveValues,
  sanitizeSensitiveArtifacts,
} from './sensitive-artifacts.ts';

test('detects plain, URL-encoded, and base64 sensitive values without returning them', () => {
  const secret = 'student/credential+value';
  assert.equal(containsSensitiveValue(Buffer.from(`prefix ${secret} suffix`), [secret]), true);
  assert.equal(containsSensitiveValue(Buffer.from(encodeURIComponent(secret)), [secret]), true);
  assert.equal(
    containsSensitiveValue(Buffer.from(Buffer.from(secret).toString('base64')), [secret]),
    true,
  );
  assert.equal(containsSensitiveValue(Buffer.from('safe diagnostic'), [secret]), false);
});

test('detects sensitive values inside a Playwright-style ZIP artifact', () => {
  const secret = 'private-session-cookie';
  assert.equal(containsSensitiveZipEntry(createStoredZip('trace.trace', secret), [secret]), true);
  assert.equal(
    containsSensitiveZipEntry(createStoredZip('trace.trace', 'safe diagnostic'), [secret]),
    false,
  );
});

test('removes only unsafe artifacts and deletes the private registry', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'showcase-artifacts-'));
  const artifacts = path.join(root, 'artifacts');
  const registry = path.join(root, '.sensitive-values.jsonl');
  const unsafe = path.join(artifacts, 'unsafe.txt');
  const safe = path.join(artifacts, 'safe.txt');
  try {
    mkdirSync(artifacts, { recursive: true });
    registerSensitiveValues(['private-student-id'], registry);
    writeFileSync(unsafe, 'private-student-id');
    writeFileSync(safe, 'bounded public diagnostic');

    assert.equal(
      sanitizeSensitiveArtifacts({
        artifactDirectories: [artifacts],
        knownValues: [],
        registryPath: registry,
      }),
      1,
    );
    assert.throws(() => readFileSync(unsafe), /ENOENT/u);
    assert.equal(readFileSync(safe, 'utf8'), 'bounded public diagnostic');
    assert.throws(() => readFileSync(registry), /ENOENT/u);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

function createStoredZip(name: string, content: string): Buffer {
  const nameBytes = Buffer.from(name);
  const contentBytes = Buffer.from(content);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt32LE(contentBytes.length, 18);
  local.writeUInt32LE(contentBytes.length, 22);
  local.writeUInt16LE(nameBytes.length, 26);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt32LE(contentBytes.length, 20);
  central.writeUInt32LE(contentBytes.length, 24);
  central.writeUInt16LE(nameBytes.length, 28);

  const centralOffset = local.length + nameBytes.length + contentBytes.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + nameBytes.length, 12);
  end.writeUInt32LE(centralOffset, 16);

  return Buffer.concat([local, nameBytes, contentBytes, central, nameBytes, end]);
}
