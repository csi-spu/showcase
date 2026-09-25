import { SelfHostedCollectionFileStorage } from './self-hosted-collection-file.storage';

describe('SelfHostedCollectionFileStorage', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date('2026-09-26T00:00:00Z')));
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('signs browser upload and download URLs against the public media origin', async () => {
    const storage = new SelfHostedCollectionFileStorage(
      'http://media:4191',
      'https://media.example.test',
      'test-signing-secret-that-is-at-least-32-bytes',
    );
    const key = 'collection-files/00000000-0000-4000-8000-000000000000';

    const upload = new URL(
      await storage.createPresignedPut({
        contentType: 'application/pdf',
        expiresInSeconds: 60,
        key,
      }),
    );
    const download = new URL(await storage.createPresignedGet({ expiresInSeconds: 60, key }));

    expect(upload.origin).toBe('https://media.example.test');
    expect(download.origin).toBe('https://media.example.test');
    expect(upload.toString()).not.toContain('test-signing-secret');
  });

  it('keeps server-side storage operations on the private media origin', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));
    const storage = new SelfHostedCollectionFileStorage(
      'http://media:4191',
      'https://media.example.test',
      'test-signing-secret-that-is-at-least-32-bytes',
    );

    await storage.deleteObject('collection-files/00000000-0000-4000-8000-000000000000');

    const request = fetchSpy.mock.calls[0]?.[0];
    if (request === undefined) throw new Error('PRIVATE_MEDIA_REQUEST_MISSING');
    const requestUrl =
      typeof request === 'string' ? request : request instanceof URL ? request.href : request.url;
    expect(new URL(requestUrl).origin).toBe('http://media:4191');
  });
});
