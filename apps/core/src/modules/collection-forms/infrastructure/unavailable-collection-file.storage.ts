import type { CollectionFileStorage } from '../application/collection-forms.ports';

/**
 * Stands in when no media service is configured.
 *
 * Every call fails loudly. Nothing here pretends an upload succeeded, so a
 * deployment without storage cannot quietly accept documents it never stored.
 */
export class UnavailableCollectionFileStorage implements CollectionFileStorage {
  createPresignedPut(_input: {
    contentType: string;
    expiresInSeconds: number;
    key: string;
  }): Promise<string> {
    void _input;
    return Promise.reject(new Error('COLLECTION_FILE_STORAGE_UNAVAILABLE'));
  }

  createPresignedGet(_input: { expiresInSeconds: number; key: string }): Promise<string> {
    void _input;
    return Promise.reject(new Error('COLLECTION_FILE_STORAGE_UNAVAILABLE'));
  }

  deleteObject(_key: string): Promise<void> {
    void _key;
    return Promise.reject(new Error('COLLECTION_FILE_STORAGE_UNAVAILABLE'));
  }

  getObject(_key: string, _maximumBytes: number): Promise<Buffer> {
    void _key;
    void _maximumBytes;
    return Promise.reject(new Error('COLLECTION_FILE_STORAGE_UNAVAILABLE'));
  }
}
