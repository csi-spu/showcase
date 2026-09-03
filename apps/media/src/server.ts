import './instrument.js';

import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { flushMediaSentry, reportMediaError } from './sentry.js';

const MAX_OBJECT_BYTES = 5 * 1_024 * 1_024;

interface MediaServerOptions {
  allowedUploadOrigin: string;
  reportError?: (error: unknown) => void;
  root: string;
  signingSecret: string;
}

export function createMediaServer(options: MediaServerOptions) {
  return createServer((request, response) => {
    void handleRequest(request, response, options).catch((error: unknown) => {
      if (!(error instanceof BodyTooLargeError)) {
        (options.reportError ?? reportMediaError)(error);
      }
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
  options: MediaServerOptions,
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
  const objectPath = safeObjectPath(options.root, key);
  if (objectPath === null) return send(response, 404, 'NOT_FOUND');

  if (method === 'OPTIONS') {
    return handleUploadPreflight(request, response, options, key);
  }

  const origin = singleHeader(request.headers.origin);
  if (method === 'PUT' && origin !== undefined) {
    if (origin !== options.allowedUploadOrigin) return send(response, 403, 'ORIGIN_FORBIDDEN');
    allowUploadOrigin(response, origin);
  }
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

function handleUploadPreflight(
  request: IncomingMessage,
  response: ServerResponse,
  options: MediaServerOptions,
  key: string,
): void {
  const origin = singleHeader(request.headers.origin);
  const requestedMethod = singleHeader(request.headers['access-control-request-method']);
  const requestedHeaders =
    singleHeader(request.headers['access-control-request-headers'])
      ?.split(',')
      .map((header) => header.trim().toLowerCase()) ?? [];
  if (
    origin !== options.allowedUploadOrigin ||
    requestedMethod !== 'PUT' ||
    requestedHeaders.some((header) => header !== 'content-type')
  ) {
    send(response, 403, 'ORIGIN_FORBIDDEN');
    return;
  }
  const url = new URL(request.url ?? '/', 'http://media.internal');
  if (
    !verifySignature(
      options.signingSecret,
      requestedMethod,
      key,
      url.searchParams.get('expires'),
      url.searchParams.get('signature'),
    )
  ) {
    send(response, 403, 'INVALID_SIGNATURE');
    return;
  }
  allowUploadOrigin(response, origin);
  response.setHeader('access-control-allow-methods', 'PUT');
  response.setHeader('access-control-allow-headers', 'Content-Type');
  send(response, 204);
}

function allowUploadOrigin(response: ServerResponse, origin: string): void {
  response.setHeader('access-control-allow-origin', origin);
  response.setHeader('vary', 'Origin');
}

function singleHeader(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
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
  const studentUrl = process.env.STUDENT_URL;
  if (studentUrl === undefined) throw new Error('STUDENT_URL_REQUIRED');
  const allowedUploadOrigin = new URL(studentUrl).origin;
  if (allowedUploadOrigin !== studentUrl) throw new Error('STUDENT_URL_MUST_BE_AN_ORIGIN');
  const port = Number(process.env.PORT ?? '4191');
  const server = createMediaServer({
    allowedUploadOrigin,
    root: process.env.STORAGE_ROOT ?? '/data',
    signingSecret: secret,
  });
  server.listen(port, process.env.HOST ?? '0.0.0.0');

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      server.close(() => {
        void flushMediaSentry();
      });
    });
  }
}
