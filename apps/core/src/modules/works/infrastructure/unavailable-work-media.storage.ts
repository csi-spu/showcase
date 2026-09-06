import type { WorkMediaContentType, WorkMediaStorage } from '../application/work-media.ports';

export class UnavailableWorkMediaStorage implements WorkMediaStorage {
  createPresignedGet(_input: { expiresInSeconds: number; key: string }): Promise<string> {
    void _input;
    return Promise.reject(new Error('MEDIA_WORK_UNAVAILABLE'));
  }

  createPublicUrl(_input: { key: string }): string {
    void _input;
    throw new Error('MEDIA_WORK_UNAVAILABLE');
  }

  createPresignedPut(_input: {
    contentType: WorkMediaContentType;
    expiresInSeconds: number;
    key: string;
  }): Promise<string> {
    void _input;
    return Promise.reject(new Error('MEDIA_WORK_UNAVAILABLE'));
  }
  deleteObject(_key: string): Promise<void> {
    void _key;
    return Promise.reject(new Error('MEDIA_WORK_UNAVAILABLE'));
  }
  getObject(_key: string, _maximumBytes: number): Promise<Buffer> {
    void _key;
    void _maximumBytes;
    return Promise.reject(new Error('MEDIA_WORK_UNAVAILABLE'));
  }
  putObject(_input: { body: Buffer; contentType: 'image/webp'; key: string }): Promise<void> {
    void _input;
    return Promise.reject(new Error('MEDIA_WORK_UNAVAILABLE'));
  }
}
