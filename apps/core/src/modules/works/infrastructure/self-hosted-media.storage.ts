import { createHmac, timingSafeEqual } from 'node:crypto';
import type { WorkMediaContentType, WorkMediaStorage } from '../application/work-media.ports';

const MAX_KEY_LENGTH = 512;
const REQUEST_TIMEOUT_MS = 5_000;

export class SelfHostedMediaStorage implements WorkMediaStorage {
  private readonly baseUrl: string;
  private readonly publicBaseUrl: string;

  constructor(
    baseUrl: string,
    publicBaseUrl: string,
    private readonly signingSecret: string,
  ) {
    this.baseUrl = new URL(baseUrl).origin.replace(/\/$/u, '');
    this.publicBaseUrl = new URL(publicBaseUrl).origin.replace(/\/$/u, '');
  }

  createPresignedGet(input: { expiresInSeconds: number; key: string }): Promise<string> {
    return Promise.resolve(
      this.signedUrl(this.publicBaseUrl, 'GET', input.key, input.expiresInSeconds),
    );
  }

  createInternalPresignedGet(input: { expiresInSeconds: number; key: string }): Promise<string> {
    return Promise.resolve(this.signedUrl(this.baseUrl, 'GET', input.key, input.expiresInSeconds));
  }

  createPublicUrl(input: { key: string }): string {
    const encoded = Buffer.from(input.key, 'utf8').toString('base64url');
    if (encoded.length > MAX_KEY_LENGTH) throw new Error('MEDIA_KEY_INVALID');
    return `${this.publicBaseUrl}/objects/${encoded}`;
  }

  createPresignedPut(input: {
    contentType: WorkMediaContentType;
    expiresInSeconds: number;
    key: string;
  }): Promise<string> {
    void input.contentType;
    return Promise.resolve(
      this.signedUrl(this.publicBaseUrl, 'PUT', input.key, input.expiresInSeconds),
    );
  }

  async deleteObject(key: string): Promise<void> {
    const response = await fetch(this.signedUrl(this.baseUrl, 'DELETE', key, 60), {
      method: 'DELETE',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok && response.status !== 404) throw new Error('MEDIA_DELETE_FAILED');
  }

  async getObject(key: string, maximumBytes: number): Promise<Buffer> {
    const response = await fetch(this.signedUrl(this.baseUrl, 'GET', key, 60), {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error('MEDIA_GET_FAILED');
    const length = response.headers.get('content-length');
    if (length !== null && Number(length) > maximumBytes) throw new Error('MEDIA_TOO_LARGE');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > maximumBytes) throw new Error('MEDIA_TOO_LARGE');
    return bytes;
  }

  async putObject(input: { body: Buffer; contentType: 'image/webp'; key: string }): Promise<void> {
    const response = await fetch(this.signedUrl(this.baseUrl, 'PUT', input.key, 60), {
      body: new Uint8Array(input.body),
      headers: { 'content-type': input.contentType },
      method: 'PUT',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error('MEDIA_PUT_FAILED');
  }

  private signedUrl(base: string, method: string, key: string, expiresInSeconds: number): string {
    if (key.length === 0 || key.length > MAX_KEY_LENGTH) throw new Error('MEDIA_KEY_TOO_LONG');
    const expires = Math.floor(Date.now() / 1_000) + Math.max(1, Math.floor(expiresInSeconds));
    const encodedKey = Buffer.from(key, 'utf8').toString('base64url');
    const signature = createHmac('sha256', this.signingSecret)
      .update(`${method}\n${key}\n${expires}`)
      .digest('base64url');
    return `${base}/objects/${encodedKey}?expires=${expires}&signature=${signature}`;
  }
}

export function verifyMediaSignature(
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
