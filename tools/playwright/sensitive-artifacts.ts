import { inflateRawSync } from 'node:zlib';
import { appendFileSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

export const SENSITIVE_VALUES_PATH = path.join('test-results', '.sensitive-values.jsonl');

const MAX_ZIP_ENTRY_BYTES = 20 * 1_024 * 1_024;
const MAX_ARTIFACT_FILE_BYTES = 100 * 1_024 * 1_024;

export function registerSensitiveValues(
  values: Array<string | null | undefined>,
  registryPath = SENSITIVE_VALUES_PATH,
): void {
  const retained = values.filter(
    (value): value is string => typeof value === 'string' && value.length >= 4,
  );
  if (retained.length === 0) return;
  mkdirSync(path.dirname(registryPath), { recursive: true, mode: 0o700 });
  appendFileSync(registryPath, `${JSON.stringify(retained)}\n`, { encoding: 'utf8', mode: 0o600 });
}

export function sanitizeSensitiveArtifacts(options: {
  artifactDirectories: string[];
  knownValues: string[];
  registryPath?: string;
}): number {
  const registryPath = options.registryPath ?? SENSITIVE_VALUES_PATH;
  const values = new Set(options.knownValues.filter((value) => value.length >= 4));
  try {
    for (const line of readFileSync(registryPath, 'utf8').split(/\r?\n/u)) {
      if (line.length === 0) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        throw new Error('E2E_ARTIFACT_REGISTRY_INVALID');
      }
      if (!Array.isArray(parsed)) continue;
      for (const value of parsed)
        if (typeof value === 'string' && value.length >= 4) values.add(value);
    }
  } catch (error: unknown) {
    if (!isMissingFile(error)) throw error;
  }

  let removed = 0;
  for (const directory of options.artifactDirectories) {
    for (const file of listFiles(directory)) {
      if (path.resolve(file) === path.resolve(registryPath)) continue;
      if (statSync(file).size > MAX_ARTIFACT_FILE_BYTES) {
        rmSync(file, { force: true });
        removed += 1;
        continue;
      }
      const body = readFileSync(file);
      if (
        containsSensitiveValue(body, [...values]) ||
        containsSensitiveZipEntry(body, [...values])
      ) {
        rmSync(file, { force: true });
        removed += 1;
      }
    }
  }
  rmSync(registryPath, { force: true });
  return removed;
}

export function containsSensitiveValue(body: Buffer, values: string[]): boolean {
  return variants(values).some((value) => body.includes(Buffer.from(value)));
}

export function containsSensitiveZipEntry(body: Buffer, values: string[]): boolean {
  const endOffset = findEndOfCentralDirectory(body);
  if (endOffset === -1) return false;
  const entryCount = body.readUInt16LE(endOffset + 10);
  let offset = body.readUInt32LE(endOffset + 16);
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > body.length || body.readUInt32LE(offset) !== 0x02014b50) return false;
    const method = body.readUInt16LE(offset + 10);
    const compressedSize = body.readUInt32LE(offset + 20);
    const uncompressedSize = body.readUInt32LE(offset + 24);
    const nameLength = body.readUInt16LE(offset + 28);
    const extraLength = body.readUInt16LE(offset + 30);
    const commentLength = body.readUInt16LE(offset + 32);
    const localOffset = body.readUInt32LE(offset + 42);
    if (uncompressedSize <= MAX_ZIP_ENTRY_BYTES && localOffset + 30 <= body.length) {
      const localNameLength = body.readUInt16LE(localOffset + 26);
      const localExtraLength = body.readUInt16LE(localOffset + 28);
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = body.subarray(dataOffset, dataOffset + compressedSize);
      try {
        const entry = method === 0 ? compressed : method === 8 ? inflateRawSync(compressed) : null;
        if (entry !== null && containsSensitiveValue(entry, values)) return true;
      } catch {
        return false;
      }
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return false;
}

function variants(values: string[]): string[] {
  const result = new Set<string>();
  for (const value of values) {
    if (value.length < 4) continue;
    result.add(value);
    result.add(encodeURIComponent(value));
    result.add(Buffer.from(value).toString('base64'));
    result.add(Buffer.from(value).toString('base64url'));
  }
  return [...result];
}

function findEndOfCentralDirectory(body: Buffer): number {
  const minimum = Math.max(0, body.length - 65_557);
  for (let offset = body.length - 22; offset >= minimum; offset -= 1) {
    if (body.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  return -1;
}

function listFiles(directory: string): string[] {
  try {
    return readdirSync(directory).flatMap((entry) => {
      const target = path.join(directory, entry);
      return statSync(target).isDirectory() ? listFiles(target) : [target];
    });
  } catch (error: unknown) {
    if (isMissingFile(error)) return [];
    throw error;
  }
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
