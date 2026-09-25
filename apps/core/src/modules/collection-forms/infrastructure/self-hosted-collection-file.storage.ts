/*
 * Private object storage for collection files, backed by the self-hosted media
 * service.
 *
 * Collection files are private documents, so this deliberately offers no
 * unsigned public URL. Every read is a short-lived signed GET that Core issues
 * only after it has authorized the caller for that one file. Browser-facing
 * signed URLs use the public media origin; server-side storage operations keep
 * using the private service origin.
 */

import { createHmac } from 'node:crypto';
import { Readable } from 'node:stream';
import type { CollectionFileStorage } from '../application/collection-forms.ports';

const MAX_KEY_LENGTH = 512;
const REQUEST_TIMEOUT_MS = 10_000;
/*
 * Export transfers are minutes, not seconds: an archive of a whole group is
 * orders of magnitude larger than a single document.
 */
const EXPORT_UPLOAD_TIMEOUT_MS = 15 * 60 * 1_000;
const EXPORT_UPLOAD_TIMEOUT_SECONDS = EXPORT_UPLOAD_TIMEOUT_MS / 1_000;

export class SelfHostedCollectionFileStorage implements CollectionFileStorage {
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

  createPresignedPut(input: {
    contentType: string;
    expiresInSeconds: number;
    key: string;
  }): Promise<string> {
    return Promise.resolve(
      this.signedUrl(this.publicBaseUrl, 'PUT', input.key, input.expiresInSeconds),
    );
  }

  createPresignedGet(input: { expiresInSeconds: number; key: string }): Promise<string> {
    return Promise.resolve(
      this.signedUrl(this.publicBaseUrl, 'GET', input.key, input.expiresInSeconds),
    );
  }

  async deleteObject(key: string): Promise<void> {
    const response = await fetch(this.signedUrl(this.baseUrl, 'DELETE', key, 60), {
      method: 'DELETE',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    /* Already gone is the state the caller wanted, so it is not an error. */
    if (!response.ok && response.status !== 404) throw new Error('COLLECTION_FILE_DELETE_FAILED');
  }

  async getObject(key: string, maximumBytes: number): Promise<Buffer> {
    const response = await fetch(this.signedUrl(this.baseUrl, 'GET', key, 60), {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error('COLLECTION_FILE_GET_FAILED');

    /*
     * Checked before and after reading: the header is a hint that may be absent
     * or wrong, so the real length is enforced against the bytes themselves.
     */
    const length = response.headers.get('content-length');
    if (length !== null && Number(length) > maximumBytes) {
      throw new Error('COLLECTION_FILE_TOO_LARGE');
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > maximumBytes) throw new Error('COLLECTION_FILE_TOO_LARGE');
    return bytes;
  }

  /**
   * Streams bytes into storage.
   *
   * The generated archive is never held whole: `fetch` consumes the async
   * iterable as the ZIP writer produces it, and `duplex: 'half'` is what lets
   * a streaming body be sent at all. The timeout is generous because a large
   * export legitimately takes minutes.
   */
  async putObjectStream(input: {
    body: AsyncIterable<Buffer>;
    contentType: string;
    key: string;
  }): Promise<number> {
    let byteSize = 0;
    const counted = async function* (): AsyncGenerator<Uint8Array> {
      for await (const chunk of input.body) {
        byteSize += chunk.byteLength;
        yield new Uint8Array(chunk);
      }
    };
    const response = await fetch(
      this.signedUrl(this.baseUrl, 'PUT', input.key, EXPORT_UPLOAD_TIMEOUT_SECONDS),
      {
        body: Readable.from(counted()) as unknown as BodyInit,
        /* Node requires this to send a body it has not fully buffered. */
        duplex: 'half',
        headers: { 'content-type': input.contentType },
        method: 'PUT',
        signal: AbortSignal.timeout(EXPORT_UPLOAD_TIMEOUT_MS),
      } as RequestInit & { duplex: 'half' },
    );
    if (!response.ok) throw new Error('COLLECTION_EXPORT_PUT_FAILED');
    return byteSize;
  }

  /**
   * Streams bytes out of storage.
   *
   * Used to copy one submitted document into an archive, so the document's
   * bytes pass through in chunks rather than being assembled first.
   */
  async *getObjectStream(key: string): AsyncIterable<Buffer> {
    const response = await fetch(this.signedUrl(this.baseUrl, 'GET', key, 60), {
      signal: AbortSignal.timeout(EXPORT_UPLOAD_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error('COLLECTION_FILE_GET_FAILED');
    if (response.body === null) return;
    for await (const chunk of response.body) {
      yield Buffer.from(chunk);
    }
  }

  private signedUrl(
    baseUrl: string,
    method: string,
    key: string,
    expiresInSeconds: number,
  ): string {
    if (key.length === 0 || key.length > MAX_KEY_LENGTH) {
      throw new Error('COLLECTION_FILE_KEY_INVALID');
    }
    const expires = Math.floor(Date.now() / 1_000) + Math.max(1, Math.floor(expiresInSeconds));
    const encodedKey = Buffer.from(key, 'utf8').toString('base64url');
    const signature = createHmac('sha256', this.signingSecret)
      .update(`${method}\n${key}\n${expires}`)
      .digest('base64url');
    return `${baseUrl}/objects/${encodedKey}?expires=${expires}&signature=${signature}`;
  }
}
