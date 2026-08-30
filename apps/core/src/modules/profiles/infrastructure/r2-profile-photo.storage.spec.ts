import { R2ProfilePhotoStorage } from './r2-profile-photo.storage';

describe('R2ProfilePhotoStorage', () => {
  it('presigns one short-lived GET for the exact sanitized object key', async () => {
    const storage = new R2ProfilePhotoStorage({
      accessKeyId: 'test-access-key',
      bucket: 'test-profile-media',
      endpoint: 'https://example.r2.cloudflarestorage.com',
      secretAccessKey: 'test-secret-key',
      timeoutMilliseconds: 5_000,
    });

    const signed = new URL(
      await storage.createPresignedGet({
        expiresInSeconds: 60,
        key: 'profile-media/61000000-0000-4000-8000-000000000003.webp',
      }),
    );

    expect(decodeURIComponent(signed.pathname)).toBe(
      '/test-profile-media/profile-media/61000000-0000-4000-8000-000000000003.webp',
    );
    expect(signed.searchParams.get('X-Amz-Expires')).toBe('60');
    expect(signed.toString()).not.toContain('test-secret-key');
  });

  it('presigns one short-lived PUT for the exact random quarantine key and content type', async () => {
    const storage = new R2ProfilePhotoStorage({
      accessKeyId: 'test-access-key',
      bucket: 'test-profile-media',
      endpoint: 'https://example.r2.cloudflarestorage.com',
      secretAccessKey: 'test-secret-key',
      timeoutMilliseconds: 5_000,
    });

    const signed = new URL(
      await storage.createPresignedPut({
        contentType: 'image/png',
        expiresInSeconds: 600,
        key: 'profile-quarantine/61000000-0000-4000-8000-000000000003',
      }),
    );

    expect(signed.origin).toBe('https://example.r2.cloudflarestorage.com');
    expect(decodeURIComponent(signed.pathname)).toBe(
      '/test-profile-media/profile-quarantine/61000000-0000-4000-8000-000000000003',
    );
    expect(signed.searchParams.get('X-Amz-Expires')).toBe('600');
    expect(signed.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    expect(signed.toString()).not.toContain('test-secret-key');
  });

  it('stops streaming an object as soon as the byte limit is exceeded', async () => {
    const storage = new R2ProfilePhotoStorage({
      accessKeyId: 'test-access-key',
      bucket: 'test-profile-media',
      endpoint: 'https://example.r2.cloudflarestorage.com',
      secretAccessKey: 'test-secret-key',
      timeoutMilliseconds: 5_000,
    });
    let yieldedChunks = 0;
    const body = {
      async *[Symbol.asyncIterator]() {
        for (const bytes of [Buffer.alloc(4), Buffer.alloc(4), Buffer.alloc(4)]) {
          await Promise.resolve();
          yieldedChunks += 1;
          yield bytes;
        }
      },
      transformToByteArray: () => Promise.resolve(new Uint8Array(12)),
    };
    const client = storage as unknown as {
      client: { send: () => Promise<{ Body: typeof body }> };
    };
    client.client.send = jest.fn().mockResolvedValue({ Body: body });

    await expect(storage.getObject('profile-quarantine/test', 6)).rejects.toThrow(
      'R2_PROFILE_PHOTO_TOO_LARGE',
    );
    expect(yieldedChunks).toBe(2);
  });
});
