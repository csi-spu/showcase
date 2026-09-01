import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const HOST = '127.0.0.1';
const PORT = 4191;
const ROOT = path.join(process.cwd(), 'test-results', 'local-media-provider');
const ALLOWED_ORIGINS = new Set([
  'http://127.0.0.1:3001',
  'http://127.0.0.1:3002',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3000',
]);

interface LocalMediaProviderOptions {
  root?: string;
}

class LocalMediaBodyTooLargeError extends Error {}

export function createLocalMediaProviderServer(options: LocalMediaProviderOptions = {}) {
  const root = options.root ?? ROOT;
  return createServer((request, response) => {
    void handleRequest(request, response, root).catch((error: unknown) =>
      send(
        response,
        error instanceof LocalMediaBodyTooLargeError ? 413 : 500,
        error instanceof LocalMediaBodyTooLargeError
          ? 'LOCAL_MEDIA_TOO_LARGE'
          : 'LOCAL_MEDIA_ERROR',
      ),
    );
  });
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  root: string,
): Promise<void> {
  const origin = typeof request.headers.origin === 'string' ? request.headers.origin : null;
  if (origin !== null && ALLOWED_ORIGINS.has(origin)) {
    response.setHeader('access-control-allow-origin', origin);
    response.setHeader('access-control-allow-credentials', 'false');
    response.setHeader('vary', 'origin');
  }
  if (request.method === 'OPTIONS') {
    response.setHeader('access-control-allow-headers', 'content-type');
    response.setHeader('access-control-allow-methods', 'DELETE,GET,OPTIONS,PUT');
    send(response, 204);
    return;
  }
  if (request.url === '/health') {
    send(response, 200, 'ok');
    return;
  }
  const match = /^\/objects\/([A-Za-z0-9_-]+)$/u.exec(request.url ?? '');
  if (match === null || match[1] === undefined) {
    send(response, 404, 'NOT_FOUND');
    return;
  }
  const key = Buffer.from(match[1], 'base64url').toString('utf8');
  const objectPath = safeObjectPath(root, key);
  if (objectPath === null) {
    send(response, 404, 'NOT_FOUND');
    return;
  }
  if (request.method === 'PUT') {
    const body = await readBody(request, 5 * 1_024 * 1_024);
    await mkdir(path.dirname(objectPath), { recursive: true });
    await writeFile(objectPath, body, { flag: 'w' });
    send(response, 200, 'ok');
    return;
  }
  if (request.method === 'GET') {
    try {
      const body = await readFile(objectPath);
      response.setHeader('content-length', body.byteLength);
      response.setHeader(
        'content-type',
        key.endsWith('.webp') ? 'image/webp' : 'application/octet-stream',
      );
      send(response, 200, body);
    } catch {
      send(response, 404, 'NOT_FOUND');
    }
    return;
  }
  if (request.method === 'DELETE') {
    await rm(objectPath, { force: true });
    send(response, 204);
    return;
  }
  send(response, 405, 'METHOD_NOT_ALLOWED');
}

function safeObjectPath(root: string, key: string): string | null {
  if (key.length === 0 || key.length > 512 || key.includes('\\') || key.includes('\0')) return null;
  const objectPath = path.resolve(root, key);
  return objectPath.startsWith(`${path.resolve(root)}${path.sep}`) ? objectPath : null;
}

async function readBody(request: IncomingMessage, maximumBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.byteLength;
    if (size > maximumBytes) throw new LocalMediaBodyTooLargeError();
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, size);
}

function send(response: ServerResponse, status: number, body?: string | Buffer): void {
  response.statusCode = status;
  response.end(body);
}

if (process.argv[1]?.endsWith('local-media-provider.ts') === true) {
  const server = createLocalMediaProviderServer();
  server.listen(PORT, HOST, () =>
    process.stdout.write(`local media provider ready on ${HOST}:${PORT}\n`),
  );
}
