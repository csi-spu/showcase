import { R2WorkMediaStorage } from './r2-work-media.storage';

describe('R2WorkMediaStorage', () => {
  it('presigns exact short-lived PUT and GET operations without exposing credentials', async () => {
    const storage = createStorage();
    const key = 'work-quarantine/65000000-0000-4000-8000-000000000007';

    const put = new URL(
      await storage.createPresignedPut({
        contentType: 'image/png',
        expiresInSeconds: 600,
        key,
      }),
    );
    const get = new URL(await storage.createPresignedGet({ expiresInSeconds: 600, key }));

    for (const signed of [put, get]) {
      expect(signed.origin).toBe('https://example.r2.cloudflarestorage.com');
      expect(decodeURIComponent(signed.pathname)).toBe(`/test-work-media/${key}`);
      expect(signed.searchParams.get('X-Amz-Expires')).toBe('600');
      expect(signed.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
      expect(signed.toString()).not.toContain('test-secret-key');
    }
    expect(put.searchParams.get('X-Amz-Signature')).not.toBe(
      get.searchParams.get('X-Amz-Signature'),
    );
  });

  it('stops reading as soon as streamed bytes exceed the authoritative limit', async () => {
    const storage = createStorage();
    let yieldedChunks = 0;
    const body = {
      async *[Symbol.asyncIterator]() {
        for (const bytes of [Buffer.alloc(4), Buffer.alloc(4), Buffer.alloc(4)]) {
          await Promise.resolve();
          yieldedChunks += 1;
          yield bytes;
        }
      },
    };
    const client = storage as unknown as {
      client: { send: () => Promise<{ Body: typeof body }> };
    };
    client.client.send = jest.fn().mockResolvedValue({ Body: body });

    await expect(storage.getObject('work-quarantine/test', 6)).rejects.toThrow(
      'R2_WORK_MEDIA_TOO_LARGE',
    );
    expect(yieldedChunks).toBe(2);
  });
});

function createStorage(): R2WorkMediaStorage {
  return new R2WorkMediaStorage({
    accessKeyId: 'test-access-key',
    bucket: 'test-work-media',
    endpoint: 'https://example.r2.cloudflarestorage.com',
    secretAccessKey: 'test-secret-key',
    timeoutMilliseconds: 5_000,
  });
}
