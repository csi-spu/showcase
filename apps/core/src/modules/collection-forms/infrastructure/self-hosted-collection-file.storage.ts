/*
 * Private object storage for collection files, backed by the self-hosted media
 * service.
 *
 * Collection files are private documents, so this deliberately offers no
 * unsigned public URL. Every read is a short-lived signed GET that Core issues
 * only after it has authorized the caller for that one file, and the signed URL
 * is served from the internal origin rather than the public media origin.
 */

import { createHmac } from 'node:crypto';
import type { CollectionFileStorage } from '../application/collection-forms.ports';

const MAX_KEY_LENGTH = 512;
const REQUEST_TIMEOUT_MS = 10_000;

export class SelfHostedCollectionFileStorage implements CollectionFileStorage {
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly signingSecret: string,
  ) {
    this.baseUrl = new URL(baseUrl).origin.replace(/\/$/u, '');
  }

  createPresignedPut(input: {
    contentType: string;
    expiresInSeconds: number;
    key: string;
  }): Promise<string> {
    return Promise.resolve(this.signedUrl('PUT', input.key, input.expiresInSeconds));
  }

  createPresignedGet(input: { expiresInSeconds: number; key: string }): Promise<string> {
    return Promise.resolve(this.signedUrl('GET', input.key, input.expiresInSeconds));
  }

  async deleteObject(key: string): Promise<void> {
    const response = await fetch(this.signedUrl('DELETE', key, 60), {
      method: 'DELETE',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    /* Already gone is the state the caller wanted, so it is not an error. */
    if (!response.ok && response.status !== 404) throw new Error('COLLECTION_FILE_DELETE_FAILED');
  }

  async getObject(key: string, maximumBytes: number): Promise<Buffer> {
    const response = await fetch(this.signedUrl('GET', key, 60), {
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

  private signedUrl(method: string, key: string, expiresInSeconds: number): string {
    if (key.length === 0 || key.length > MAX_KEY_LENGTH) {
      throw new Error('COLLECTION_FILE_KEY_INVALID');
    }
    const expires = Math.floor(Date.now() / 1_000) + Math.max(1, Math.floor(expiresInSeconds));
    const encodedKey = Buffer.from(key, 'utf8').toString('base64url');
    const signature = createHmac('sha256', this.signingSecret)
      .update(`${method}\n${key}\n${expires}`)
      .digest('base64url');
    return `${this.baseUrl}/objects/${encodedKey}?expires=${expires}&signature=${signature}`;
  }
}
