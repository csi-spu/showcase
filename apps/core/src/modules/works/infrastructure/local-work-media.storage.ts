import type { WorkMediaContentType, WorkMediaStorage } from '../application/work-media.ports';

const MAX_URL_KEY_LENGTH = 512;

/**
 * Local-only provider adapter used by the deterministic browser harness.
 * The provider is a separate process so browser uploads still use the exact
 * Core-issued presign/finalize flow without an R2 account or a Core test route.
 */
export class LocalWorkMediaStorage implements WorkMediaStorage {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    const url = new URL(baseUrl);
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) {
      throw new Error('LOCAL_MEDIA_PROVIDER_MUST_BE_LOOPBACK');
    }
    this.baseUrl = url.origin;
  }

  createPresignedGet(input: { expiresInSeconds: number; key: string }): Promise<string> {
    void input.expiresInSeconds;
    return Promise.resolve(this.objectUrl(input.key));
  }

  createPublicUrl(input: { key: string }): string {
    return this.objectUrl(input.key);
  }

  createPresignedPut(input: {
    contentType: WorkMediaContentType;
    expiresInSeconds: number;
    key: string;
  }): Promise<string> {
    void input.contentType;
    void input.expiresInSeconds;
    return Promise.resolve(this.objectUrl(input.key));
  }

  async deleteObject(key: string): Promise<void> {
    const response = await fetch(this.objectUrl(key), {
      method: 'DELETE',
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok && response.status !== 404) throw new Error('LOCAL_MEDIA_DELETE_FAILED');
  }

  async getObject(key: string, maximumBytes: number): Promise<Buffer> {
    const response = await fetch(this.objectUrl(key), {
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error('LOCAL_MEDIA_GET_FAILED');
    const contentLength = response.headers.get('content-length');
    if (contentLength !== null && Number(contentLength) > maximumBytes) {
      throw new Error('LOCAL_MEDIA_TOO_LARGE');
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > maximumBytes) throw new Error('LOCAL_MEDIA_TOO_LARGE');
    return bytes;
  }

  async putObject(input: { body: Buffer; contentType: 'image/webp'; key: string }): Promise<void> {
    const response = await fetch(this.objectUrl(input.key), {
      body: new Uint8Array(input.body),
      headers: { 'content-type': input.contentType },
      method: 'PUT',
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error('LOCAL_MEDIA_PUT_FAILED');
  }

  private objectUrl(key: string): string {
    const encoded = Buffer.from(key, 'utf8').toString('base64url');
    if (encoded.length > MAX_URL_KEY_LENGTH) throw new Error('LOCAL_MEDIA_KEY_TOO_LONG');
    return `${this.baseUrl}/objects/${encoded}`;
  }
}
