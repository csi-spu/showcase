import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const MAX_OBJECT_BYTES = 5 * 1_024 * 1_024;

export function createMediaServer(options: { root: string; signingSecret: string }) {
  return createServer((request, response) => {
    void handleRequest(request, response, options).catch((error: unknown) => {
      send(
        response,
        error instanceof BodyTooLargeError ? 413 : 500,
        error instanceof BodyTooLargeError ? 'MEDIA_TOO_LARGE' : 'MEDIA_ERROR',
      );
    });
  });
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: { root: string; signingSecret: string },
): Promise<void> {
  if (request.url === '/health') {
    send(response, 200, 'ok');
    return;
  }
  const url = new URL(request.url ?? '/', 'http://media.internal');
  const match = /^\/objects\/([A-Za-z0-9_-]+)$/u.exec(url.pathname);
  const method = request.method ?? '';
  if (match?.[1] === undefined) return send(response, 404, 'NOT_FOUND');
  const key = Buffer.from(match[1], 'base64url').toString('utf8');
  if (
    !verifySignature(
      options.signingSecret,
      method,
      key,
      url.searchParams.get('expires'),
      url.searchParams.get('signature'),
    )
  ) {
    return send(response, 403, 'INVALID_SIGNATURE');
  }
  const objectPath = safeObjectPath(options.root, key);
  if (objectPath === null) return send(response, 404, 'NOT_FOUND');

  if (method === 'PUT') {
    const body = await readBody(request, MAX_OBJECT_BYTES);
    await mkdir(path.dirname(objectPath), { recursive: true });
    await writeFile(objectPath, body, { flag: 'w' });
    return send(response, 200, 'ok');
  }
  if (method === 'GET') {
    try {
      const body = await readFile(objectPath);
      response.setHeader('content-length', body.byteLength);
      response.setHeader(
        'content-type',
        key.endsWith('.webp') ? 'image/webp' : 'application/octet-stream',
      );
      response.setHeader(
        'cache-control',
        key.startsWith('work-media/') ? 'public, max-age=300' : 'private, no-store',
      );
      return send(response, 200, body);
    } catch {
      return send(response, 404, 'NOT_FOUND');
    }
  }
  if (method === 'DELETE') {
    await rm(objectPath, { force: true });
    return send(response, 204);
  }
  send(response, 405, 'METHOD_NOT_ALLOWED');
}

export function verifySignature(
  secret: string,
  method: string,
  key: string,
  expires: string | null,
  signature: string | null,
): boolean {
  if (expires === null || signature === null) return false;
  const timestamp = Number(expires);
  if (!Number.isSafeInteger(timestamp) || timestamp < Math.floor(Date.now() / 1_000)) return false;
  const expected = createHmac('sha256', secret).update(`${method}\n${key}\n${timestamp}`).digest();
  const actual = Buffer.from(signature, 'base64url');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function safeObjectPath(root: string, key: string): string | null {
  if (key.length === 0 || key.length > 512 || key.includes('\\') || key.includes('\0')) return null;
  const objectPath = path.resolve(root, key);
  return objectPath.startsWith(`${path.resolve(root)}${path.sep}`) ? objectPath : null;
}

class BodyTooLargeError extends Error {}

async function readBody(request: IncomingMessage, maximumBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.byteLength;
    if (size > maximumBytes) throw new BodyTooLargeError();
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, size);
}

function send(response: ServerResponse, status: number, body?: string | Buffer): void {
  response.statusCode = status;
  response.end(body);
}

if (process.argv[1]?.endsWith('server.js') === true) {
  const secret = process.env.MEDIA_SERVICE_HMAC_SECRET;
  if (secret === undefined || secret.length < 32)
    throw new Error('MEDIA_SERVICE_HMAC_SECRET_REQUIRED');
  const port = Number(process.env.PORT ?? '4191');
  createMediaServer({ root: process.env.STORAGE_ROOT ?? '/data', signingSecret: secret }).listen(
    port,
    process.env.HOST ?? '0.0.0.0',
  );
}
