import { LocalWorkMediaStorage } from './local-work-media.storage';

describe('LocalWorkMediaStorage', () => {
  it('issues loopback object URLs without embedding provider credentials', async () => {
    const storage = new LocalWorkMediaStorage('http://127.0.0.1:4191');
    const key = 'work-quarantine/asset-123';

    await expect(
      storage.createPresignedPut({ contentType: 'image/png', expiresInSeconds: 600, key }),
    ).resolves.toBe(`http://127.0.0.1:4191/objects/${Buffer.from(key).toString('base64url')}`);
    await expect(storage.createPresignedGet({ expiresInSeconds: 600, key })).resolves.toContain(
      '/objects/',
    );
  });

  it.each(['https://example.com', 'http://192.168.1.5:4191'])(
    'rejects non-loopback provider %s',
    (url) => {
      expect(() => new LocalWorkMediaStorage(url)).toThrow('LOCAL_MEDIA_PROVIDER_MUST_BE_LOOPBACK');
    },
  );
});
