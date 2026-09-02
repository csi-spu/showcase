import { SelfHostedMediaStorage, verifyMediaSignature } from './self-hosted-media.storage';

describe('SelfHostedMediaStorage', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date('2026-09-01T00:00:00Z')));
  afterEach(() => jest.useRealTimers());

  it('signs method, key, and a short expiry without exposing the secret', async () => {
    const storage = new SelfHostedMediaStorage(
      'https://media.internal.test',
      'https://media.example.test',
      'test-signing-secret-that-is-at-least-32-bytes',
    );
    const key = 'work-quarantine/asset-id';
    const url = new URL(
      await storage.createPresignedPut({ contentType: 'image/png', expiresInSeconds: 600, key }),
    );

    expect(url.origin).toBe('https://media.example.test');
    expect(url.toString()).not.toContain('test-signing-secret');
    expect(
      verifyMediaSignature(
        'test-signing-secret-that-is-at-least-32-bytes',
        'PUT',
        key,
        url.searchParams.get('expires'),
        url.searchParams.get('signature'),
      ),
    ).toBe(true);
    expect(
      verifyMediaSignature(
        'test-signing-secret-that-is-at-least-32-bytes',
        'GET',
        key,
        url.searchParams.get('expires'),
        url.searchParams.get('signature'),
      ),
    ).toBe(false);
  });

  it('signs presigned GET requests against the private service origin', async () => {
    const storage = new SelfHostedMediaStorage(
      'https://media.internal.test',
      'https://media.example.test',
      'test-signing-secret-that-is-at-least-32-bytes',
    );
    const url = new URL(
      await storage.createPresignedGet({
        expiresInSeconds: 60,
        key: 'work-media/asset/master.webp',
      }),
    );

    expect(url.origin).toBe('https://media.internal.test');
  });

  it('rejects expired and tampered signatures', async () => {
    const secret = 'test-signing-secret-that-is-at-least-32-bytes';
    const storage = new SelfHostedMediaStorage(
      'https://media.internal.test',
      'https://media.example.test',
      secret,
    );
    const key = 'work-media/asset/master.webp';
    const url = new URL(await storage.createPresignedGet({ expiresInSeconds: 10, key }));
    jest.advanceTimersByTime(11_000);

    expect(
      verifyMediaSignature(
        secret,
        'GET',
        key,
        url.searchParams.get('expires'),
        url.searchParams.get('signature'),
      ),
    ).toBe(false);
    expect(
      verifyMediaSignature(
        secret,
        'GET',
        `${key}-tampered`,
        url.searchParams.get('expires'),
        url.searchParams.get('signature'),
      ),
    ).toBe(false);
  });
});
